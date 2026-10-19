-- get_large_dog_day_availability() lists a day for a large dog only when the
-- capacity trigger would accept one, and the kill switch cannot change that.
--
-- Migration 20261019170000. large_dog_can_fit_on_day() used to differ from
-- validate_booking_capacity() in three ways that reached customers through the
-- WhatsApp agent:
--
--   1. With salon_config.enforce_server_capacity = false it returned true for
--      every open day (fail-open), exposing days with no large-dog slot left.
--   2. It ignored the daily dog cap.
--   3. It ignored staff-blocked seats, which are how partial-day closures are
--      enforced.
--   4. For today it ignored which slots staff had flagged for last-minute
--      booking and their 30-minute cutoff, and it never refused a past or
--      closed day itself.
--
-- Decision (19 October 2026, owner): the switch is a staff-side lever only;
-- customer-facing availability must keep the rules while it is off (see 253
-- and docs/capacity-engine.md). Every case below is asserted with the switch
-- ON and OFF. Days that genuinely have room are asserted too, so a function
-- that simply returned false would fail. The last block confirms the answers
-- against the trigger itself.
--
-- Bookings are seeded with triggers off (session_replication_role = replica)
-- to describe each day's state, not to test the gates.

begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

\ir fixtures/ensure_local_vault_secrets.psql

set local session_replication_role = replica;

insert into auth.users (id) values ('65000000-0000-4000-8000-000000000001');

insert into public.humans (
  id, name, surname, address, customer_user_id, source,
  approved_at, policies_accepted_at, policies_version
) values (
  '65000000-0000-4000-8000-000000000010', 'LargeDog', 'Harness',
  '1 Large Lane', '65000000-0000-4000-8000-000000000001',
  'existing', now(), now(), '2099-largedog'
);

insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
select ('65010000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid, 'LdSmall'||i,
       'Poodle', '65000000-0000-4000-8000-000000000010', 'small', false
from generate_series(1, 30) as f(i);

insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
select ('65020000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid, 'LdLarge'||i,
       'Newfoundland', '65000000-0000-4000-8000-000000000010', 'large', false
from generate_series(1, 5) as f(i);

delete from public.salon_config;
insert into public.salon_config (id, enforce_server_capacity, daily_dog_cap)
values ('65000000-0000-4000-8000-0000000000c0', true, 14);

-- One small-dog booking for dog number p_dog.
create or replace function pg_temp.put(p_date date, p_slot text, p_dog integer)
returns void language sql as $fn$
  insert into public.bookings (booking_date, slot, dog_id, size, service, status)
  values (p_date, p_slot,
          ('65010000-0000-4000-8000-' || lpad(p_dog::text, 12, '0'))::uuid,
          'small', 'full-groom', 'Booked');
$fn$;

-- Seed several small dogs into each slot listed as (slot, count).
create or replace function pg_temp.fill(p_date date, p_slots text[], p_counts integer[])
returns void language plpgsql as $fn$
declare n integer := 0; i integer; j integer;
begin
  for i in 1..array_length(p_slots, 1) loop
    for j in 1..p_counts[i] loop
      n := n + 1;
      perform pg_temp.put(p_date, p_slots[i], n);
    end loop;
  end loop;
end;
$fn$;

-- What the WhatsApp agent asks: does this day have room for a large dog?
create or replace function pg_temp.large_ok(p_date date)
returns boolean language sql as $fn$
  select coalesce(
    (select has_capacity
       from public.get_large_dog_day_availability(p_date, p_date)),
    false);
$fn$;

create or replace function pg_temp.set_switch(p_on boolean)
returns void language plpgsql as $fn$
begin
  set local session_replication_role = replica;
  update public.salon_config set enforce_server_capacity = p_on;
  set local session_replication_role = default;
end;
$fn$;

-- ── Days that genuinely have room for a large dog ─────────────────────
-- A  Mon 2 Mar: empty.
-- B  Tue 3 Mar: small dogs mid-morning only; every large slot is untouched.
select pg_temp.fill(date '2099-03-03', array['10:00','10:30','11:00'], array[2,1,2]);
-- C  Wed 4 Mar: 08:30 and 09:00 full of small dogs; 12:00 onwards still free.
select pg_temp.fill(date '2099-03-04', array['08:30','09:00'], array[2,2]);
-- F  Wed 11 Mar: 13 dogs, one under the cap, with 13:00 free.
select pg_temp.fill(date '2099-03-11',
  array['08:30','09:00','10:00','10:30','11:00','11:30','12:00','12:30'],
  array[2,2,2,2,1,2,1,1]);
-- H  Tue 17 Mar: staff blocked both seats at 08:30 only.
insert into public.day_settings (setting_date, is_open, overrides, extra_slots)
values (date '2099-03-17', true,
        '{"08:30": {"0": "blocked", "1": "blocked"}}'::jsonb, '{}');

-- ── Days with no room for a large dog ─────────────────────────────────
-- D  Mon 9 Mar: every large-dog slot is already taken by the rules.
select pg_temp.fill(date '2099-03-09',
  array['08:30','09:00','12:00','12:30','13:00'], array[2,2,2,1,1]);
-- E  Tue 10 Mar: 14 dogs (the daily cap); 13:00 is still free on paper.
select pg_temp.fill(date '2099-03-10',
  array['08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30'],
  array[2,2,1,2,2,1,2,1,1]);
-- G  Mon 16 Mar: staff blocked both seats in every large-dog slot
--    (how a partial-day closure is enforced).
insert into public.day_settings (setting_date, is_open, overrides, extra_slots)
values (date '2099-03-16', true,
        '{"08:30": {"0": "blocked", "1": "blocked"},
          "09:00": {"0": "blocked", "1": "blocked"},
          "12:00": {"0": "blocked", "1": "blocked"},
          "12:30": {"0": "blocked", "1": "blocked"},
          "13:00": {"0": "blocked", "1": "blocked"}}'::jsonb, '{}');

-- I  Wed 18 Mar: 08:30 and 12:00 full of small dogs; ONE seat blocked at
--    12:30 and at 13:00, so neither takeover slot keeps the two seats a large
--    dog needs. Partial blocks, not whole closed slots.
select pg_temp.fill(date '2099-03-18', array['08:30','12:00'], array[2,2]);
insert into public.day_settings (setting_date, is_open, overrides, extra_slots)
values (date '2099-03-18', true,
        '{"12:30": {"0": "blocked"}, "13:00": {"0": "blocked"}}'::jsonb, '{}');

-- Today (Europe/London): open, but only 10:00 — not a large-dog slot — is
-- flagged for last-minute booking. Replaced later in the file.
insert into public.day_settings (setting_date, is_open, overrides, extra_slots, immediate_slots)
values (((now() at time zone 'Europe/London'))::date, true, '{}'::jsonb, '{}', array['10:00']);

set local session_replication_role = default;
set local role postgres;

-- ── Switch ON ─────────────────────────────────────────────────────────
select ok(pg_temp.large_ok(date '2099-03-02'), 'switch ON: empty day is offered');
select ok(pg_temp.large_ok(date '2099-03-03'), 'switch ON: day with small dogs mid-morning is offered');
select ok(pg_temp.large_ok(date '2099-03-04'), 'switch ON: day with only the afternoon free is offered');
select ok(pg_temp.large_ok(date '2099-03-11'), 'switch ON: 13 dogs (under the cap) is offered');
select ok(pg_temp.large_ok(date '2099-03-17'), 'switch ON: one blocked large slot still leaves others');
select ok(not pg_temp.large_ok(date '2099-03-09'), 'switch ON: day with every large slot taken is not offered');
select ok(not pg_temp.large_ok(date '2099-03-10'), 'switch ON: day at the daily cap is not offered');
select ok(not pg_temp.large_ok(date '2099-03-16'), 'switch ON: day with every large slot blocked by staff is not offered');
select ok(not pg_temp.large_ok(date '2099-03-18'), 'switch ON: one blocked seat in each takeover slot leaves no room');

-- ── Switch OFF: nothing above may change ──────────────────────────────
select pg_temp.set_switch(false);

select ok(pg_temp.large_ok(date '2099-03-02'), 'switch OFF: empty day is still offered');
select ok(pg_temp.large_ok(date '2099-03-03'), 'switch OFF: day with small dogs mid-morning is still offered');
select ok(pg_temp.large_ok(date '2099-03-04'), 'switch OFF: day with only the afternoon free is still offered');
select ok(pg_temp.large_ok(date '2099-03-11'), 'switch OFF: 13 dogs is still offered');
select ok(pg_temp.large_ok(date '2099-03-17'), 'switch OFF: one blocked large slot still leaves others');
select ok(not pg_temp.large_ok(date '2099-03-09'), 'switch OFF: day with every large slot taken is still not offered');
select ok(not pg_temp.large_ok(date '2099-03-10'), 'switch OFF: day at the daily cap is still not offered');
select ok(not pg_temp.large_ok(date '2099-03-16'), 'switch OFF: day with every large slot blocked is still not offered');
select ok(not pg_temp.large_ok(date '2099-03-18'), 'switch OFF: one blocked seat in each takeover slot still leaves no room');

-- ── Calendar rules (switch still OFF) ─────────────────────────────────
-- Called directly: get_large_dog_day_availability() already skips past and
-- closed days, but the function must not answer yes for them on its own.
select ok(
  not public.large_dog_can_fit_on_day(((now() at time zone 'Europe/London'))::date - 1),
  'calendar: yesterday is never available'
);
select ok(
  not public.large_dog_can_fit_on_day(date '2099-03-05'),
  'calendar: a Thursday (closed by default) is never available'
);
select ok(
  not public.large_dog_can_fit_on_day(((now() at time zone 'Europe/London'))::date),
  'same day: today with only a non-large slot flagged offers no large-dog slot'
);

-- Flag every large-dog slot for today. Before 12:30 London time at least one
-- (13:00) is still 30+ minutes away, so today must be available; after that
-- no large slot can be, so the positive check is skipped rather than faked.
set local session_replication_role = replica;
update public.day_settings
   set immediate_slots = array['08:30','09:00','12:00','12:30','13:00']
 where setting_date = ((now() at time zone 'Europe/London'))::date;
set local session_replication_role = default;

select case
  when (now() at time zone 'Europe/London')
       <= (((now() at time zone 'Europe/London'))::date + time '12:30')
  then ok(
    public.large_dog_can_fit_on_day(((now() at time zone 'Europe/London'))::date),
    'same day: today with the large-dog slots flagged is available'
  )
  else skip('after 12:30 London time no large-dog slot is 30+ minutes away', 1)
end;

-- ── The trigger agrees (switch ON, a non-staff insert) ────────────────
-- Checked with the switch ON only: with it OFF the trigger deliberately accepts
-- what customer availability refuses (see 253 and docs/capacity-engine.md).
select pg_temp.set_switch(true);

select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-03-03', '08:30',
             '65020000-0000-4000-8000-000000000001', 'large', 'full-groom') $$,
  'trigger agreement: a large dog at 08:30 on the offered 3 Mar is accepted'
);
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-03-04', '12:00',
             '65020000-0000-4000-8000-000000000002', 'large', 'full-groom') $$,
  'trigger agreement: a large dog at 12:00 on the offered 4 Mar is accepted'
);
select throws_like(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-03-10', '13:00',
             '65020000-0000-4000-8000-000000000003', 'large', 'full-groom') $$,
  'Day is fully booked%',
  'trigger agreement: a large dog on the capped 10 Mar is refused (daily cap)'
);
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-03-16', '09:00',
             '65020000-0000-4000-8000-000000000004', 'large', 'full-groom') $$,
  'P0001',
  -- A slot with every seat blocked counts as closed, so the calendar gate
  -- refuses it before the capacity gate is reached.
  'That time slot is closed on this date',
  'trigger agreement: a large dog in a staff-blocked slot on 16 Mar is refused'
);

select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values (date '2099-03-18', '12:30',
             '65020000-0000-4000-8000-000000000005', 'large', 'full-groom') $$,
  'P0001',
  'Not enough capacity (2-2-1 rule)',
  'trigger agreement: a large dog at 12:30 with one seat blocked on 18 Mar is refused by the capacity gate'
);

select * from finish();
rollback;
