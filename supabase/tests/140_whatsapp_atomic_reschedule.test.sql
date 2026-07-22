-- Atomic WhatsApp reschedule: the replacement and the cancellation happen in
-- one transaction, so no failure can leave two active appointments.
-- Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

insert into auth.users (id) values ('14000000-0000-4000-8000-0000000000a1');
insert into public.staff_profiles (user_id, role, display_name) values
  ('14000000-0000-4000-8000-0000000000a1', 'owner', 'Reschedule Fixture');

insert into public.humans (id, name, surname) values
  ('14000000-0000-4000-8000-0000000000b1', 'RescheduleFixture', 'Owner'),
  ('14000000-0000-4000-8000-0000000000b2', 'RescheduleFixture', 'Stranger');

insert into public.dogs (id, name, breed, size, human_id) values
  ('14000000-0000-4000-8000-0000000000c1', 'Milo', 'Cockapoo', 'small',
   '14000000-0000-4000-8000-0000000000b1'),
  ('14000000-0000-4000-8000-0000000000c2', 'Nala', 'Beagle', 'small',
   '14000000-0000-4000-8000-0000000000b1'),
  ('14000000-0000-4000-8000-0000000000c3', 'Otto', 'Collie', 'small',
   '14000000-0000-4000-8000-0000000000b2');

-- Two open salon days (Mon/Tue/Wed) far enough out to avoid the same-day rule.
create or replace function pg_temp.open_day(p_offset int)
returns date language plpgsql as $$
declare d date := current_date + p_offset;
begin
  while extract(isodow from d) > 3 loop d := d + 1; end loop;
  return d;
end;
$$;

-- Act as staff so the calendar gate bypasses for the fixture rows, exactly as
-- it does for staff in the app. The RPC under test runs as service role.
select set_config('request.jwt.claims',
  '{"sub":"14000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- The original two-dog visit.
insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d1', pg_temp.open_day(30), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e1', 'whatsapp_flow'),
  ('14000000-0000-4000-8000-0000000000d2', pg_temp.open_day(30), '09:00',
   '14000000-0000-4000-8000-0000000000c2', 'small', 'bath-and-brush', 'Booked',
   '14000000-0000-4000-8000-0000000000e1', 'whatsapp_flow');

-- ── 1-2: the function exists and is locked to the service role ─────

select has_function('public', 'reschedule_whatsapp_booking_group',
  'the atomic reschedule RPC exists');

select is(
  (select count(*)::int from information_schema.role_routine_grants
    where routine_name = 'reschedule_whatsapp_booking_group'
      and grantee in ('anon','authenticated','public')),
  0, 'no application role may execute the reschedule RPC');

-- ── 3-8: the happy path moves the whole visit atomically ───────────

select lives_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom'),
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c2',
                           'slot','10:00','service','bath-and-brush')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e1', null,
      array['14000000-0000-4000-8000-0000000000d1',
            '14000000-0000-4000-8000-0000000000d2']::uuid[])
  $f$, pg_temp.open_day(37)),
  'a well-formed reschedule commits');

select is(
  (select count(*)::int from public.bookings
    where id in ('14000000-0000-4000-8000-0000000000d1',
                 '14000000-0000-4000-8000-0000000000d2')
      and status = 'Cancelled'),
  2, 'every dog on the old visit is cancelled');

select is(
  (select count(*)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'),
  2, 'exactly one live visit remains — never two');

select is(
  (select count(distinct booking_date)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'),
  1, 'the surviving rows are all on the new date');

select is(
  (select cancel_reason from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d1'),
  'Rescheduled via WhatsApp', 'the cancellation records why');

select is(
  (select count(distinct group_id)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'),
  1, 'the replacement rows share one new group');

-- ── 9-12: THE REGRESSION — a failed create must cancel nothing ─────
--
-- The old implementation created first and cancelled second, so a failure
-- left both visits live. Here the create is made to fail (a dog belonging to
-- another customer) and the old visit must survive completely intact.

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d3', pg_temp.open_day(44), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e2', 'whatsapp_flow');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c3',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e2', null, null)
  $f$, pg_temp.open_day(51)),
  '42704', null,
  'a replacement naming another customer''s dog is rejected');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d3'),
  'Booked',
  'REGRESSION: a failed replacement leaves the original booked, not cancelled');

select is(
  (select count(*)::int from public.bookings
    where booking_date = pg_temp.open_day(51)),
  0, 'REGRESSION: a failed replacement creates no new rows');

-- Capacity rejection must roll back identically.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','99:99','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e2', null, null)
  $f$, pg_temp.open_day(51)),
  null, 'an invalid destination slot is rejected');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d3'),
  'Booked', 'REGRESSION: the original survives a destination rejection too');

-- ── 13-15: the reviewed-snapshot guard ─────────────────────────────

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e2', null,
      array['14000000-0000-4000-8000-0000000000d3',
            '14000000-0000-4000-8000-000000000fff']::uuid[])
  $f$, pg_temp.open_day(51)),
  'P0002', 'reschedule_old_visit_changed',
  'a visit that no longer matches the reviewed snapshot is refused');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d3'),
  'Booked', 'the snapshot guard cancels nothing');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-000000000eee', null, null)
  $f$, pg_temp.open_day(51)),
  'P0002', 'reschedule_old_visit_unavailable',
  'an unknown old visit is refused rather than silently creating a booking');

-- ── 16-18: ownership and required arguments ────────────────────────

-- Another customer cannot move this visit, even naming the right group.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c3',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b2',
      '14000000-0000-4000-8000-0000000000e2', null, null)
  $f$, pg_temp.open_day(51)),
  'P0002', 'reschedule_old_visit_unavailable',
  'a different customer cannot move someone else''s visit');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d3'),
  'Booked', 'the cross-customer attempt cancelled nothing');

select throws_ok(
  $$ select public.reschedule_whatsapp_booking_group(
       '[]'::jsonb, current_date + 30, '14000000-0000-4000-8000-0000000000b1',
       null, null, null) $$,
  '22023', null, 'the old visit must be identified');

-- ── 20-23: RPC security ────────────────────────────────────────────

select is(
  (select count(*)::int from information_schema.role_routine_grants
    where routine_name = 'reschedule_whatsapp_booking_group'
      and grantee = 'service_role'),
  1, 'the intended server role can execute it');

select ok(
  (select p.proconfig @> array['search_path=public, pg_temp']
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'reschedule_whatsapp_booking_group' and n.nspname = 'public'),
  'SECURITY DEFINER runs with an explicitly safe search_path');

select ok(
  (select p.prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'reschedule_whatsapp_booking_group' and n.nspname = 'public'),
  'the function is SECURITY DEFINER as intended');

-- A customer session must not be able to reach the RPC at all, which is what
-- stops it being used to bypass the Edge Function's validation.
set local role authenticated;
select throws_ok(
  $$ select public.reschedule_whatsapp_booking_group(
       '[]'::jsonb, current_date + 30, '14000000-0000-4000-8000-0000000000b1',
       '14000000-0000-4000-8000-0000000000e2', null, null) $$,
  '42501', null, 'an authenticated customer cannot execute the RPC');
reset role;

-- ── 24-28: idempotency and duplicate submission ────────────────────

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d4', pg_temp.open_day(58), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e3', 'whatsapp_flow');

create or replace function pg_temp.do_reschedule(p_token text, p_offset int)
returns table (new_ids uuid[], cancelled_ids uuid[], replayed boolean)
language plpgsql as $$
begin
  return query
  select r.new_booking_ids, r.cancelled_booking_ids, r.replayed
    from public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      pg_temp.open_day(p_offset), '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e3', null, null,
      'Rescheduled via WhatsApp', p_token) r;
end;
$$;

select is(
  (select replayed from pg_temp.do_reschedule('tok-dup-1', 65)),
  false, 'the first submission performs the reschedule');

select is(
  (select replayed from pg_temp.do_reschedule('tok-dup-1', 65)),
  true, 'an identical resubmission is answered from the stored receipt');

select is(
  (select count(*)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'
     and b.booking_date = pg_temp.open_day(65)),
  1, 'DUPLICATE: a resubmission creates no second replacement');

select is(
  (select new_ids from pg_temp.do_reschedule('tok-dup-1', 65)),
  (select new_booking_ids from public.whatsapp_reschedule_receipts
    where flow_token = 'tok-dup-1'),
  'the replay returns the original booking ids, not a failure');

select is(
  (select count(*)::int from public.bookings b
    where b.status = 'Booked'
      and b.id = any (
        (select r.new_booking_ids
           from public.whatsapp_reschedule_receipts r
          where r.flow_token = 'tok-dup-1')::uuid[])),
  1, 'DUPLICATE: the replay never cancels the replacement it already made');

-- A retry carrying different details is refused rather than answered with
-- the earlier result.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','11:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e3', null, null,
      'Rescheduled via WhatsApp', 'tok-dup-1')
  $f$, pg_temp.open_day(72)),
  'P0002', 'reschedule_idempotency_conflict',
  'a retry with different details is refused, not silently answered');

-- ── 30-33: source drift and partial-group protection ───────────────

-- A two-dog group named by ONE booking id must resolve to the whole group,
-- never cancel just that dog.
insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d5', pg_temp.open_day(79), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e4', 'whatsapp_flow'),
  ('14000000-0000-4000-8000-0000000000d6', pg_temp.open_day(79), '09:00',
   '14000000-0000-4000-8000-0000000000c2', 'small', 'bath-and-brush', 'Booked',
   '14000000-0000-4000-8000-0000000000e4', 'whatsapp_flow');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      null, '14000000-0000-4000-8000-0000000000d5',
      array['14000000-0000-4000-8000-0000000000d5']::uuid[])
  $f$, pg_temp.open_day(86)),
  'P0002', 'reschedule_old_visit_changed',
  'PARTIAL GROUP: naming one dog of a two-dog group is refused');

select is(
  (select count(*)::int from public.bookings
    where group_id = '14000000-0000-4000-8000-0000000000e4'
      and status = 'Booked'),
  2, 'PARTIAL GROUP: both dogs remain booked after the refusal');

-- Expected ids drawn from two different groups.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e4', null,
      array['14000000-0000-4000-8000-0000000000d5',
            '14000000-0000-4000-8000-0000000000d6',
            '14000000-0000-4000-8000-0000000000d3']::uuid[])
  $f$, pg_temp.open_day(86)),
  'P0002', 'reschedule_old_visit_changed',
  'ids spanning different groups are refused');

-- Staff add a dog after the Flow opened: the reviewed snapshot no longer
-- matches the live group.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e4', null,
      array['14000000-0000-4000-8000-0000000000d5',
            '14000000-0000-4000-8000-0000000000d6',
            '14000000-0000-4000-8000-000000000aaa']::uuid[])
  $f$, pg_temp.open_day(86)),
  'P0002', 'reschedule_old_visit_changed',
  'a staff edit after the Flow opened is refused');

-- ── 34-36: in-place staff edit (same booking IDs) ──────────────────
--
-- Set equality of ids cannot see an edit that keeps the same rows. These
-- prove the material facts are revalidated inside the locked transaction.

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d7', pg_temp.open_day(93), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e5', 'whatsapp_flow');

-- Staff move the SAME booking row to a later slot while the Flow is open.
update public.bookings set slot = '11:00'
 where id = '14000000-0000-4000-8000-0000000000d7';

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e5', null,
      array['14000000-0000-4000-8000-0000000000d7']::uuid[],
      'Rescheduled via WhatsApp', null,
      %L::date, '09:00', null)
  $f$, pg_temp.open_day(100), pg_temp.open_day(93)),
  'P0002', 'reschedule_old_visit_changed',
  'IN-PLACE EDIT: a staff move of the same booking id is refused');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d7'),
  'Booked', 'IN-PLACE EDIT: the edited booking is not moved again');

-- A staff service change on the same row is refused too.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e5', null,
      array['14000000-0000-4000-8000-0000000000d7']::uuid[],
      'Rescheduled via WhatsApp', null,
      %L::date, '11:00',
      jsonb_build_object('14000000-0000-4000-8000-0000000000c1','bath-and-brush'))
  $f$, pg_temp.open_day(100), pg_temp.open_day(93)),
  'P0002', 'reschedule_old_visit_changed',
  'IN-PLACE EDIT: a staff service change is refused');

-- ── 37-41: observable side effects of the internal cancellation ────
--
-- The reschedule reaches the same triggers the previous create-then-cancel
-- implementation reached. These pin what is observable in the database.

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d8', pg_temp.open_day(107), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e6', 'whatsapp_flow');

select lives_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e6', null, null)
  $f$, pg_temp.open_day(114)),
  'the side-effect fixture reschedule commits');

-- The cancellation carries the distinguishing reason. Nothing consumes it
-- today, but it is the hook a future suppression would key on, and it is what
-- separates this row from an ordinary customer cancellation in the record.
select is(
  (select cancel_reason from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d8'),
  'Rescheduled via WhatsApp',
  'the internal cancellation is marked as a reschedule, not a plain cancel');

-- Capacity: released only as part of this transaction, and exactly once.
select is(
  (select count(*)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'
     and b.booking_date in (pg_temp.open_day(107), pg_temp.open_day(114))),
  1, 'capacity moves atomically: one live row across old and new dates');

-- booking_events: the old row records a cancellation and the new row a
-- creation. There is no in-place date change, so no 'rescheduled' event is
-- emitted. This matches the previous implementation exactly.
select is(
  (select count(*)::int from public.booking_events
    where booking_id = '14000000-0000-4000-8000-0000000000d8'
      and event_type = 'cancelled'),
  1, 'exactly one cancellation event for the old row, never one per retry');

select is(
  (select count(*)::int from public.booking_events
    where booking_id = '14000000-0000-4000-8000-0000000000d8'
      and event_type = 'rescheduled'),
  0,
  'no in-place rescheduled event: the move is a cancel plus a create, as before');

-- ── 42-45: durable receipt hardening ──────────────────────────────

select is(
  (select count(*)::int from information_schema.table_privileges
    where table_name = 'whatsapp_reschedule_receipts'
      and grantee in ('anon','authenticated','public')),
  0, 'no application role has any access to the receipt table');

-- One receipt per flow_token (the primary key).
select col_is_pk('public', 'whatsapp_reschedule_receipts', 'flow_token',
  'flow_token is the unique durable receipt key');

-- The committed result is immutable: an accidental update is a loud error.
select throws_ok(
  $$ update public.whatsapp_reschedule_receipts
        set new_booking_ids = '{}'::uuid[] where flow_token = 'tok-dup-1' $$,
  'P0001', 'whatsapp_reschedule_receipts rows are immutable (update not allowed)',
  'a committed receipt cannot be altered');

-- DELETE is permitted so retention pruning can run: a receipt older than the
-- 24h session lifetime can never be replayed against, so removing it is safe.
select lives_ok(
  $$ delete from public.whatsapp_reschedule_receipts where flow_token = 'tok-dup-1' $$,
  'a committed receipt can be pruned for retention but not altered');

select * from finish();
rollback;
