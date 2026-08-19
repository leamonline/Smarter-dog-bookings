-- Cross-runtime capacity parity: PostgreSQL must agree with the browser engine.
--
-- The capacity rules exist in three runtimes (src/engine/capacity.ts, the Deno
-- mirror, and validate_booking_capacity() here). src/lib/whatsapp/capacityParity.test.ts
-- already guards the two TypeScript copies against each other, and
-- 035_capacity_behaviour.test.sql proves this trigger on its own terms. Nothing
-- previously fed the SAME scenario to the browser engine and to PostgreSQL and
-- compared the verdicts — which is the disagreement a customer would feel as a
-- slot the interface offered and the database then refused.
--
-- The scenarios come from src/engine/capacityParityFixtures.ts, and the
-- expected verdict in each assertion below is the verdict the real TypeScript
-- engine returns for that scenario. src/engine/capacityParityFixtures.test.ts
-- recomputes those verdicts from the engine and fails if this file drifts from
-- them, so the two halves cannot diverge silently.
--
-- Measured 19 August 2026: all 17 scenarios agreed on eligibility. The refusal
-- TEXT differs in 3 cases (the engine renders a 12-hour clock, the trigger a
-- 24-hour one); this file pins the trigger's wording, and the wording gap is
-- recorded in docs/research/2026-08-19-capacity-parity-measurement.md.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

\ir fixtures/ensure_local_vault_secrets.psql

set local session_replication_role = replica;

insert into auth.users (id) values ('61500000-0000-4000-8000-000000000001');

insert into public.humans (
  id, name, surname, address, customer_user_id, source,
  approved_at, policies_accepted_at, policies_version
) values (
  '61500000-0000-4000-8000-000000000010',
  'Parity', 'Harness', '1 Parity Street',
  '61500000-0000-4000-8000-000000000001',
  'existing', now(), now(), '2099-parity'
);

insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
select ('61510000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'ParitySmall' || i, 'Poodle',
       '61500000-0000-4000-8000-000000000010', 'small', false
from generate_series(1, 95) as f(i);

insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
select ('61520000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'ParityLarge' || i, 'Newfoundland',
       '61500000-0000-4000-8000-000000000010', 'large', false
from generate_series(1, 95) as f(i);

-- validate_booking_capacity() reads one salon_config row with LIMIT 1. The
-- daily cap is set high on purpose: these scenarios probe per-slot rules, and
-- the cap is a separate throughput limit that would otherwise mask them.
delete from public.salon_config;
insert into public.salon_config (id, enforce_server_capacity, daily_dog_cap)
values ('61500000-0000-4000-8000-0000000000c0', true, 50);

insert into public.day_settings (setting_date, is_open, overrides)
values (date '2099-01-05', true, '{}'::jsonb);

set local session_replication_role = default;
select set_config('request.jwt.claims', '', true);
set local role postgres;


-- seats-empty-day-first: first small dog into an empty slot on an empty day
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
set local session_replication_role = default;
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '09:00', '61510000-0000-4000-8000-000000000090', 'small', 'full-groom') $$,
  'parity[seats-empty-day-first]: the engine allows this, so PostgreSQL must too'
);

-- seats-second-in-slot: second small dog shares a slot that holds two seats
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:00', '61510000-0000-4000-8000-000000000001', 'small', 'full-groom');
set local session_replication_role = default;
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '09:00', '61510000-0000-4000-8000-000000000090', 'small', 'full-groom') $$,
  'parity[seats-second-in-slot]: the engine allows this, so PostgreSQL must too'
);

-- seats-third-in-slot: third small dog into a slot that already holds two
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:00', '61510000-0000-4000-8000-000000000001', 'small', 'full-groom');
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:00', '61510000-0000-4000-8000-000000000002', 'small', 'full-groom');
set local session_replication_role = default;
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '09:00', '61510000-0000-4000-8000-000000000090', 'small', 'full-groom') $$,
  'P0001',
  'Slot is full',
  'parity[seats-third-in-slot]: the engine refuses this, so PostgreSQL must too'
);

-- 221-third-window-first-seat: two full preceding slots cap the third at one seat — first seat
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:00', '61510000-0000-4000-8000-000000000001', 'small', 'full-groom');
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:00', '61510000-0000-4000-8000-000000000002', 'small', 'full-groom');
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:30', '61510000-0000-4000-8000-000000000003', 'small', 'full-groom');
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:30', '61510000-0000-4000-8000-000000000004', 'small', 'full-groom');
set local session_replication_role = default;
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '10:00', '61510000-0000-4000-8000-000000000090', 'small', 'full-groom') $$,
  'parity[221-third-window-first-seat]: the engine allows this, so PostgreSQL must too'
);

-- 221-third-window-second-seat: two full preceding slots cap the third at one seat — second seat refused
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:00', '61510000-0000-4000-8000-000000000001', 'small', 'full-groom');
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:00', '61510000-0000-4000-8000-000000000002', 'small', 'full-groom');
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:30', '61510000-0000-4000-8000-000000000003', 'small', 'full-groom');
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:30', '61510000-0000-4000-8000-000000000004', 'small', 'full-groom');
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '10:00', '61510000-0000-4000-8000-000000000005', 'small', 'full-groom');
set local session_replication_role = default;
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '10:00', '61510000-0000-4000-8000-000000000090', 'small', 'full-groom') $$,
  'P0001',
  'Capped at 1 (2-2-1 rule)',
  'parity[221-third-window-second-seat]: the engine refuses this, so PostgreSQL must too'
);

-- 221-gap-resets-window: a half-full middle slot does not trigger the 2-2-1 cap
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:00', '61510000-0000-4000-8000-000000000001', 'small', 'full-groom');
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:00', '61510000-0000-4000-8000-000000000002', 'small', 'full-groom');
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '09:30', '61510000-0000-4000-8000-000000000003', 'small', 'full-groom');
set local session_replication_role = default;
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '10:00', '61510000-0000-4000-8000-000000000090', 'small', 'full-groom') $$,
  'parity[221-gap-resets-window]: the engine allows this, so PostgreSQL must too'
);

-- large-0830-single-seat: large dog at 08:30 costs one seat
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
set local session_replication_role = default;
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '08:30', '61520000-0000-4000-8000-000000000090', 'large', 'full-groom') $$,
  'parity[large-0830-single-seat]: the engine allows this, so PostgreSQL must too'
);

-- large-shares-0830-with-small: small dog joins a large dog already at 08:30
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '08:30', '61520000-0000-4000-8000-000000000001', 'large', 'full-groom');
set local session_replication_role = default;
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '08:30', '61510000-0000-4000-8000-000000000090', 'small', 'full-groom') $$,
  'parity[large-shares-0830-with-small]: the engine allows this, so PostgreSQL must too'
);

-- large-1230-full-takeover: large dog at 12:30 takes the whole slot
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
set local session_replication_role = default;
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '12:30', '61520000-0000-4000-8000-000000000090', 'large', 'full-groom') $$,
  'parity[large-1230-full-takeover]: the engine allows this, so PostgreSQL must too'
);

-- large-1230-blocks-small: small dog refused at 12:30 once a large dog has taken it
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '12:30', '61520000-0000-4000-8000-000000000001', 'large', 'full-groom');
set local session_replication_role = default;
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '12:30', '61510000-0000-4000-8000-000000000090', 'small', 'full-groom') $$,
  'P0001',
  'Slot is full',
  'parity[large-1230-blocks-small]: the engine refuses this, so PostgreSQL must too'
);

-- large-into-occupied-1230: large dog refused at 12:30 when the slot already has a booking
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '12:30', '61510000-0000-4000-8000-000000000001', 'small', 'full-groom');
set local session_replication_role = default;
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '12:30', '61520000-0000-4000-8000-000000000090', 'large', 'full-groom') $$,
  'P0001',
  'Large dog fills this slot — already has bookings',
  'parity[large-into-occupied-1230]: the engine refuses this, so PostgreSQL must too'
);

-- large-back-to-back-0830-0900: back-to-back large dogs at 08:30 then 09:00
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '08:30', '61520000-0000-4000-8000-000000000001', 'large', 'full-groom');
set local session_replication_role = default;
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '09:00', '61520000-0000-4000-8000-000000000090', 'large', 'full-groom') $$,
  'P0001',
  '09:00 large dog conditional: 08:30 must be empty',
  'parity[large-back-to-back-0830-0900]: the engine refuses this, so PostgreSQL must too'
);

-- large-back-to-back-1230-1300: back-to-back large dogs at 12:30 then 13:00 (the permitted pair)
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '12:30', '61520000-0000-4000-8000-000000000001', 'large', 'full-groom');
set local session_replication_role = default;
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '13:00', '61520000-0000-4000-8000-000000000090', 'large', 'full-groom') $$,
  'parity[large-back-to-back-1230-1300]: the engine allows this, so PostgreSQL must too'
);

-- early-close-1300-after-1200-large: 13:00 refused after a large dog at 12:00 triggers early close
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '12:00', '61520000-0000-4000-8000-000000000001', 'large', 'full-groom');
set local session_replication_role = default;
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '13:00', '61510000-0000-4000-8000-000000000090', 'small', 'full-groom') $$,
  'P0001',
  '13:00 closed — early close from 12:00 large dog',
  'parity[early-close-1300-after-1200-large]: the engine refuses this, so PostgreSQL must too'
);

-- large-1200-with-1300-occupied: large dog at 12:00 while 13:00 already holds a booking
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '13:00', '61510000-0000-4000-8000-000000000001', 'small', 'full-groom');
set local session_replication_role = default;
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '12:00', '61520000-0000-4000-8000-000000000090', 'large', 'full-groom') $$,
  'P0001',
  '12:00 large dog requires 13:00 to be empty (early close)',
  'parity[large-1200-with-1300-occupied]: the engine refuses this, so PostgreSQL must too'
);

-- blocked-seat-halves-slot: one blocked seat leaves a single usable seat in the slot
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{"08:30": {"0": "blocked"}}'::jsonb where setting_date = date '2099-01-05';
set local session_replication_role = default;
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '08:30', '61510000-0000-4000-8000-000000000090', 'small', 'full-groom') $$,
  'parity[blocked-seat-halves-slot]: the engine allows this, so PostgreSQL must too'
);

-- blocked-seat-second-refused: second dog refused when one seat of the slot is blocked
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.day_settings set overrides = '{"08:30": {"0": "blocked"}}'::jsonb where setting_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values (date '2099-01-05', '08:30', '61510000-0000-4000-8000-000000000001', 'small', 'full-groom');
set local session_replication_role = default;
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-05', '08:30', '61510000-0000-4000-8000-000000000090', 'small', 'full-groom') $$,
  'P0001',
  'Slot is full',
  'parity[blocked-seat-second-refused]: the engine refuses this, so PostgreSQL must too'
);

select finish();
rollback;
