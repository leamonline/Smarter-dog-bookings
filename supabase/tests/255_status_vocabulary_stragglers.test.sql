-- #1005: two functions the September status split missed (migration
-- 20261020100000).
--
-- 1. recompute_legacy_booking_visit must treat No-show as terminal: a visit
--    whose only dog did not show is no longer `active`.
-- 2. suggest_conversation_closures must recognise the current live statuses
--    (Reconfirmed, Arrived, Ready for collection) for booking_confirmed_quiet.
-- 3. No function in `public` names a retired status any more.

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);
\ir fixtures/ensure_local_vault_secrets.psql

insert into auth.users (id) values ('25500000-0000-4000-8000-000000000001');
insert into public.staff_profiles (user_id, role, display_name) values
  ('25500000-0000-4000-8000-000000000001', 'owner', 'Fixture Owner 255');
insert into public.humans (id, name, surname) values
  ('25500000-0000-4000-8000-000000000010', 'Fixture255', 'One');
insert into public.dogs (id, name, breed, size, human_id) values
  ('25500000-0000-4000-8000-000000000011', 'Delta', 'Poodle', 'small',
   '25500000-0000-4000-8000-000000000010'),
  ('25500000-0000-4000-8000-000000000012', 'Echo', 'Beagle', 'small',
   '25500000-0000-4000-8000-000000000010');

select set_config(
  'request.jwt.claims',
  '{"sub":"25500000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- ── 1-2: a No-show visit is not active ──────────────────────────────
insert into public.bookings (id, booking_date, slot, dog_id, size, service, status) values
  ('25500000-0000-4000-8000-000000000101', date '2026-09-07', '08:30',
   '25500000-0000-4000-8000-000000000011', 'small', 'Full Groom', 'Booked');

select isnt(
  (select visit_id from public.bookings where id = '25500000-0000-4000-8000-000000000101'),
  null::uuid, 'the booking has a legacy visit');

-- Describe the state directly (the status-transition rules are not under test
-- here), then run the function under test.
set local session_replication_role = replica;
update public.bookings set status = 'No-show'
 where id = '25500000-0000-4000-8000-000000000101';
set local session_replication_role = origin;
select public.recompute_legacy_booking_visit(
  (select visit_id from public.bookings where id = '25500000-0000-4000-8000-000000000101'));

select is(
  (select v.lifecycle_state from public.booking_visits v
     join public.bookings b on b.visit_id = v.id
    where b.id = '25500000-0000-4000-8000-000000000101'),
  'cancelled',
  'a visit whose only dog was a No-show is no longer active');

-- ── 3-4: booking_confirmed_quiet sees the current live statuses ─────
insert into public.whatsapp_conversations (id, phone_e164, last_inbound_at) values
  ('25500000-0000-4000-8000-000000000201', '+447700900255', now() - interval '8 days');

set local session_replication_role = replica;
insert into public.bookings (id, booking_date, slot, dog_id, size, service, status, whatsapp_conversation_id) values
  ('25500000-0000-4000-8000-000000000102', current_date - 9, '09:00',
   '25500000-0000-4000-8000-000000000012', 'small', 'Full Groom', 'Reconfirmed',
   '25500000-0000-4000-8000-000000000201');
set local session_replication_role = origin;

select ok(
  exists (select 1 from public.suggest_conversation_closures() s
           where s.conversation_id = '25500000-0000-4000-8000-000000000201'
             and s.reason = 'booking_confirmed_quiet'),
  'a quiet conversation with a Reconfirmed booking is suggested as booking_confirmed_quiet');

select is(
  (select closure_suggested_reason from public.whatsapp_conversations
    where id = '25500000-0000-4000-8000-000000000201'),
  'booking_confirmed_quiet',
  'and the suggestion is stored with that reason');

-- ── 5-6: no retired vocabulary anywhere ─────────────────────────────
select is(
  (select string_agg(p.proname, ', ' order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~ '''(Checked in|In bath|Ready for pick-up|Not Arrived)'''),
  null,
  'no public function names a retired booking status');

select ok(
  (select prosrc from pg_proc
    where oid = 'public.recompute_legacy_booking_visit(uuid)'::regprocedure)
    like '%booking_occupies_seat%',
  'recompute_legacy_booking_visit uses the shared occupancy predicate');

select * from finish();
rollback;
