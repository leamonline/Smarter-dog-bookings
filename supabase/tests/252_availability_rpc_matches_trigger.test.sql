-- get_small_medium_availability() offers only what the capacity trigger accepts.
--
-- Migration 20261019150000. The RPC used to decide "is there room?" with
-- `seats_used < 2 - blocked`, which disagreed with validate_booking_capacity():
-- it ignored the 2-2-1 rule and the daily dog cap, and counted Cancelled and
-- No-show bookings as seated. Each block below is one of those disagreements,
-- with a control beside it so an RPC that simply returned nothing would fail.
--
-- Bookings are inserted with triggers off (session_replication_role = replica)
-- because the point is to describe a day's state, not to test the gates.
-- 2099 dates are used so "future day" is true whenever this runs; Mon/Tue/Wed
-- are open by default.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir fixtures/ensure_local_vault_secrets.psql

set local session_replication_role = replica;

insert into auth.users (id) values ('63000000-0000-4000-8000-000000000001');

insert into public.humans (
  id, name, surname, address, customer_user_id, source,
  approved_at, policies_accepted_at, policies_version
) values (
  '63000000-0000-4000-8000-000000000010', 'Availability', 'Harness',
  '1 Availability Street', '63000000-0000-4000-8000-000000000001',
  'existing', now(), now(), '2099-availability'
);

insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
select ('63010000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid, 'AvailSmall'||i,
       'Poodle', '63000000-0000-4000-8000-000000000010', 'small', false
from generate_series(1, 30) as f(i);

insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
values ('63020000-0000-4000-8000-000000000001', 'AvailLarge1',
        'Newfoundland', '63000000-0000-4000-8000-000000000010', 'large', false);

delete from public.salon_config;
insert into public.salon_config (id, enforce_server_capacity, daily_dog_cap)
values ('63000000-0000-4000-8000-0000000000c0', true, 14);

-- One booking for dog number p_dog on a day. Distinct dogs within a day keep
-- the (dog, date, slot) uniqueness out of the way.
create or replace function pg_temp.put(
  p_date date, p_slot text, p_status text, p_dog integer, p_size text default 'small'
) returns void language sql as $fn$
  insert into public.bookings (booking_date, slot, dog_id, size, service, status)
  values (
    p_date, p_slot,
    case when p_size = 'large'
         then '63020000-0000-4000-8000-000000000001'::uuid
         else ('63010000-0000-4000-8000-' || lpad(p_dog::text, 12, '0'))::uuid end,
    p_size, 'full-groom', p_status
  );
$fn$;

-- Slots the RPC offers on a day, in order.
create or replace function pg_temp.offered(p_date date)
returns text[] language sql as $fn$
  select coalesce(array_agg(slot order by slot), array[]::text[])
    from public.get_small_medium_availability(p_date, p_date);
$fn$;

-- ── 0. Control: an empty open day offers the whole canonical grid ─────
select is(
  pg_temp.offered(date '2099-01-05'),
  array['08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00'],
  'empty Monday offers all ten canonical slots'
);

-- ── 1. 2-2-1: a slot beside two doubles holds one dog ─────────────────
-- 08:30 and 09:00 are doubles; 09:30 may hold ONE dog and already does. The
-- old rule saw 1 < 2 and offered it; the trigger refuses ("Capped at 1").
select pg_temp.put(date '2099-01-06', '08:30', 'Booked', 1);
select pg_temp.put(date '2099-01-06', '08:30', 'Booked', 2);
select pg_temp.put(date '2099-01-06', '09:00', 'Booked', 3);
select pg_temp.put(date '2099-01-06', '09:00', 'Booked', 4);
select pg_temp.put(date '2099-01-06', '09:30', 'Booked', 5);

select ok(
  not ('09:30' = any (pg_temp.offered(date '2099-01-06'))),
  '2-2-1: 09:30 is capped at one dog and is full, so it is not offered'
);
select ok(
  '10:00' = any (pg_temp.offered(date '2099-01-06')),
  '2-2-1 control: 10:00 is untouched and still offered'
);

-- ── 2. Cancelled and No-show free their seat ──────────────────────────
-- Four terminal bookings in 09:00 would, if counted, fill it twice over.
select pg_temp.put(date '2099-01-07', '09:00', 'Cancelled', 1);
select pg_temp.put(date '2099-01-07', '09:00', 'Cancelled', 2);
select pg_temp.put(date '2099-01-07', '09:00', 'No-show',   3);
select pg_temp.put(date '2099-01-07', '09:00', 'No-show',   4);
select pg_temp.put(date '2099-01-07', '10:00', 'Booked',    5);

select ok(
  '09:00' = any (pg_temp.offered(date '2099-01-07')),
  'cancelled and no-show bookings do not hold 09:00; it is offered'
);
select ok(
  '10:00' = any (pg_temp.offered(date '2099-01-07')),
  'control: 10:00 has one live dog and one seat left, so it is offered'
);

-- ── 3. Daily dog cap ──────────────────────────────────────────────────
-- 14 dogs: one in every slot plus four doubles. Every slot still has a free
-- seat on paper; the day is at the cap and the trigger would refuse any more.
select pg_temp.put(date '2099-01-12', s, 'Booked', i::integer)
  from unnest(array['08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00'])
       with ordinality as t(s, i);
select pg_temp.put(date '2099-01-12', s, 'Booked', 10 + i::integer)
  from unnest(array['08:30','10:00','11:00','12:00']) with ordinality as t(s, i);

select is(
  pg_temp.offered(date '2099-01-12'),
  array[]::text[],
  'a day holding 14 dogs (the daily cap) is not offered at all'
);

-- Control: the same day one dog short of the cap is still offered.
select pg_temp.put(date '2099-01-13', s, 'Booked', i::integer)
  from unnest(array['08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00'])
       with ordinality as t(s, i);
select pg_temp.put(date '2099-01-13', s, 'Booked', 10 + i::integer)
  from unnest(array['08:30','10:00','11:00']) with ordinality as t(s, i);

select ok(
  cardinality(pg_temp.offered(date '2099-01-13')) > 0,
  'control: 13 dogs is under the cap, so the day is still offered'
);

-- ── 4. Early close: a large dog at 12:00 closes 13:00 ─────────────────
select pg_temp.put(date '2099-01-14', '12:00', 'Booked', 1, 'large');

select ok(
  not ('13:00' = any (pg_temp.offered(date '2099-01-14'))),
  'a large dog at 12:00 closes 13:00, so it is not offered'
);

-- ── 5. Staff-blocked seat still counts ────────────────────────────────
insert into public.day_settings (setting_date, is_open, overrides, extra_slots)
values (date '2099-01-19', true, '{"09:00": {"0": "blocked"}}'::jsonb, '{}');
select pg_temp.put(date '2099-01-19', '09:00', 'Booked', 1);

select ok(
  not ('09:00' = any (pg_temp.offered(date '2099-01-19'))),
  'one blocked seat plus one dog fills 09:00, so it is not offered'
);

-- Agreement with the trigger on the day the RPC calls full: a staff-free
-- insert into 09:30 on 6 January must be refused, which is what "not offered"
-- promises.
set local session_replication_role = default;
set local role postgres;
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-01-06', '09:30',
             '63010000-0000-4000-8000-000000000021', 'small', 'full-groom') $$,
  'P0001',
  'Capped at 1 (2-2-1 rule)',
  'trigger agreement: a second dog at 09:30 on the 2-2-1 day is refused'
);

select * from finish();
rollback;
