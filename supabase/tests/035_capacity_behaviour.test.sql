-- Focused runtime behaviour for PostgreSQL's authoritative capacity trigger.
--
-- All dates are synthetic Mondays in 2099: far enough ahead to remain future
-- dates while keeping the capacity error text literal and deterministic. Direct
-- booking writes run as postgres with no JWT, which makes is_staff() false and
-- exercises the non-staff gates. The grouped-write case uses a complete,
-- approved customer profile and an authenticated customer JWT.
--
-- Successful inserts fire the booking notification triggers, so the local
-- Vault fixture is required even though this transaction is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

\ir fixtures/ensure_local_vault_secrets.psql

-- Synthetic account, owner and dogs. Replica mode is fixture setup only; every
-- booking assertion below runs with the real triggers enabled.
set local session_replication_role = replica;

insert into auth.users (id)
values ('61400000-0000-4000-8000-000000000001');

insert into public.humans (
  id, name, surname, address, customer_user_id, source,
  approved_at, policies_accepted_at, policies_version
) values (
  '61400000-0000-4000-8000-000000000010',
  'pgTAP 614', 'Capacity Proof', '614 Synthetic Street',
  '61400000-0000-4000-8000-000000000001',
  'existing', now(), now(), '2099-capacity-test'
);

insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
select
  ('61410000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'CapacityPup' || i,
  'Poodle',
  '61400000-0000-4000-8000-000000000010',
  'small',
  false
from generate_series(1, 27) as fixture(i);

-- validate_booking_capacity() deliberately reads one salon_config row with
-- LIMIT 1. Replace any baseline row so this test has one deterministic source.
delete from public.salon_config;
insert into public.salon_config (id, enforce_server_capacity, daily_dog_cap)
values ('61400000-0000-4000-8000-0000000000c0', true, 50);

set local session_replication_role = default;
select set_config('request.jwt.claims', '', true);
set local role postgres;

select is(
  (select count(*) from public.salon_config),
  1::bigint,
  'the capacity scenarios use exactly one salon configuration row'
);

-- 1. Canonical 2-2-1: two full preceding slots cap 10:00 at one seat.
insert into public.bookings (booking_date, slot, dog_id, size, service)
values
  (date '2099-01-05', '09:00', '61410000-0000-4000-8000-000000000001', 'small', 'full-groom'),
  (date '2099-01-05', '09:00', '61410000-0000-4000-8000-000000000002', 'small', 'full-groom'),
  (date '2099-01-05', '09:30', '61410000-0000-4000-8000-000000000003', 'small', 'full-groom'),
  (date '2099-01-05', '09:30', '61410000-0000-4000-8000-000000000004', 'small', 'full-groom');

select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '10:00',
             '61410000-0000-4000-8000-000000000005', 'small', 'full-groom') $$,
  '2-2-1 allows the first seat in the capped third slot'
);

select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '10:00',
             '61410000-0000-4000-8000-000000000006', 'small', 'full-groom') $$,
  'P0001',
  'Capped at 1 (2-2-1 rule)',
  '2-2-1 rejects a second seat in the capped third slot'
);

-- 2. The one approved full-takeover adjacency is 12:30 + 13:00.
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-12', '12:30',
             '61410000-0000-4000-8000-000000000007', 'large', 'full-groom') $$,
  'a large dog can take over 12:30'
);

select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-12', '13:00',
             '61410000-0000-4000-8000-000000000008', 'large', 'full-groom') $$,
  'a large dog at 13:00 may follow a large dog at 12:30'
);

-- 3. 09:00 large-dog eligibility is conditional in both directions.
insert into public.bookings (booking_date, slot, dog_id, size, service)
values (date '2099-01-19', '10:00',
        '61410000-0000-4000-8000-000000000009', 'small', 'full-groom');

select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-19', '09:00',
             '61410000-0000-4000-8000-000000000010', 'large', 'full-groom') $$,
  '09:00 accepts a large dog when 08:30 is empty and 10:00 uses one seat'
);

insert into public.bookings (booking_date, slot, dog_id, size, service)
values (date '2099-01-26', '08:30',
        '61410000-0000-4000-8000-000000000011', 'small', 'full-groom');

select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-26', '09:00',
             '61410000-0000-4000-8000-000000000012', 'large', 'full-groom') $$,
  'P0001',
  '09:00 large dog conditional: 08:30 must be empty',
  '09:00 rejects a large dog when 08:30 is occupied'
);

insert into public.bookings (booking_date, slot, dog_id, size, service)
values
  (date '2099-02-02', '10:00', '61410000-0000-4000-8000-000000000013', 'small', 'full-groom'),
  (date '2099-02-02', '10:00', '61410000-0000-4000-8000-000000000014', 'small', 'full-groom');

select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-02-02', '09:00',
             '61410000-0000-4000-8000-000000000015', 'large', 'full-groom') $$,
  'P0001',
  '09:00 large dog conditional: 10:00 must have 0-1 seats used',
  '09:00 rejects a large dog when 10:00 already uses two seats'
);

-- 4. A 12:00 large dog requires 13:00 to be empty, then closes 13:00.
insert into public.bookings (booking_date, slot, dog_id, size, service)
values (date '2099-02-09', '13:00',
        '61410000-0000-4000-8000-000000000016', 'small', 'full-groom');

select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-02-09', '12:00',
             '61410000-0000-4000-8000-000000000017', 'large', 'full-groom') $$,
  'P0001',
  '12:00 large dog requires 13:00 to be empty (early close)',
  '12:00 rejects a large dog when 13:00 is already occupied'
);

select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-02-16', '12:00',
             '61410000-0000-4000-8000-000000000018', 'large', 'full-groom') $$,
  '12:00 accepts a large dog when 13:00 is empty'
);

select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-02-16', '13:00',
             '61410000-0000-4000-8000-000000000019', 'small', 'full-groom') $$,
  'P0001',
  '13:00 closed — early close from 12:00 large dog',
  'a 12:00 large dog closes 13:00 to later bookings'
);

-- 5. A block at seat index 0 leaves one bookable seat, not two.
insert into public.day_settings (setting_date, is_open, overrides)
values (
  date '2099-02-23',
  true,
  '{"10:30":{"0":"blocked"}}'::jsonb
);

select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-02-23', '10:30',
             '61410000-0000-4000-8000-000000000020', 'small', 'full-groom') $$,
  'one booking can use the seat left beside blocked index 0'
);

select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-02-23', '10:30',
             '61410000-0000-4000-8000-000000000021', 'small', 'full-groom') $$,
  'P0001',
  'Slot is full',
  'a block at index 0 plus one booking rejects the next booking'
);

-- Keep the daily-cap cases small without changing the rule: the trigger reads
-- the configured cap from the same single salon_config row.
update public.salon_config set daily_dog_cap = 2;

-- 6. The whole-day cap wins even when the requested physical slot is empty.
insert into public.bookings (booking_date, slot, dog_id, size, service)
values
  (date '2099-03-02', '08:30', '61410000-0000-4000-8000-000000000022', 'small', 'full-groom'),
  (date '2099-03-02', '08:30', '61410000-0000-4000-8000-000000000023', 'small', 'full-groom');

select is(
  (select count(*) from public.bookings
    where booking_date = date '2099-03-02' and slot = '13:00'),
  0::bigint,
  'the daily-cap candidate slot is physically empty'
);

select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-03-02', '13:00',
             '61410000-0000-4000-8000-000000000024', 'small', 'full-groom') $$,
  'P0001',
  'Day is fully booked: 02 Mar 2099 already has 2 dog(s) (maximum 2 per day)',
  'the daily cap rejects a dog even though its physical slot is empty'
);

-- 7. The customer RPC is one statement: with one daily place remaining, its
-- first row may pass internally but the second must fail and roll both back.
insert into public.bookings (booking_date, slot, dog_id, size, service)
values (date '2099-03-09', '08:30',
        '61410000-0000-4000-8000-000000000025', 'small', 'full-groom');

select set_config(
  'request.jwt.claims',
  '{"sub":"61400000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  public.is_staff(),
  false,
  'the approved RPC caller exercises non-staff capacity semantics'
);

select throws_ok(
  $$ select * from public.create_customer_booking_group(
       '[
          {"dog_id":"61410000-0000-4000-8000-000000000026","slot":"12:30","service":"full-groom"},
          {"dog_id":"61410000-0000-4000-8000-000000000027","slot":"12:30","service":"full-groom"}
        ]'::jsonb,
       date '2099-03-09'
     ) $$,
  'P0001',
  'Day is fully booked: 09 Mar 2099 already has 2 dog(s) (maximum 2 per day)',
  'a two-dog customer group fails when only one daily place remains'
);

set local role postgres;

select is(
  (select count(*)
     from public.bookings
    where booking_date = date '2099-03-09'
      and dog_id in (
        '61410000-0000-4000-8000-000000000026',
        '61410000-0000-4000-8000-000000000027'
      )),
  0::bigint,
  'the rejected two-dog RPC leaves no partial customer booking row'
);

select is(
  (select count(*) from public.bookings
    where booking_date = date '2099-03-09'),
  1::bigint,
  'the failed group preserves only the pre-existing booking on that day'
);

select * from finish();
rollback;
