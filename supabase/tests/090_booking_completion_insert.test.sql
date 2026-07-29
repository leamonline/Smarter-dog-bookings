-- Completion side-effects on INSERT (migration 20260709120000).
--
-- A booking INSERTed already in 'Completed' must behave like the
-- Booked -> Completed UPDATE transition: stamp completed_at, recompute the
-- dog's last_groomed_date, and emit a 'completed' booking_events row.
-- A normal 'Booked' insert must trigger none of that.
--
-- The inserts run LIVE (triggers enabled) so the new INSERT triggers and the
-- booking gates all fire: next Monday at 09:00/09:30 passes the calendar gate
-- (open weekday, canonical slots, future date) and an empty day passes
-- capacity. Emitted booking_events rows fire the notify trigger, which reads
-- get_supabase_url() — so provision throwaway Vault secrets (as in 040).
-- One txn, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

\ir fixtures/ensure_local_vault_secrets.psql

-- Fixture: one owner, two dogs (triggers off for these — no gates involved).
set local session_replication_role = replica;
insert into public.humans (id, name, surname)
  values ('aaaaaaaa-0000-4000-8000-00000000009a', 'pgTAP Insert', 'Owner');
insert into public.dogs (id, name, human_id, is_pregnant)
  values ('bbbbbbbb-0000-4000-8000-00000000009b', 'InsertPupDone',
          'aaaaaaaa-0000-4000-8000-00000000009a', false),
         ('bbbbbbbb-0000-4000-8000-00000000009c', 'InsertPupBooked',
          'aaaaaaaa-0000-4000-8000-00000000009a', false);
set local session_replication_role = default;

-- LIVE insert straight into 'Completed' (next Monday, 09:00).
insert into public.bookings (id, booking_date, slot, dog_id, size, service, status)
  values ('cccccccc-0000-4000-8000-00000000009c',
          (date_trunc('week', current_date) + interval '7 days')::date,
          '09:00', 'bbbbbbbb-0000-4000-8000-00000000009b', 'small', 'full-groom',
          'Completed');

select is(
  (select completed_at is not null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000009c'),
  true, 'inserting a booking as Completed stamps completed_at'
);

select is(
  (select last_groomed_date from public.dogs
   where id = 'bbbbbbbb-0000-4000-8000-00000000009b'),
  (date_trunc('week', current_date) + interval '7 days')::date,
  'inserting a booking as Completed sets the dog''s last_groomed_date'
);

select is(
  (select count(*)::int from public.booking_events
   where booking_id = 'cccccccc-0000-4000-8000-00000000009c'
     and event_type = 'completed'),
  1, 'inserting a booking as Completed emits one completed event'
);

-- Control: a LIVE plain 'Booked' insert fires none of the completion effects.
insert into public.bookings (id, booking_date, slot, dog_id, size, service, status)
  values ('dddddddd-0000-4000-8000-00000000009d',
          (date_trunc('week', current_date) + interval '7 days')::date,
          '09:30', 'bbbbbbbb-0000-4000-8000-00000000009c', 'small', 'full-groom',
          'Booked');

select is(
  (select completed_at is null from public.bookings
   where id = 'dddddddd-0000-4000-8000-00000000009d'),
  true, 'a Booked insert leaves completed_at null'
);

select is(
  (select last_groomed_date is null from public.dogs
   where id = 'bbbbbbbb-0000-4000-8000-00000000009c'),
  true, 'a Booked insert leaves the dog''s last_groomed_date null'
);

select * from finish();
rollback;
