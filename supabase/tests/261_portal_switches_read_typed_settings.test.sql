-- The Customer Portal switches are enforced from the table the Settings
-- screen writes, and each switch governs only its own action.
--
-- Every switch change below goes through update_booking_rules(), the same
-- call the Settings screen makes, so this fails if the enforcing function
-- ever reads a different store again. Synthetic fixtures are rolled back; no
-- identifiable customer data is read.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

\ir fixtures/ensure_local_vault_secrets.psql

set local session_replication_role = replica;

insert into auth.users (id) values
  ('26100000-0000-4000-8000-000000000001'), -- owner
  ('26100000-0000-4000-8000-000000000002'); -- customer

insert into public.staff_profiles (user_id, role, display_name) values
  ('26100000-0000-4000-8000-000000000001', 'owner', 'Fixture Owner');

insert into public.humans (
  id, name, surname, address, customer_user_id, approved_at,
  policies_accepted_at, policies_version
) values (
  '26100000-0000-4000-8000-000000000010',
  'Switch', 'Customer', '1 Switch Street',
  '26100000-0000-4000-8000-000000000002', now(), now(), '2026-11-test'
);

insert into public.dogs (id, name, breed, human_id, size) values (
  '26100000-0000-4000-8000-000000000100',
  'Switch Dog', 'Poodle', '26100000-0000-4000-8000-000000000010', 'small'
);

-- Four singleton appointments on separate Mondays, far outside any deadline.
insert into public.bookings (
  id, booking_date, slot, dog_id, size, service, status, confirmed,
  payment, group_id
) values
  ('26100000-0000-4000-8000-000000000201',
   (date_trunc('week', current_date) + interval '21 days')::date, '09:00',
   '26100000-0000-4000-8000-000000000100', 'small', 'full-groom',
   'Booked', false, 'Due at Pick-up', null),
  ('26100000-0000-4000-8000-000000000202',
   (date_trunc('week', current_date) + interval '28 days')::date, '09:00',
   '26100000-0000-4000-8000-000000000100', 'small', 'full-groom',
   'Booked', false, 'Due at Pick-up', null),
  ('26100000-0000-4000-8000-000000000203',
   (date_trunc('week', current_date) + interval '35 days')::date, '09:00',
   '26100000-0000-4000-8000-000000000100', 'small', 'full-groom',
   'Booked', false, 'Due at Pick-up', null),
  ('26100000-0000-4000-8000-000000000204',
   (date_trunc('week', current_date) + interval '42 days')::date, '09:00',
   '26100000-0000-4000-8000-000000000100', 'small', 'full-groom',
   'Booked', false, 'Due at Pick-up', null);

-- The legacy key says cancellations are ALLOWED throughout the first half,
-- so any refusal below can only have come from the typed table.
delete from public.salon_config;
insert into public.salon_config (settings) values
  ('{"minCancellationHours":24,"customerPortal":{"allowCancellations":true}}'::jsonb);

set local session_replication_role = default;

create function pg_temp.act_as(p_user uuid) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
$$;

-- ── 1. Cancellations off, rescheduling on ───────────────────────────

set local role authenticated;
select pg_temp.act_as('26100000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.update_booking_rules(
       '{"customerPortal":{"allowCancellations":false,"allowRescheduling":true}}'::jsonb) $$,
  'the owner switches online cancellations off from Settings');

select pg_temp.act_as('26100000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '26100000-0000-4000-8000-000000000201', 'Changed plans') $$,
  'SDC01', 'online_cancellation_disabled',
  'a cancellation is refused once the Settings switch is off');

select is(
  (select status from public.bookings
    where id = '26100000-0000-4000-8000-000000000201'),
  'Booked',
  'the refused cancellation leaves the appointment untouched');

select is(
  (select count(*)::integer
     from public.booking_events
    where booking_id = '26100000-0000-4000-8000-000000000201'
      and event_type = 'cancelled'),
  0,
  'the refused cancellation records no cancelled event');

select is(
  public.customer_change_deadline_preview(
    (date_trunc('week', current_date) + interval '21 days')::date, '09:00'
  ) -> 'allowCancellations',
  'false'::jsonb,
  'the preview reports cancellations off');

select is(
  public.customer_change_deadline_preview(
    (date_trunc('week', current_date) + interval '21 days')::date, '09:00'
  ) -> 'allowRescheduling',
  'true'::jsonb,
  'the preview reports rescheduling still on');

select lives_ok(
  $$ select * from public.reschedule_customer_booking(
       '26100000-0000-4000-8000-000000000202',
       '[{"dog_id":"26100000-0000-4000-8000-000000000100","slot":"09:00","service":"full-groom"}]'::jsonb,
       (date_trunc('week', current_date) + interval '70 days')::date,
       'Need a different week') $$,
  'switching cancellations off does not disable rescheduling');

select is(
  (select count(*)::integer
     from public.bookings
    where dog_id = '26100000-0000-4000-8000-000000000100'
      and booking_date = (date_trunc('week', current_date) + interval '70 days')::date
      and status = 'Booked'),
  1,
  'the rescheduled appointment exists on the new date');

-- ── 2. Cancellations on, rescheduling off ───────────────────────────

select pg_temp.act_as('26100000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.update_booking_rules(
       '{"customerPortal":{"allowCancellations":true,"allowRescheduling":false}}'::jsonb) $$,
  'the owner switches online rescheduling off from Settings');

select pg_temp.act_as('26100000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select * from public.reschedule_customer_booking(
       '26100000-0000-4000-8000-000000000203',
       '[{"dog_id":"26100000-0000-4000-8000-000000000100","slot":"09:00","service":"full-groom"}]'::jsonb,
       (date_trunc('week', current_date) + interval '77 days')::date,
       'Need a different week') $$,
  'SDR05', 'online_rescheduling_disabled',
  'a reschedule is refused, with its own code, once its switch is off');

select is(
  (select booking_date || ' ' || status from public.bookings
    where id = '26100000-0000-4000-8000-000000000203'),
  (date_trunc('week', current_date) + interval '35 days')::date || ' Booked',
  'the refused reschedule leaves the original appointment in place');

select is(
  (select count(*)::integer
     from public.bookings
    where dog_id = '26100000-0000-4000-8000-000000000100'
      and booking_date = (date_trunc('week', current_date) + interval '77 days')::date),
  0,
  'the refused reschedule creates no replacement appointment');

select is(
  public.customer_change_deadline_preview(
    (date_trunc('week', current_date) + interval '35 days')::date, '09:00'
  ) -> 'allowRescheduling',
  'false'::jsonb,
  'the preview reports rescheduling off');

select lives_ok(
  $$ select * from public.cancel_customer_booking(
       '26100000-0000-4000-8000-000000000203', 'Changed plans') $$,
  'switching rescheduling off does not disable cancellation');

select is(
  (select status from public.bookings
    where id = '26100000-0000-4000-8000-000000000203'),
  'Cancelled',
  'that cancellation was written');

-- ── 3. The legacy JSON key no longer decides anything ───────────────

set local role postgres;
update public.salon_config
   set settings = '{"minCancellationHours":24,"customerPortal":{"allowCancellations":false}}'::jsonb;
set local role authenticated;

select lives_ok(
  $$ select * from public.cancel_customer_booking(
       '26100000-0000-4000-8000-000000000201', 'Changed plans') $$,
  'a stale legacy allowCancellations=false cannot block a permitted cancellation');

-- ── 4. A missing settings row refuses rather than guesses ───────────

set local role postgres;
set local session_replication_role = replica;
delete from public.booking_policy_settings;
set local session_replication_role = default;
set local role authenticated;

select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '26100000-0000-4000-8000-000000000204', 'Changed plans') $$,
  'SDC01', 'online_cancellation_disabled',
  'with no settings row a cancellation is refused');

select is(
  public.customer_change_deadline_preview(
    (date_trunc('week', current_date) + interval '42 days')::date, '09:00'
  ) -> 'allowCancellations',
  'false'::jsonb,
  'with no settings row the preview reports cancellations off');

select is(
  public.customer_change_deadline_preview(
    (date_trunc('week', current_date) + interval '42 days')::date, '09:00'
  ) -> 'allowRescheduling',
  'false'::jsonb,
  'with no settings row the preview reports rescheduling off');

select * from finish();
rollback;
