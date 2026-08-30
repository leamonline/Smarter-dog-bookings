-- Reason-code contract: every booking gate states WHY it refused (#665).
--
-- Until 20260826120000 the reason a booking was refused was re-derived by
-- regex over the gate's prose (mapDenialReason). This file proves the gates
-- now EMIT the code in the exception's DETAIL field, and that they still say
-- exactly what they said before.
--
-- Two properties, and the second matters as much as the first:
--
--   1. DETAIL carries the code, per gate.
--   2. MESSAGE is unchanged. 035/036 already assert the exact prose with
--      throws_ok and are deliberately not edited by that migration; the
--      spot-checks at the end of this file restate the point locally so a
--      reader of THIS file can see that adding DETAIL did not disturb it.
--
-- Not covered here, deliberately: the 30-minute cutoff refusal ("Too close to
-- the start time"). Reaching it requires now() to sit inside a 30-minute
-- window before a bookable slot, which is not deterministic in a test that can
-- run at any hour. Its code is covered instead by the mapper-agreement test in
-- src/engine/denialCodeContract.test.ts, which reads this migration's emitted
-- codes out of the SQL and checks them against mapDenialReason.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir fixtures/ensure_local_vault_secrets.psql

set local session_replication_role = replica;

insert into auth.users (id) values ('61600000-0000-4000-8000-000000000001');

insert into public.humans (
  id, name, surname, address, customer_user_id, source,
  approved_at, policies_accepted_at, policies_version
) values (
  '61600000-0000-4000-8000-000000000010', 'Reason', 'Codes',
  '1 Detail Street', '61600000-0000-4000-8000-000000000001',
  'existing', now(), now(), '2099-reason'
);

insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
select ('61610000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid, 'ReasonSmall'||i,
       'Poodle', '61600000-0000-4000-8000-000000000010', 'small', false
from generate_series(1, 20) as f(i);

insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
values ('61620000-0000-4000-8000-000000000001', 'ReasonLarge', 'Newfoundland',
        '61600000-0000-4000-8000-000000000010', 'large', false),
       ('61630000-0000-4000-8000-000000000001', 'ReasonExpecting', 'Poodle',
        '61600000-0000-4000-8000-000000000010', 'small', true);

delete from public.salon_config;
insert into public.salon_config (id, enforce_server_capacity, daily_dog_cap)
values ('61600000-0000-4000-8000-0000000000c0', true, 14);

insert into public.day_settings (setting_date, is_open, overrides, extra_slots)
values (date '2099-01-05', true, '{}'::jsonb, '{}'),
       (date '2099-01-07', false, '{}'::jsonb, '{}');

set local session_replication_role = default;
select set_config('request.jwt.claims', '', true);
set local role postgres;

-- Run a statement and report the DETAIL it raised. Catching the exception
-- rolls the failed insert back with the subtransaction, so cases stay isolated.
-- PG_EXCEPTION_DETAIL is only reachable through GET STACKED DIAGNOSTICS; as a
-- bare identifier PostgreSQL reads it as a column reference and errors.
create or replace function pg_temp.detail_of(p_sql text) returns text
language plpgsql as $fn$
declare
  v_detail text;
begin
  execute p_sql;
  return '(no exception)';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return coalesce(nullif(v_detail, ''), '(none)');
end;
$fn$;

create or replace function pg_temp.message_of(p_sql text) returns text
language plpgsql as $fn$
begin
  execute p_sql;
  return '(no exception)';
exception when others then
  return sqlerrm;
end;
$fn$;


-- ── Capacity gate ───────────────────────────────────────────
-- Two seats used, third dog refused: 'Slot is full'.
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values
  (date '2099-01-05', '09:00', '61610000-0000-4000-8000-000000000001', 'small', 'full-groom'),
  (date '2099-01-05', '09:00', '61610000-0000-4000-8000-000000000002', 'small', 'full-groom');
set local session_replication_role = default;

select is(
  pg_temp.detail_of(
    $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
       values (date '2099-01-05', '09:00', '61610000-0000-4000-8000-000000000003', 'small', 'full-groom') $$),
  'slot_full',
  'capacity: a full slot emits slot_full'
);

-- 2-2-1: three consecutive doubles are capped, and the offending slot says so.
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values
  (date '2099-01-05', '09:00',  '61610000-0000-4000-8000-000000000001', 'small', 'full-groom'),
  (date '2099-01-05', '09:00',  '61610000-0000-4000-8000-000000000002', 'small', 'full-groom'),
  (date '2099-01-05', '09:30',  '61610000-0000-4000-8000-000000000003', 'small', 'full-groom'),
  (date '2099-01-05', '09:30',  '61610000-0000-4000-8000-000000000004', 'small', 'full-groom'),
  (date '2099-01-05', '10:00',  '61610000-0000-4000-8000-000000000005', 'small', 'full-groom');
set local session_replication_role = default;

select is(
  pg_temp.detail_of(
    $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
       values (date '2099-01-05', '10:00', '61610000-0000-4000-8000-000000000006', 'small', 'full-groom') $$),
  'capacity_2_2_1',
  'capacity: the 2-2-1 cap emits capacity_2_2_1'
);

-- A large dog into an occupied slot is a large-dog rule, not a seat count.
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values
  (date '2099-01-05', '12:30', '61610000-0000-4000-8000-000000000001', 'small', 'full-groom');
set local session_replication_role = default;

select is(
  pg_temp.detail_of(
    $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
       values (date '2099-01-05', '12:30', '61620000-0000-4000-8000-000000000001', 'large', 'full-groom') $$),
  'large_dog_ineligible',
  'capacity: a large-dog rule emits large_dog_ineligible'
);

-- Daily cap: the whole day is full, which is not a per-slot refusal.
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
update public.salon_config set daily_dog_cap = 1;
insert into public.bookings (booking_date, slot, dog_id, size, service) values
  (date '2099-01-05', '09:00', '61610000-0000-4000-8000-000000000001', 'small', 'full-groom');
set local session_replication_role = default;

select is(
  pg_temp.detail_of(
    $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
       values (date '2099-01-05', '10:30', '61610000-0000-4000-8000-000000000002', 'small', 'full-groom') $$),
  'daily_cap',
  'capacity: the daily cap emits daily_cap'
);

set local session_replication_role = replica;
update public.salon_config set daily_dog_cap = 14;
delete from public.bookings where booking_date = date '2099-01-05';
set local session_replication_role = default;


-- ── Calendar gate ───────────────────────────────────────────
select is(
  pg_temp.detail_of(
    $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
       values (date '2099-01-05', '07:15', '61610000-0000-4000-8000-000000000001', 'small', 'full-groom') $$),
  'unavailable',
  'calendar: a slot outside the grid emits unavailable'
);

select is(
  pg_temp.detail_of(
    $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
       values (date '2020-01-06', '09:00', '61610000-0000-4000-8000-000000000001', 'small', 'full-groom') $$),
  'past_date',
  'calendar: a past date emits past_date'
);

select is(
  pg_temp.detail_of(
    $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
       values (date '2099-01-07', '09:00', '61610000-0000-4000-8000-000000000001', 'small', 'full-groom') $$),
  'calendar_closed',
  'calendar: a closed day emits calendar_closed'
);

-- Both seats blocked refuses from the CALENDAR gate, not capacity — the
-- finding recorded in the 20 August brief. Since migration 20260830120000
-- (owner decision, 30 Aug 2026, #665) it emits seat_blocked: the DAY is not
-- closed, that SLOT is, and seat_blocked is retryable so the Flow offers
-- other same-day times. The message stays byte-identical; the prose mapper's
-- calendar_closed inference remains only as the pre-migration fallback.
set local session_replication_role = replica;
-- Seat keys are an OBJECT ("0"/"1"), not an array: both gates read
-- `overrides -> slot ->> '0'`, and the capacity trigger walks it with
-- jsonb_each_text, which errors outright on an array. Same shape as 036.
update public.day_settings
   set overrides = '{"11:00": {"0": "blocked", "1": "blocked"}}'::jsonb
 where setting_date = date '2099-01-05';
set local session_replication_role = default;

select is(
  pg_temp.detail_of(
    $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
       values (date '2099-01-05', '11:00', '61610000-0000-4000-8000-000000000001', 'small', 'full-groom') $$),
  'seat_blocked',
  'calendar: both seats blocked emits seat_blocked — the slot is blocked, the day is not closed'
);

set local session_replication_role = replica;
update public.day_settings set overrides = '{}'::jsonb where setting_date = date '2099-01-05';
set local session_replication_role = default;


-- ── Pregnancy gate ──────────────────────────────────────────
select is(
  pg_temp.detail_of(
    $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
       values (date '2099-01-05', '09:00', '61630000-0000-4000-8000-000000000001', 'small', 'full-groom') $$),
  'pregnant',
  'pregnancy: a pregnant dog emits pregnant'
);

-- The dog-integrity check deliberately carries NO code: #681 documents it as
-- `unknown`, which fails closed. Absence of DETAIL keeps the prose mapper in
-- charge of that path, exactly as before.
select is(
  pg_temp.detail_of(
    $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
       values (date '2099-01-05', '09:00', '61690000-0000-4000-8000-0000000000ff', 'small', 'full-groom') $$),
  '(none)',
  'pregnancy: the dog-integrity check stays bare, leaving the mapper in charge'
);


-- ── Per-customer slot block ─────────────────────────────────
set local session_replication_role = replica;
update public.humans set blocked_slots = '{12:00}'
 where id = '61600000-0000-4000-8000-000000000010';
set local session_replication_role = default;

select is(
  pg_temp.detail_of(
    $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
       values (date '2099-01-05', '12:00', '61610000-0000-4000-8000-000000000001', 'small', 'full-groom') $$),
  'customer_slot_blocked',
  'slot block: a customer-blocked slot emits customer_slot_blocked'
);

set local session_replication_role = replica;
update public.humans set blocked_slots = '{}'
 where id = '61600000-0000-4000-8000-000000000010';
set local session_replication_role = default;


-- ── Messages unchanged ──────────────────────────────────────
-- Adding DETAIL must not disturb a single character of what the gate says.
set local session_replication_role = replica;
delete from public.bookings where booking_date = date '2099-01-05';
insert into public.bookings (booking_date, slot, dog_id, size, service) values
  (date '2099-01-05', '09:00', '61610000-0000-4000-8000-000000000001', 'small', 'full-groom'),
  (date '2099-01-05', '09:00', '61610000-0000-4000-8000-000000000002', 'small', 'full-groom');
set local session_replication_role = default;

select is(
  pg_temp.message_of(
    $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
       values (date '2099-01-05', '09:00', '61610000-0000-4000-8000-000000000003', 'small', 'full-groom') $$),
  'Slot is full',
  'message unchanged: capacity still says exactly "Slot is full"'
);

select is(
  pg_temp.message_of(
    $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
       values (date '2099-01-07', '09:00', '61610000-0000-4000-8000-000000000001', 'small', 'full-groom') $$),
  'The salon is closed on that date',
  'message unchanged: calendar still says exactly "The salon is closed on that date"'
);

-- And the contract is complete: 26 codes across the four gates.
select is(
  (select sum(n)::integer from (
     select (select count(*) from regexp_matches(prosrc, 'detail = ''[a-z_0-9]+''', 'g')) as n
       from pg_proc
      where proname in ('validate_booking_capacity', 'validate_booking_calendar',
                        'assert_booking_dog_not_pregnant', 'enforce_human_slot_blocks')
   ) s),
  26,
  'contract: 26 reason codes emitted across the four gates'
);

select * from finish();
rollback;
