-- Staff booking confirmation and the customer-wins overwrite
-- (migration 20260825100000). Synthetic fixtures, rolled back.
--
-- The contract under test:
--   * staff record a confirmation as a plain UPDATE (source 'staff'), and the
--     'reconfirmed' booking event names the staff member;
--   * a real customer confirmation (mark_reminder_confirmed) OVERWRITES a
--     staff one and is attributed to the customer;
--   * customer -> customer stays idempotent;
--   * a reschedule clears both halves of the confirmation.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir fixtures/ensure_local_vault_secrets.psql

set local session_replication_role = replica;

insert into auth.users (id) values
  ('18100000-0000-4000-8000-000000000001'), -- staff
  ('18100000-0000-4000-8000-000000000002'); -- customer

insert into public.staff_profiles (user_id, role, display_name) values
  ('18100000-0000-4000-8000-000000000001', 'owner', 'Staff Owner 181');

insert into public.humans (id, name, surname, customer_user_id) values
  ('18100000-0000-4000-8000-000000000010', 'Confirm', 'Customer',
   '18100000-0000-4000-8000-000000000002');

insert into public.dogs (id, name, breed, size, human_id) values
  ('18100000-0000-4000-8000-000000000011', 'Pip', 'Poodle', 'small',
   '18100000-0000-4000-8000-000000000010');

insert into public.bookings (
  id, booking_date, slot, dog_id, size, service, status, confirmed, payment,
  reminder_confirmed_at, reminder_confirmed_source
) values
  -- b1: reminder sent, nobody confirmed yet.
  ('18100000-0000-4000-8000-000000000021', current_date + 2, '09:00',
   '18100000-0000-4000-8000-000000000011', 'small', 'full-groom',
   'Booked', false, 'Due at Pick-up', null, null),
  -- b3: the customer already confirmed — must stay untouched throughout.
  ('18100000-0000-4000-8000-000000000023', current_date + 2, '10:00',
   '18100000-0000-4000-8000-000000000011', 'small', 'full-groom',
   'Booked', false, 'Due at Pick-up', now() - interval '2 hours', 'customer');

-- Recent sent WhatsApp reminders — mark_reminder_confirmed's eligibility gate.
insert into public.notification_log (booking_id, human_id, channel, trigger_type, status, sent_at) values
  ('18100000-0000-4000-8000-000000000021', '18100000-0000-4000-8000-000000000010',
   'whatsapp', 'reminder', 'sent', now() - interval '1 hour'),
  ('18100000-0000-4000-8000-000000000023', '18100000-0000-4000-8000-000000000010',
   'whatsapp', 'reminder', 'sent', now() - interval '1 hour');

set local session_replication_role = origin;

-- 1. Schema.
select has_column('public', 'bookings', 'reminder_confirmed_source',
  'bookings.reminder_confirmed_source exists');

-- ── Staff confirm: plain UPDATE with a staff JWT ────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"18100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

update public.bookings
   set reminder_confirmed_at = now() - interval '30 minutes',
       reminder_confirmed_source = 'staff'
 where id = '18100000-0000-4000-8000-000000000021';

-- 2. The row records the staff confirmation.
select results_eq(
  $$ select reminder_confirmed_source, reminder_confirmed_at is not null
       from public.bookings
      where id = '18100000-0000-4000-8000-000000000021' $$,
  $$ values ('staff'::text, true) $$,
  'staff UPDATE stamps reminder_confirmed_at + source ''staff'''
);

-- 3. The reconfirmed event names the staff member, not the customer.
select results_eq(
  $$ select actor_role, actor_name
       from public.booking_events
      where booking_id = '18100000-0000-4000-8000-000000000021'
        and event_type = 'reconfirmed' $$,
  $$ values ('staff'::text, 'Staff Owner 181'::text) $$,
  'staff confirmation emits a staff-attributed reconfirmed event'
);

-- ── Customer confirm overwrites the staff one ───────────────────────
-- 4. Only the staff-confirmed booking is re-stamped; the already
--    customer-confirmed one is skipped (idempotent).
select results_eq(
  $$ select * from public.mark_reminder_confirmed('18100000-0000-4000-8000-000000000010') $$,
  $$ values ('18100000-0000-4000-8000-000000000021'::uuid) $$,
  'mark_reminder_confirmed re-stamps the staff-confirmed booking only'
);

-- 5. The customer confirmation replaced the staff one, with a fresher stamp.
select results_eq(
  $$ select reminder_confirmed_source,
            reminder_confirmed_at > now() - interval '30 minutes'
       from public.bookings
      where id = '18100000-0000-4000-8000-000000000021' $$,
  $$ values ('customer'::text, true) $$,
  'customer confirmation overwrites the staff confirmation'
);

-- 6. And it is attributed to the customer on the event feed.
select is(
  (select count(*) from public.booking_events
    where booking_id = '18100000-0000-4000-8000-000000000021'
      and event_type = 'reconfirmed'
      and actor_role = 'customer'),
  1::bigint,
  'the overwrite emits a customer-attributed reconfirmed event'
);

-- 7. The already customer-confirmed booking kept its original stamp.
select results_eq(
  $$ select reminder_confirmed_source, reminder_confirmed_at
       from public.bookings
      where id = '18100000-0000-4000-8000-000000000023' $$,
  $$ select 'customer'::text, now() - interval '2 hours' $$,
  'customer -> customer stays idempotent (timestamp untouched)'
);

-- ── Reschedule clears both halves ───────────────────────────────────
update public.bookings
   set booking_date = booking_date + 1
 where id = '18100000-0000-4000-8000-000000000021';

-- 8. A moved booking is unconfirmed again, source included.
select results_eq(
  $$ select reminder_confirmed_at is null, reminder_confirmed_source is null
       from public.bookings
      where id = '18100000-0000-4000-8000-000000000021' $$,
  $$ values (true, true) $$,
  'a date move clears reminder_confirmed_at and its source together'
);

-- ── Grant hygiene on the replaced function ──────────────────────────
select ok(
  not has_function_privilege('anon', 'public.mark_reminder_confirmed(uuid)', 'EXECUTE'),
  'mark_reminder_confirmed is not executable by anon'
);
select ok(
  not has_function_privilege('authenticated', 'public.mark_reminder_confirmed(uuid)', 'EXECUTE'),
  'mark_reminder_confirmed is not executable by authenticated'
);

select * from finish();
rollback;
