-- The capacity kill switch (salon_config.enforce_server_capacity) does NOT
-- loosen customer-facing availability. This is intended, and this file pins it.
--
-- Decision (19 October 2026, owner): the switch is a staff-side lever for
-- one-off events. validate_booking_capacity() skips its seat rules while it is
-- off, but get_small_medium_availability() — the pre-filter behind the WhatsApp
-- Flow and agent — keeps applying 2-2-1 and the daily dog cap, so a switch left
-- off by mistake can never quietly open extra capacity to customers.
--
-- (get_large_dog_day_availability() is the known exception: it fails open when
-- the switch is off. That asymmetry is recorded in docs/capacity-engine.md and
-- is deliberately not asserted here.)
--
-- Each block pairs the pre-filter with the trigger on the same day, so the test
-- also proves the switch really is off where it should be.

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir fixtures/ensure_local_vault_secrets.psql

set local session_replication_role = replica;

insert into auth.users (id) values ('64000000-0000-4000-8000-000000000001');

insert into public.humans (
  id, name, surname, address, customer_user_id, source,
  approved_at, policies_accepted_at, policies_version
) values (
  '64000000-0000-4000-8000-000000000010', 'KillSwitch', 'Harness',
  '1 Switch Street', '64000000-0000-4000-8000-000000000001',
  'existing', now(), now(), '2099-killswitch'
);

insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
select ('64010000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid, 'SwitchSmall'||i,
       'Poodle', '64000000-0000-4000-8000-000000000010', 'small', false
from generate_series(1, 30) as f(i);

delete from public.salon_config;
insert into public.salon_config (id, enforce_server_capacity, daily_dog_cap)
values ('64000000-0000-4000-8000-0000000000c0', true, 14);

create or replace function pg_temp.put(
  p_date date, p_slot text, p_dog integer
) returns void language sql as $fn$
  insert into public.bookings (booking_date, slot, dog_id, size, service, status)
  values (p_date, p_slot,
          ('64010000-0000-4000-8000-' || lpad(p_dog::text, 12, '0'))::uuid,
          'small', 'full-groom', 'Booked');
$fn$;

create or replace function pg_temp.offered(p_date date)
returns text[] language sql as $fn$
  select coalesce(array_agg(slot order by slot), array[]::text[])
    from public.get_small_medium_availability(p_date, p_date);
$fn$;

-- Tuesday 2 Feb 2099: 08:30 and 09:00 are doubles, 09:30 holds its one allowed dog.
select pg_temp.put(date '2099-02-02', '08:30', 1);
select pg_temp.put(date '2099-02-02', '08:30', 2);
select pg_temp.put(date '2099-02-02', '09:00', 3);
select pg_temp.put(date '2099-02-02', '09:00', 4);
select pg_temp.put(date '2099-02-02', '09:30', 5);

-- Wednesday 3 Feb 2099: 14 dogs, one in every slot plus four doubles (the cap).
select pg_temp.put(date '2099-02-03', s, i::integer)
  from unnest(array['08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00'])
       with ordinality as t(s, i);
select pg_temp.put(date '2099-02-03', s, 10 + i::integer)
  from unnest(array['08:30','10:00','11:00','12:00']) with ordinality as t(s, i);

-- With the trigger switched on, it refuses the booking the pre-filter hides.
set local session_replication_role = default;
set local role postgres;
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-02-02', '09:30',
             '64010000-0000-4000-8000-000000000021', 'small', 'full-groom') $$,
  'P0001',
  'Capped at 1 (2-2-1 rule)',
  'control: with the switch ON the trigger refuses a second dog at 09:30'
);

-- Now switch enforcement OFF.
set local session_replication_role = replica;
update public.salon_config set enforce_server_capacity = false;
set local session_replication_role = default;

select ok(
  not ('09:30' = any (pg_temp.offered(date '2099-02-02'))),
  'switch OFF: the 2-2-1-full slot is still not offered to customers'
);
select is(
  pg_temp.offered(date '2099-02-03'),
  array[]::text[],
  'switch OFF: a day at the daily cap is still not offered to customers'
);
select ok(
  '08:30' = any (pg_temp.offered(date '2099-02-09')),
  'switch OFF control: an empty open day is still offered normally'
);

-- The switch really is off for the trigger: the same booking now goes through.
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-02-02', '09:30',
             '64010000-0000-4000-8000-000000000021', 'small', 'full-groom') $$,
  'switch OFF: the trigger accepts the booking the pre-filter keeps hidden'
);
select is(
  (select count(*)::integer from public.bookings
    where booking_date = date '2099-02-02' and slot = '09:30'),
  2,
  'switch OFF: that slot now holds two dogs, past its 2-2-1 limit of one'
);

select * from finish();
rollback;
