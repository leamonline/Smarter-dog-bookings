-- Customer reminder confirmation -> Reconfirmed, and the four guards that stop
-- it reconfirming something it should not.
--
-- mark_reminder_confirmed is HUMAN-scoped, not booking-scoped: one "Yes" from a
-- customer touches every eligible booking they have. These tests put one
-- customer's bookings into each risky state at once and call the RPC a single
-- time, which is exactly how it is invoked in production — so a guard that only
-- works in isolation fails here.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir fixtures/ensure_local_vault_secrets.psql

set local session_replication_role = replica;

insert into public.humans (id, name, surname)
  values ('22600000-0000-4000-8000-000000000010', 'pgTAP Reconfirm', 'Owner');
insert into public.dogs (id, name, human_id, is_pregnant)
  values ('22600000-0000-4000-8000-000000000011', 'ConfPup',
          '22600000-0000-4000-8000-000000000010', false);

-- One customer, six bookings, one in each state the RPC can reach.
--
-- Dates are LONDON dates, not Postgres current_date. booking_date is a London
-- calendar date and the guard compares against the London date, so a fixture
-- built on UTC current_date reads as yesterday for the hour each evening when
-- BST has already rolled over — which is exactly how this test first failed.
insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, checked_in_at, cancel_reason)
values
  -- a: the happy path — Booked, in the future.
  ('22600000-0000-4000-8000-0000000000a1', (now() at time zone 'Europe/London')::date + 2, '08:30',
   '22600000-0000-4000-8000-000000000011', 'small', 'full-groom', 'Booked', null, null),
  -- b: Booked but the appointment has already passed (unclosed paperwork).
  ('22600000-0000-4000-8000-0000000000b1', (now() at time zone 'Europe/London')::date - 1, '09:00',
   '22600000-0000-4000-8000-000000000011', 'small', 'full-groom', 'Booked', null, null),
  -- c: the dog is in the salon. Advancing this would rank it BELOW Arrived and
  -- the lifecycle trigger would clear its arrival time.
  ('22600000-0000-4000-8000-0000000000c1', (now() at time zone 'Europe/London')::date, '09:30',
   '22600000-0000-4000-8000-000000000011', 'small', 'full-groom', 'Arrived', now() - interval '1 hour', null),
  -- d: ready to go home.
  ('22600000-0000-4000-8000-0000000000d1', (now() at time zone 'Europe/London')::date, '10:00',
   '22600000-0000-4000-8000-000000000011', 'small', 'full-groom', 'Ready for collection', now() - interval '2 hours', null),
  -- e: a no-show.
  ('22600000-0000-4000-8000-0000000000e1', (now() at time zone 'Europe/London')::date, '10:30',
   '22600000-0000-4000-8000-000000000011', 'small', 'full-groom', 'No-show', null, 'No-show'),
  -- f: Booked today — the boundary of the date guard.
  ('22600000-0000-4000-8000-0000000000f1', (now() at time zone 'Europe/London')::date, '11:00',
   '22600000-0000-4000-8000-000000000011', 'small', 'full-groom', 'Booked', null, null);

-- Every one of them has a recent, sent WhatsApp reminder, so the eligibility
-- gate is satisfied for all six and only the new guards can separate them.
insert into public.notification_log (booking_id, human_id, channel, trigger_type, status, sent_at)
select id, '22600000-0000-4000-8000-000000000010', 'whatsapp', 'reminder', 'sent', now() - interval '1 hour'
  from public.bookings where id::text like '22600000-0000-4000-8000-0000000000%';

set local session_replication_role = origin;

-- Capture the in-salon dog's arrival time before the call.
create temp table _arrival as
  select checked_in_at as ci from public.bookings
   where id = '22600000-0000-4000-8000-0000000000c1';

-- ONE call, as production makes it.
select public.mark_reminder_confirmed('22600000-0000-4000-8000-000000000010');

-- Guard 1: only Booked advances.
select is((select status from public.bookings where id = '22600000-0000-4000-8000-0000000000a1'),
  'Reconfirmed', 'a future Booked booking advances to Reconfirmed');

select is((select status from public.bookings where id = '22600000-0000-4000-8000-0000000000f1'),
  'Reconfirmed', 'a booking dated TODAY still advances — the guard is >=, not >');

select is((select status from public.bookings where id = '22600000-0000-4000-8000-0000000000c1'),
  'Arrived', 'a dog already in the salon is NOT dragged back to Reconfirmed');

select is((select status from public.bookings where id = '22600000-0000-4000-8000-0000000000d1'),
  'Ready for collection', 'a dog ready to go home is not dragged back either');

-- The reason guard 1 exists: Reconfirmed ranks below Arrived, so advancing an
-- arrived dog would have cleared this.
select is((select checked_in_at from public.bookings where id = '22600000-0000-4000-8000-0000000000c1'),
  (select ci from _arrival),
  'the in-salon dog keeps its arrival time');

-- Guard 2: a past booking is stamped but not advanced.
select is((select status from public.bookings where id = '22600000-0000-4000-8000-0000000000b1'),
  'Booked', 'a booking whose date has passed is not reconfirmed retrospectively');

-- ...but the confirmation itself is still recorded, because the reminder flow
-- is unchanged. Only the status advance is new.
select is((select reminder_confirmed_source from public.bookings
            where id = '22600000-0000-4000-8000-0000000000b1'),
  'customer', 'the past booking is still STAMPED — the reminder flow is untouched');

-- Guard 3: a no-show is neither stamped nor advanced.
select is((select status from public.bookings where id = '22600000-0000-4000-8000-0000000000e1'),
  'No-show', 'a no-show keeps its status');

select is((select reminder_confirmed_at is null from public.bookings
            where id = '22600000-0000-4000-8000-0000000000e1'),
  true, 'a no-show is not stamped at all — it is terminal, as Cancelled always was');

-- Guard 4: a reschedule un-reconfirms.
--
-- Moved to a Monday, because the salon opens Mon-Wed and the calendar gate is
-- live on this UPDATE — the reschedule trigger has to fire, so the gates fire
-- with it. (A closed-day date fails with "The salon is closed on that date",
-- which is the gate working, not this behaviour breaking.)
update public.bookings
   set booking_date = (date_trunc('week', (now() at time zone 'Europe/London')::date) + interval '14 days')::date
 where id = '22600000-0000-4000-8000-0000000000a1';
select is((select status from public.bookings where id = '22600000-0000-4000-8000-0000000000a1'),
  'Booked', 'moving a Reconfirmed booking to another date reverts it to Booked');

select is((select reminder_confirmed_at is null and reminder_confirmed_source is null
             from public.bookings where id = '22600000-0000-4000-8000-0000000000a1'),
  true, 'and clears the confirmation that belonged to the old date');

select * from finish();
rollback;
