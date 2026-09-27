-- Synthetic payment writes with the actual payment/history triggers enabled.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\ir fixtures/ensure_local_vault_secrets.psql

set local session_replication_role = replica;
insert into public.staff_profiles(user_id, display_name) values
  ('87900000-0000-4000-8000-000000000001', 'Payment history test');
insert into public.humans(id, name, surname) values
  ('87900000-0000-4000-8000-000000000002', 'Synthetic', 'History');
insert into public.dogs(id, name, human_id, is_pregnant) values
  ('87900000-0000-4000-8000-000000000003', 'Synthetic',
   '87900000-0000-4000-8000-000000000002', false);
insert into public.bookings(id, booking_date, slot, dog_id, size, service, status, payment)
values ('87900000-0000-4000-8000-000000000004',
        (date_trunc('week', current_date) + interval '7 days')::date,
        '09:00', '87900000-0000-4000-8000-000000000003', 'small', 'full-groom',
        'Booked', 'Due at Pick-up');
set local session_replication_role = default;
set local request.jwt.claims = '{"sub":"87900000-0000-4000-8000-000000000001","role":"authenticated"}';

update public.bookings set payment = 'Paid in Full', paid_amount = 42.50,
  payment_method = 'card', deposit_amount = 10
where id = '87900000-0000-4000-8000-000000000004';
select is((select count(*) from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004'), 1::bigint,
  'first post-install update captures a baseline without a backfill');
select is((select before_values->>'payment' from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004'), 'Due at Pick-up',
  'old status survives the write');
select is((select after_values from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004'),
  (select public.booking_payment_snapshot(b) from public.bookings b
   where id = '87900000-0000-4000-8000-000000000004'),
  'history records the actual final row including trigger-stamped paid_at');
select is((select actor_id from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004'),
  '87900000-0000-4000-8000-000000000001'::uuid, 'records authenticated actor');

update public.bookings set paid_amount = 42.50, notes = 'Unrelated change'
where id = '87900000-0000-4000-8000-000000000004';
select is((select count(*) from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004'), 1::bigint,
  'identical payment and unrelated edits do not create noise');

-- Reproduce the incident; the bad write remains traceable.
update public.bookings set paid_amount = 0, payment_method = null
where id = '87900000-0000-4000-8000-000000000004';
select is((select (before_values->>'paid_amount')::numeric
  from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004' order by id desc limit 1),
  42.50::numeric, 'a bad overwrite preserves the previous exact amount');
select set_config('test.payment_bad_event', (select max(id)::text
  from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004'), true);

set local role authenticated;
select lives_ok($$select public.restore_booking_payment(
  '87900000-0000-4000-8000-000000000004',
  current_setting('test.payment_bad_event')::bigint,
  current_setting('test.payment_bad_event')::bigint,
  'Correct synthetic checkout overwrite')$$, 'staff can restore a recorded change');
select is((select paid_amount from public.bookings
  where id = '87900000-0000-4000-8000-000000000004'), 42.50::numeric,
  'restore fixes the actual stored amount');
select is((select payment_method from public.bookings
  where id = '87900000-0000-4000-8000-000000000004'), 'card', 'restore fixes method');
select is((select notes from public.bookings
  where id = '87900000-0000-4000-8000-000000000004'), 'Unrelated change',
  'restore does not overwrite unrelated booking edits');
select is((select count(*) from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004'), 3::bigint,
  'restore appends history instead of erasing the bad event');
select is((select restored_from from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004' order by id desc limit 1),
  current_setting('test.payment_bad_event')::bigint, 'correction links to original event');
select is((select reason from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004' order by id desc limit 1),
  'Correct synthetic checkout overwrite', 'correction reason is preserved');
select throws_ok($$select public.restore_booking_payment(
  '87900000-0000-4000-8000-000000000004',
  current_setting('test.payment_bad_event')::bigint,
  current_setting('test.payment_bad_event')::bigint, 'Retry')$$,
  '40001', null, 'stale restore cannot overwrite a newer change');
select throws_ok($$select public.restore_booking_payment(
  '87900000-0000-4000-8000-000000000004', 1, 1, ' ')$$,
  '22023', null, 'blank correction reason is refused');
select throws_ok($$update public.booking_payment_history set reason = 'Hide evidence'$$,
  '42501', null, 'staff cannot rewrite history');
select throws_ok($$delete from public.booking_payment_history$$,
  '42501', null, 'staff cannot erase history');
select throws_ok($$truncate public.booking_payment_history$$,
  '42501', null, 'staff cannot truncate history');
select throws_ok($$insert into public.booking_payment_history
  (booking_id, operation, after_values, actor_role)
  values ('87900000-0000-4000-8000-000000000004', 'INSERT', '{}', 'forged')$$,
  '42501', null, 'staff cannot forge an event');
reset role;

savepoint payment_rollback;
update public.bookings set deposit_amount = 15
where id = '87900000-0000-4000-8000-000000000004';
select is((select (after_values->>'deposit_amount')::numeric
  from public.booking_payment_history where booking_id = '87900000-0000-4000-8000-000000000004'
  order by id desc limit 1), 15::numeric, 'deposit-only changes are recorded');
select is((select restored_from from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004' order by id desc limit 1),
  null::bigint, 'correction context does not leak to the next write');
rollback to payment_rollback;
select is((select count(*) from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004'), 3::bigint,
  'transaction rollback also rolls back history');

set local request.jwt.claims = '{"sub":"87900000-0000-4000-8000-000000000099","role":"authenticated"}';
set local role authenticated;
select is((select count(*) from public.booking_payment_history), 0::bigint,
  'a non-staff customer cannot read payment history');
select throws_ok($$select public.restore_booking_payment(
  '87900000-0000-4000-8000-000000000004', 1, 1, 'Forged correction')$$,
  '42501', 'Staff access required', 'customer cannot restore payments');
reset role;
set local role anon;
select throws_ok($$select * from public.booking_payment_history$$,
  '42501', null, 'anonymous history read is refused');
select throws_ok($$select public.restore_booking_payment(
  '87900000-0000-4000-8000-000000000004', 1, 1, 'Forged correction')$$,
  '42501', null, 'anonymous recovery is refused');
reset role;

update public.bookings set payment = 'Due at Pick-up'
where id = '87900000-0000-4000-8000-000000000004';
select is((select after_values->'paid_amount' from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004' order by id desc limit 1),
  'null'::jsonb, 'clearing payment captures the final cleared fields');
delete from public.bookings where id = '87900000-0000-4000-8000-000000000004';
select is((select operation from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004' order by id desc limit 1),
  'DELETE', 'booking deletion records its last payment values');
select is((select count(*) from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000004'), 5::bigint,
  'booking deletion does not cascade into payment history');

-- A cancelled synthetic insert skips capacity allocation but retains AFTER
-- triggers; it exercises insertion without modifying an operational booking.
set local request.jwt.claims = '{"sub":"87900000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.bookings(id, booking_date, slot, dog_id, size, service, status, payment)
values ('87900000-0000-4000-8000-000000000005',
        (date_trunc('week', current_date) + interval '7 days')::date,
        '09:00', '87900000-0000-4000-8000-000000000003', 'small', 'full-groom',
        'Cancelled', 'Due at Pick-up');
select is((select operation from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000005'), 'INSERT',
  'new booking records its initial payment state');
select is((select before_values from public.booking_payment_history
  where booking_id = '87900000-0000-4000-8000-000000000005'), null::jsonb,
  'insert does not invent a previous payment');
select throws_ok($$select public.restore_booking_payment(
  '87900000-0000-4000-8000-000000000005',
  current_setting('test.payment_bad_event')::bigint,
  (select max(id) from public.booking_payment_history
   where booking_id = '87900000-0000-4000-8000-000000000005'), 'Wrong booking')$$,
  '22023', 'Choose a payment change for this booking',
  'an event from another booking cannot be restored');
select throws_ok($$select public.restore_booking_payment(
  '87900000-0000-4000-8000-000000000004',
  current_setting('test.payment_bad_event')::bigint,
  current_setting('test.payment_bad_event')::bigint, 'Deleted booking')$$,
  'P0002', 'Booking no longer exists', 'restore never recreates a deleted booking');
select * from finish();
rollback;
