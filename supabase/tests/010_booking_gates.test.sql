-- Behavioural tests for the non-staff booking BEFORE INSERT gates.
--
-- These run as the default (postgres) role with no JWT, so auth.uid() is NULL
-- and is_staff() returns false → the non-staff gate paths fire. Every case here
-- expects the gate to RAISE (P0001) *before* the row is inserted, so the
-- AFTER-insert notify triggers (pg_net / Vault) never run — keeping the tests
-- self-contained on the rebuilt schema. The whole file is one transaction,
-- rolled back at the end; pgTAP rolls each throwing statement back to a
-- savepoint so the fixtures below survive between assertions.
--
-- Trigger order on bookings (BEFORE INSERT, alphabetical): set_snapshots →
-- enforce_booking_calendar → enforce_dog_not_pregnant → validate_booking_capacity.

begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- Fixtures: one owner, a normal dog, and a pregnant dog.
insert into public.humans (id, name)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'pgTAP Gate Owner');
insert into public.dogs (id, name, human_id, is_pregnant)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'TestPup', 'aaaaaaaa-0000-4000-8000-000000000001', false),
         ('bbbbbbbb-0000-4000-8000-000000000002', 'BumpPup', 'aaaaaaaa-0000-4000-8000-000000000001', true);

-- 1. Calendar gate: an out-of-range slot is rejected (the slot check runs first,
--    so the date is a valid future Monday).
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values ((date_trunc('week', current_date) + interval '7 days')::date,
             '07:00', 'bbbbbbbb-0000-4000-8000-000000000001', 'small', 'full-groom') $$,
  'P0001', 'Invalid slot: 07:00',
  'calendar gate rejects an out-of-range slot'
);

-- 2. Calendar gate: a past date is rejected (valid slot, so it reaches the date check).
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (current_date - 7, '09:00',
             'bbbbbbbb-0000-4000-8000-000000000001', 'small', 'full-groom') $$,
  'P0001', 'Cannot book a date in the past',
  'calendar gate rejects a past date'
);

-- 3. Calendar gate: a closed weekday is rejected. No day_settings row exists, so
--    open days fall back to Mon/Tue/Wed; next week's Thursday (Monday + 3) is closed.
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values ((date_trunc('week', current_date) + interval '10 days')::date,
             '09:00', 'bbbbbbbb-0000-4000-8000-000000000001', 'small', 'full-groom') $$,
  'P0001', 'The salon is closed on that date',
  'calendar gate rejects a closed weekday (Thursday)'
);

-- 4. Pregnancy gate: a pregnant dog is rejected on an otherwise-valid booking
--    (valid slot + future open Monday), proving this is the pregnancy gate and
--    that the booking cleared the calendar gate to reach it.
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values ((date_trunc('week', current_date) + interval '7 days')::date,
             '09:00', 'bbbbbbbb-0000-4000-8000-000000000002', 'small', 'full-groom') $$,
  'P0001', 'We can''t book a pregnant dog online — please call the salon.',
  'pregnancy gate rejects a pregnant dog'
);

select * from finish();
rollback;
