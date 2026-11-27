-- A customer's same-day cancellation is a no-show (ADR 015, migration
-- 20261124200000).
--
-- A customer-caused cancellation committed on the appointment's own London
-- date is saved as 'No-show' on every customer path: the portal and iPhone
-- (cancel_customer_booking), WhatsApp (cancel_whatsapp_booking_by_id) and
-- staff recording the customer's request. A salon cancellation, a reschedule
-- release and anything on an earlier date stay 'Cancelled'. The customer
-- still gets the cancellation message, a staff alert still sees a
-- 'cancelled' event, the seat is freed, and a retry replays the receipt.
--
-- Same-day appointments sit at 23:59 London time, so a customer can still
-- cancel them. The paths that need the appointment to be in the future are
-- skipped, not faked, when the suite runs after 23:50 London time.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

\ir fixtures/ensure_local_vault_secrets.psql

select ((now() at time zone 'Europe/London')::time < time '23:50') as can_run_same_day \gset

set local session_replication_role = replica;
insert into auth.users (id) values
  ('26700000-0000-4000-8000-000000000001'),
  ('26700000-0000-4000-8000-000000000005');
insert into public.staff_profiles (user_id, role, display_name) values
  ('26700000-0000-4000-8000-000000000005', 'owner', 'Same-day staff');
insert into public.humans (id, name, surname, customer_user_id) values
  ('26700000-0000-4000-8000-000000000002', 'Same', 'Day', '26700000-0000-4000-8000-000000000001'),
  ('26700000-0000-4000-8000-000000000003', 'Whats', 'App', null),
  ('26700000-0000-4000-8000-000000000004', 'Desk', 'Request', null);
insert into public.dogs (id, name, breed, human_id, size) values
  ('26700000-0000-4000-8000-000000000011', 'Today one', 'Poodle', '26700000-0000-4000-8000-000000000002', 'small'),
  ('26700000-0000-4000-8000-000000000012', 'Today two', 'Poodle', '26700000-0000-4000-8000-000000000002', 'small'),
  ('26700000-0000-4000-8000-000000000013', 'Chatty', 'Beagle', '26700000-0000-4000-8000-000000000003', 'small'),
  ('26700000-0000-4000-8000-000000000014', 'Desky', 'Collie', '26700000-0000-4000-8000-000000000004', 'small');
insert into public.bookings (id, dog_id, group_id, booking_date, slot, status, service, size) values
  -- Portal: a two-dog appointment today.
  ('26700000-0000-4000-8000-000000000101', '26700000-0000-4000-8000-000000000011', '26700000-0000-4000-8000-000000000100',
   (now() at time zone 'Europe/London')::date, '23:59', 'Booked', 'full-groom', 'small'),
  ('26700000-0000-4000-8000-000000000102', '26700000-0000-4000-8000-000000000012', '26700000-0000-4000-8000-000000000100',
   (now() at time zone 'Europe/London')::date, '23:59', 'Booked', 'full-groom', 'small'),
  -- Portal: tomorrow, inside the notice window. Not a no-show.
  ('26700000-0000-4000-8000-000000000103', '26700000-0000-4000-8000-000000000011', null,
   (now() at time zone 'Europe/London')::date + 1, '08:30', 'Booked', 'full-groom', 'small'),
  -- WhatsApp: today.
  ('26700000-0000-4000-8000-000000000201', '26700000-0000-4000-8000-000000000013', null,
   (now() at time zone 'Europe/London')::date, '23:59', 'Booked', 'full-groom', 'small'),
  -- Staff at the desk: three today, recorded with different causes.
  ('26700000-0000-4000-8000-000000000301', '26700000-0000-4000-8000-000000000014', null,
   (now() at time zone 'Europe/London')::date, '08:30', 'Booked', 'full-groom', 'small'),
  ('26700000-0000-4000-8000-000000000302', '26700000-0000-4000-8000-000000000014', null,
   (now() at time zone 'Europe/London')::date, '10:00', 'Reconfirmed', 'full-groom', 'small'),
  ('26700000-0000-4000-8000-000000000303', '26700000-0000-4000-8000-000000000014', null,
   (now() at time zone 'Europe/London')::date, '11:00', 'Booked', 'full-groom', 'small'),
  -- Staff: tomorrow, later marked as a no-show by hand.
  ('26700000-0000-4000-8000-000000000305', '26700000-0000-4000-8000-000000000014', null,
   (now() at time zone 'Europe/London')::date + 1, '09:00', 'Booked', 'full-groom', 'small');
set local session_replication_role = origin;

delete from public.salon_config;
insert into public.salon_config (settings) values ('{"minCancellationHours":48}');

create temp table queued_before as
select count(*)::integer as n
  from net.http_request_queue
 where url like '%/functions/v1/notify-booking-cancelled';

-- ── The classifier cannot be called over the API ─────────────────────
select ok(
  not has_function_privilege('authenticated', 'smarter_dog_private.classify_same_day_customer_cancellation()', 'EXECUTE'),
  'signed-in callers cannot execute the same-day classifier'
);

-- ── Portal / iPhone: the customer cancels today ──────────────────────
select set_config('request.jwt.claim.sub', '26700000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"26700000-0000-4000-8000-000000000001","role":"authenticated"}', true);

\if :can_run_same_day
create temp table first_receipt as
select * from public.cancel_customer_booking('26700000-0000-4000-8000-000000000101', 'Car broke down');

select is(
  (select array_agg(status order by id) from public.bookings where group_id = '26700000-0000-4000-8000-000000000100'),
  array['No-show', 'No-show']::text[],
  'a customer cancelling today records a no-show for every dog in the appointment'
);
select ok(
  (select bool_and(cancellation_cause = 'customer' and cancel_reason = 'Car broke down')
     from public.bookings where group_id = '26700000-0000-4000-8000-000000000100'),
  'the no-show keeps the customer cause and their reason'
);
select is(
  (select cancelled_count from first_receipt),
  2,
  'the receipt still reports both dogs as cancelled'
);
select is(
  (select count(*)::integer from public.booking_events
    where booking_id in ('26700000-0000-4000-8000-000000000101', '26700000-0000-4000-8000-000000000102')
      and event_type = 'cancelled'),
  2,
  'each dog gets one cancelled event, so staff alerts and the timeline still see it'
);
select is(
  (select count(*)::integer from net.http_request_queue
    where url like '%/functions/v1/notify-booking-cancelled') - (select n from queued_before),
  2,
  'the customer still gets the cancellation message'
);
select is(
  (select cancelled_at from public.cancel_customer_booking('26700000-0000-4000-8000-000000000101', 'Car broke down')),
  (select cancelled_at from first_receipt),
  'a retry replays the original receipt instead of failing'
);
select is(
  (select count(*)::integer from smarter_dog_private.late_cancellation_history
    where human_id = '26700000-0000-4000-8000-000000000002'),
  0,
  'no notice-window strike is written any more'
);
\else
select skip('after 23:50 London time a same-day appointment has started', 7);
\endif

-- ── Portal: cancelling tomorrow is a plain cancellation ──────────────
select lives_ok(
  $$select * from public.cancel_customer_booking('26700000-0000-4000-8000-000000000103', 'Change of plans')$$,
  'a customer can still cancel inside the notice window'
);
select is(
  (select status from public.bookings where id = '26700000-0000-4000-8000-000000000103'),
  'Cancelled',
  'cancelling before the day stays a cancellation, whatever the notice'
);
select is(
  (select count(*)::integer from smarter_dog_private.late_cancellation_history
    where human_id = '26700000-0000-4000-8000-000000000002'),
  0,
  'cancelling before the day records no strike'
);

-- ── WhatsApp: the customer cancels today ─────────────────────────────
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

\if :can_run_same_day
select lives_ok(
  $$select * from public.cancel_whatsapp_booking_by_id('26700000-0000-4000-8000-000000000201', '26700000-0000-4000-8000-000000000003', 'Poorly dog')$$,
  'WhatsApp can cancel an appointment later today'
);
select is(
  (select status from public.bookings where id = '26700000-0000-4000-8000-000000000201'),
  'No-show',
  'a WhatsApp cancellation today is a no-show too'
);
\else
select skip('after 23:50 London time a same-day appointment has started', 2);
\endif

-- ── Staff at the desk ────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '26700000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"26700000-0000-4000-8000-000000000005","role":"authenticated"}', true);

update public.bookings
   set status = 'Cancelled', cancellation_cause = 'customer', cancel_reason = 'Rang to cancel'
 where id = '26700000-0000-4000-8000-000000000301';
select is(
  (select status from public.bookings where id = '26700000-0000-4000-8000-000000000301'),
  'No-show',
  'staff recording a customer''s same-day cancellation records a no-show'
);
select is(
  (select cancellation_cause from public.bookings where id = '26700000-0000-4000-8000-000000000301'),
  'customer',
  'the customer cause survives the provenance trigger'
);

update public.bookings
   set status = 'Cancelled', cancellation_cause = 'customer', cancel_reason = 'Rang to cancel'
 where id = '26700000-0000-4000-8000-000000000302';
select is(
  (select status from public.bookings where id = '26700000-0000-4000-8000-000000000302'),
  'No-show',
  'a reconfirmed appointment cancelled today is a no-show too'
);
select is(
  (select deposit_required from public.humans where id = '26700000-0000-4000-8000-000000000004'),
  false,
  'two dogs'' appointments missed on the same day are one no-show, so no deposit yet'
);

update public.bookings
   set status = 'Cancelled', cancellation_cause = 'salon', cancel_reason = 'Groomer off sick'
 where id = '26700000-0000-4000-8000-000000000303';
select is(
  (select status from public.bookings where id = '26700000-0000-4000-8000-000000000303'),
  'Cancelled',
  'a salon cancellation today is never a no-show'
);

-- A no-show still frees the seat: the dog can be booked into the same slot.
select lives_ok(
  $$insert into public.bookings (id, dog_id, booking_date, slot, status, service, size)
    values ('26700000-0000-4000-8000-000000000304', '26700000-0000-4000-8000-000000000014',
            (now() at time zone 'Europe/London')::date, '08:30', 'Booked', 'full-groom', 'small')$$,
  'a same-day no-show frees its seat, as a cancellation does'
);

-- A staff-marked no-show on another day is the second: deposit required.
update public.bookings set status = 'No-show', cancel_reason = 'No-show'
 where id = '26700000-0000-4000-8000-000000000305';
select is(
  (select deposit_required from public.humans where id = '26700000-0000-4000-8000-000000000004'),
  true,
  'a customer same-day no-show plus a staff-marked one on another day require a deposit'
);

-- Undoing a same-day no-show puts the booking back and clears the cause.
update public.bookings set status = 'Booked' where id = '26700000-0000-4000-8000-000000000302';
select is(
  (select cancellation_cause from public.bookings where id = '26700000-0000-4000-8000-000000000302'),
  null,
  'putting the dog back clears the customer cause'
);

-- ── The staff count ──────────────────────────────────────────────────
select is(
  (public.staff_customer_no_show_history('26700000-0000-4000-8000-000000000004')->>'count')::integer,
  2,
  'staff see two no-shows: today, counted once, and the staff-marked one'
);
select is(
  (public.staff_customer_no_show_history('26700000-0000-4000-8000-000000000004')->>'threshold')::integer,
  2,
  'staff see that two no-shows require a deposit'
);
select is(
  (select deposit_required from public.humans where id = '26700000-0000-4000-8000-000000000004'),
  true,
  'putting one dog back does not take the deposit away; only staff do that'
);

select set_config('request.jwt.claim.sub', '26700000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"26700000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.staff_customer_no_show_history('26700000-0000-4000-8000-000000000002')$$,
  '42501', 'staff_only',
  'a customer cannot read the staff no-show count'
);

select * from finish();
rollback;
