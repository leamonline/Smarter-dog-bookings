-- Square deposit payments: the refund, forfeit and carry rules, staff waive
-- and refund, and who may see the row. One transaction, rolled back.
-- The rules match src/engine/depositOutcome.ts.

begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

\ir fixtures/ensure_local_vault_secrets.psql

insert into public.salon_config (pricing, large_dog_slots, settings)
select '{}'::jsonb, '{}'::jsonb, '{"minCancellationHours": 24}'::jsonb
where (select count(*) from public.salon_config) = 0;

update public.salon_config
   set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{minCancellationHours}', '24');

-- ── The rule, with the clock held still ────────────────────
select is(
  smarter_dog_private.square_deposit_outcome(
    'Cancelled', 'customer', date '2026-12-01', '09:00',
    timestamp '2026-11-28 09:00:00' at time zone 'Europe/London'),
  'refund_due',
  'a customer cancellation more than 24 hours before is refunded');

select is(
  smarter_dog_private.square_deposit_outcome(
    'Cancelled', 'customer', date '2026-12-01', '09:00',
    timestamp '2026-11-30 09:00:00' at time zone 'Europe/London'),
  'refund_due',
  'exactly on the 24-hour deadline is still refunded');

select is(
  smarter_dog_private.square_deposit_outcome(
    'Cancelled', 'customer', date '2026-12-01', '09:00',
    timestamp '2026-11-30 09:00:01' at time zone 'Europe/London'),
  'forfeited',
  'one second after the deadline the salon keeps the deposit');

select is(
  smarter_dog_private.square_deposit_outcome(
    'Cancelled', 'customer', date '2026-07-15', '09:00',
    timestamp '2026-07-14 09:00:00' at time zone 'Europe/London'),
  'refund_due',
  'British Summer Time: 09:00 London the day before is still in time');

select is(
  smarter_dog_private.square_deposit_outcome(
    'Cancelled', 'customer', date '2026-07-15', '09:00',
    timestamp '2026-07-14 09:00:01' at time zone 'Europe/London'),
  'forfeited',
  'British Summer Time: one second later is a late cancellation');

select is(
  smarter_dog_private.square_deposit_outcome(
    'No-show', 'customer', date '2026-12-01', '09:00',
    timestamp '2026-11-01 09:00:00' at time zone 'Europe/London'),
  'forfeited',
  'a no-show keeps the deposit');

select is(
  smarter_dog_private.square_deposit_outcome(
    'Cancelled', 'reschedule', date '2026-12-01', '09:00',
    timestamp '2026-11-30 12:00:00' at time zone 'Europe/London'),
  'carry_pending',
  'a reschedule carries the deposit, even inside the notice window');

select is(
  smarter_dog_private.square_deposit_outcome(
    'Cancelled', 'salon', date '2026-12-01', '09:00',
    timestamp '2026-11-30 12:00:00' at time zone 'Europe/London'),
  'refund_due',
  'a salon cancellation is refunded');

select is(
  smarter_dog_private.square_deposit_outcome(
    'Cancelled', null, date '2026-12-01', '09:00',
    timestamp '2026-11-30 12:00:00' at time zone 'Europe/London'),
  'refund_due',
  'a cancellation with no customer cause is refunded');

select ok(
  smarter_dog_private.square_deposit_outcome(
    'Booked', 'customer', date '2026-12-01', '09:00',
    timestamp '2026-11-30 12:00:00' at time zone 'Europe/London') is null,
  'an appointment that is still booked does not decide the money');

select is(
  smarter_dog_private.square_deposit_outcome(
    'Cancelled', 'customer', date '2026-12-01', 'morning',
    timestamp '2026-11-30 12:00:00' at time zone 'Europe/London'),
  'refund_due',
  'a customer cancellation whose slot cannot be read is refunded');

update public.salon_config
   set settings = jsonb_set(settings, '{minCancellationHours}', '48');

select is(
  smarter_dog_private.square_deposit_outcome(
    'Cancelled', 'customer', date '2026-12-01', '09:00',
    timestamp '2026-11-30 09:00:00' at time zone 'Europe/London'),
  'forfeited',
  'a 48-hour notice window keeps a cancellation that is only 24 hours ahead');

select is(
  smarter_dog_private.square_deposit_outcome(
    'Cancelled', 'customer', date '2026-12-01', '09:00',
    timestamp '2026-11-29 09:00:00' at time zone 'Europe/London'),
  'refund_due',
  'exactly on a 48-hour deadline is still refunded');

update public.salon_config
   set settings = jsonb_set(settings, '{minCancellationHours}', '24');

-- ── Fixtures ────────────────────────────────────────────────
insert into auth.users (id) values
  ('26600000-0000-4000-8000-000000000001'),
  ('26600000-0000-4000-8000-00000000000a'),
  ('26600000-0000-4000-8000-00000000000b');

insert into public.staff_profiles (user_id, role, display_name) values
  ('26600000-0000-4000-8000-000000000001', 'owner', 'Deposit Tester');

insert into public.humans (id, name, surname, customer_user_id, deposit_required) values
  ('26600000-0000-4000-8000-000000000010', 'Ada', 'Owner', '26600000-0000-4000-8000-00000000000a', true),
  ('26600000-0000-4000-8000-000000000020', 'Bea', 'Other', '26600000-0000-4000-8000-00000000000b', true);

insert into public.dogs (id, name, human_id, is_pregnant) values
  ('26600000-0000-4000-8000-000000000011', 'Noodle', '26600000-0000-4000-8000-000000000010', false),
  ('26600000-0000-4000-8000-000000000012', 'Biscuit', '26600000-0000-4000-8000-000000000010', false),
  ('26600000-0000-4000-8000-000000000021', 'Crumb', '26600000-0000-4000-8000-000000000020', false);

set local session_replication_role = replica;
insert into public.bookings (id, booking_date, slot, dog_id, size, service, status, payment, deposit_required) values
  ('26600000-0000-4000-8000-000000000101', (date_trunc('week', current_date)::date + 14), '09:00',
   '26600000-0000-4000-8000-000000000011', 'small', 'full-groom', 'Booked', 'Due at Pick-up', true),
  ('26600000-0000-4000-8000-000000000102', (date_trunc('week', current_date)::date + 14), '09:30',
   '26600000-0000-4000-8000-000000000011', 'small', 'full-groom', 'Booked', 'Due at Pick-up', true),
  ('26600000-0000-4000-8000-000000000103', (date_trunc('week', current_date)::date + 14), '10:00',
   '26600000-0000-4000-8000-000000000011', 'small', 'full-groom', 'Booked', 'Due at Pick-up', true),
  ('26600000-0000-4000-8000-000000000104', (date_trunc('week', current_date)::date + 14), '10:30',
   '26600000-0000-4000-8000-000000000012', 'small', 'full-groom', 'Booked', 'Due at Pick-up', true),
  ('26600000-0000-4000-8000-000000000105', (date_trunc('week', current_date)::date + 21), '09:00',
   '26600000-0000-4000-8000-000000000012', 'small', 'full-groom', 'Booked', 'Due at Pick-up', true),
  ('26600000-0000-4000-8000-000000000106', (date_trunc('week', current_date)::date + 21), '09:30',
   '26600000-0000-4000-8000-000000000012', 'small', 'full-groom', 'Booked', 'Due at Pick-up', true),
  ('26600000-0000-4000-8000-000000000107', (date_trunc('week', current_date)::date + 21), '10:00',
   '26600000-0000-4000-8000-000000000011', 'small', 'full-groom', 'Booked', 'Due at Pick-up', true),
  ('26600000-0000-4000-8000-000000000108', (date_trunc('week', current_date)::date + 21), '10:30',
   '26600000-0000-4000-8000-000000000011', 'small', 'full-groom', 'Booked', 'Due at Pick-up', true),
  ('26600000-0000-4000-8000-000000000111', (date_trunc('week', current_date)::date + 28), '11:00',
   '26600000-0000-4000-8000-000000000011', 'small', 'full-groom', 'Booked', 'Due at Pick-up', true),
  ('26600000-0000-4000-8000-000000000201', (date_trunc('week', current_date)::date + 14), '11:00',
   '26600000-0000-4000-8000-000000000021', 'small', 'full-groom', 'Booked', 'Due at Pick-up', true);

insert into public.deposit_payments (
  id, booking_id, original_booking_id, human_id, amount_pence, currency, status, idempotency_key, square_payment_id
) values
  ('26600000-0000-4000-8000-000000000301', '26600000-0000-4000-8000-000000000101',
   '26600000-0000-4000-8000-000000000101', '26600000-0000-4000-8000-000000000010',
   1000, 'GBP', 'completed', 'idem-301', 'sq-301'),
  ('26600000-0000-4000-8000-000000000302', '26600000-0000-4000-8000-000000000102',
   '26600000-0000-4000-8000-000000000102', '26600000-0000-4000-8000-000000000010',
   1000, 'GBP', 'pending', 'idem-302', null),
  ('26600000-0000-4000-8000-000000000303', '26600000-0000-4000-8000-000000000103',
   '26600000-0000-4000-8000-000000000103', '26600000-0000-4000-8000-000000000010',
   1000, 'GBP', 'completed', 'idem-303', 'sq-303'),
  ('26600000-0000-4000-8000-000000000304', '26600000-0000-4000-8000-000000000104',
   '26600000-0000-4000-8000-000000000104', '26600000-0000-4000-8000-000000000010',
   1000, 'GBP', 'completed', 'idem-304', 'sq-304'),
  ('26600000-0000-4000-8000-000000000305', '26600000-0000-4000-8000-000000000105',
   '26600000-0000-4000-8000-000000000105', '26600000-0000-4000-8000-000000000010',
   1000, 'GBP', 'completed', 'idem-305', 'sq-305'),
  ('26600000-0000-4000-8000-000000000306', '26600000-0000-4000-8000-000000000106',
   '26600000-0000-4000-8000-000000000106', '26600000-0000-4000-8000-000000000010',
   1000, 'GBP', 'forfeited', 'idem-306', 'sq-306'),
  ('26600000-0000-4000-8000-000000000401', '26600000-0000-4000-8000-000000000201',
   '26600000-0000-4000-8000-000000000201', '26600000-0000-4000-8000-000000000020',
   1000, 'GBP', 'completed', 'idem-401', 'sq-401'),
  ('26600000-0000-4000-8000-000000000307', '26600000-0000-4000-8000-000000000107',
   '26600000-0000-4000-8000-000000000107', '26600000-0000-4000-8000-000000000010',
   1000, 'GBP', 'pending', 'idem-307', null);
set local session_replication_role = default;

-- Triggers: in-time cancel refunds; a pending charge is left alone; no-show keeps it.
update public.bookings
   set status = 'Cancelled', cancellation_cause = 'customer', cancel_reason = 'Cannot attend'
 where id = '26600000-0000-4000-8000-000000000101';

select is(
  (select status from public.deposit_payments where id = '26600000-0000-4000-8000-000000000301'),
  'refund_due',
  'cancelling with notice marks the taken deposit refund_due');
select ok(
  (select refund_idempotency_key is not null from public.deposit_payments where id = '26600000-0000-4000-8000-000000000301'),
  'the refund has an idempotency key before Square is called');

update public.bookings
   set status = 'Cancelled', cancellation_cause = 'customer', cancel_reason = 'Cannot attend'
 where id = '26600000-0000-4000-8000-000000000102';
select is(
  (select status from public.deposit_payments where id = '26600000-0000-4000-8000-000000000302'),
  'pending',
  'a charge Square has not confirmed yet is not forfeited or refunded by the cancel');
select is(
  (select deferred_outcome from public.deposit_payments where id = '26600000-0000-4000-8000-000000000302'),
  'refund_due',
  'the in-time cancellation is remembered for when Square confirms the charge');
select is(
  (public.settle_square_deposit_charge(
    '26600000-0000-4000-8000-000000000302', 'sq-late-ok', 'COMPLETED', 1000, 'GBP', null))->>'status',
  'refund_due',
  'a charge confirmed after an in-time cancellation is refunded, not kept');

update public.bookings
   set status = 'No-show'
 where id = '26600000-0000-4000-8000-000000000103';
select is(
  (select status from public.deposit_payments where id = '26600000-0000-4000-8000-000000000303'),
  'forfeited',
  'marking a no-show keeps the deposit');

update public.bookings
   set status = 'Cancelled', cancellation_cause = 'customer', cancel_reason = 'No payment row'
 where id = '26600000-0000-4000-8000-000000000107';
select is(
  (select status from public.bookings where id = '26600000-0000-4000-8000-000000000107'),
  'Cancelled',
  'a booking with no app deposit still cancels');

-- Reschedule carries the payment onto the replacement.
update public.bookings
   set status = 'Cancelled', cancellation_cause = 'reschedule', cancel_reason = 'Moving the appointment'
 where id = '26600000-0000-4000-8000-000000000104';
select is(
  (select disposition from public.deposit_payments where id = '26600000-0000-4000-8000-000000000304'),
  'carry_pending',
  'cancelling for a reschedule holds the deposit to be carried');

set local session_replication_role = replica;
insert into public.bookings (id, booking_date, slot, dog_id, size, service, status, payment, deposit_required) values
  ('26600000-0000-4000-8000-000000000109', (date_trunc('week', current_date)::date + 28), '09:00',
   '26600000-0000-4000-8000-000000000012', 'small', 'full-groom', 'Booked', 'Due at Pick-up', true);
set local session_replication_role = default;

select is(
  smarter_dog_private.attach_carried_square_deposit('26600000-0000-4000-8000-000000000109'),
  '26600000-0000-4000-8000-000000000304'::uuid,
  'the replacement booking receives the carried deposit');
select is(
  (select booking_id from public.deposit_payments where id = '26600000-0000-4000-8000-000000000304'),
  '26600000-0000-4000-8000-000000000109'::uuid,
  'the payment row now points at the new booking');
select is(
  (select disposition from public.deposit_payments where id = '26600000-0000-4000-8000-000000000304'),
  'carried',
  'the payment is marked carried');
select is(
  (select payment from public.bookings where id = '26600000-0000-4000-8000-000000000109'),
  'Deposit Paid',
  'the new booking is marked deposit paid so the customer is not charged again');
select ok(
  (select deposit_received_at is not null from public.bookings where id = '26600000-0000-4000-8000-000000000109'),
  'the carried deposit stamps deposit_received_at');

-- A carry from another transaction stays put, even if it was marked just now.
update public.deposit_payments
   set disposition = 'carry_pending',
       disposition_at = now(),
       carry_txid = 0
 where id = '26600000-0000-4000-8000-000000000305';
set local session_replication_role = replica;
insert into public.bookings (id, booking_date, slot, dog_id, size, service, status, payment, deposit_required) values
  ('26600000-0000-4000-8000-000000000110', (date_trunc('week', current_date)::date + 28), '10:00',
   '26600000-0000-4000-8000-000000000012', 'small', 'full-groom', 'Booked', 'Due at Pick-up', true);
set local session_replication_role = default;
select ok(
  smarter_dog_private.attach_carried_square_deposit('26600000-0000-4000-8000-000000000110') is null,
  'a later booking for the same dog does not receive a deposit held for a different reschedule');

-- ── Staff ───────────────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-00000000000a","role":"authenticated"}',
  true);
set local role authenticated;
select throws_ok(
  $$select public.staff_waive_booking_deposit('26600000-0000-4000-8000-000000000108', 'please')$$,
  '42501', null, 'a customer cannot waive a deposit');
select throws_ok(
  $$select public.staff_refund_booking_deposit('26600000-0000-4000-8000-000000000306', 'please')$$,
  '42501', null, 'a customer cannot refund a deposit');
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-000000000001","role":"authenticated"}',
  true);
set local role authenticated;
select ok(
  (select (public.staff_waive_booking_deposit(
    '26600000-0000-4000-8000-000000000108', 'we know this customer'))->>'status' = 'waived'),
  'staff can waive a deposit that has not been taken');
select is(
  (select deposit_required from public.bookings where id = '26600000-0000-4000-8000-000000000108'),
  false,
  'waiving clears the deposit requirement on that booking only');
select throws_ok(
  $$select public.staff_waive_booking_deposit('26600000-0000-4000-8000-000000000306', 'too late')$$,
  'P0001', null, 'staff cannot waive a deposit Square has already taken');
select throws_ok(
  $$select public.staff_waive_booking_deposit('26600000-0000-4000-8000-000000000107', 'too soon')$$,
  'P0001', null, 'staff cannot waive a deposit while Square has not answered');
select ok(
  (select (public.staff_refund_booking_deposit(
    '26600000-0000-4000-8000-000000000306', 'the dog was ill'))->>'status' = 'refund_due'),
  'staff can refund a deposit the rules had kept');
select is(
  (select refund_idempotency_key from public.deposit_payments where id = '26600000-0000-4000-8000-000000000306'),
  (select (public.staff_refund_booking_deposit(
    '26600000-0000-4000-8000-000000000306', 'the dog was ill'))->>'refund_idempotency_key'),
  'repeating the refund keeps the same Square idempotency key');
reset role;

-- ── Who can see and write the table ─────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-00000000000a","role":"authenticated"}',
  true);
set local role authenticated;
select is(
  (select count(*) from public.deposit_payments where id = '26600000-0000-4000-8000-000000000401'),
  0::bigint,
  'a customer cannot see another customer''s deposit');
select ok(
  (select count(*) from public.deposit_payments where id = '26600000-0000-4000-8000-000000000301') = 1,
  'a customer can see a deposit on their own booking');
select throws_ok(
  $$insert into public.deposit_payments (booking_id, original_booking_id, amount_pence, status, idempotency_key)
    values ('26600000-0000-4000-8000-000000000108', '26600000-0000-4000-8000-000000000108', 1000, 'pending', 'nope')$$,
  '42501', null, 'a customer cannot insert a deposit payment');
reset role;

set local role anon;
select throws_ok(
  'select count(*) from public.deposit_payments',
  '42501', null, 'anon cannot read deposit payments');
reset role;

set local role authenticated;
select throws_ok(
  $$select public.prepare_square_deposit_charge(
    '26600000-0000-4000-8000-000000000111', '26600000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'the charge helper is not granted to a signed-in customer directly');
reset role;

-- Service-role helpers, run as the table owner the way the Edge Function's
-- security-definer call does. Wrong owner, then a real £10 charge.
select is(
  (public.prepare_square_deposit_charge(
    '26600000-0000-4000-8000-000000000111',
    '26600000-0000-4000-8000-00000000000b'))->>'reason',
  'booking_not_found',
  'a charge for someone else''s booking is refused');

select is(
  (public.prepare_square_deposit_charge(
    '26600000-0000-4000-8000-000000000111',
    '26600000-0000-4000-8000-00000000000a'))->>'amount_pence',
  '1000',
  'the charge is £10');
select is(
  (public.prepare_square_deposit_charge(
    '26600000-0000-4000-8000-000000000111',
    '26600000-0000-4000-8000-00000000000a'))->>'idempotency_key',
  (select idempotency_key from public.deposit_payments
    where booking_id = '26600000-0000-4000-8000-000000000111' and status = 'pending'),
  'a retry reuses the idempotency key instead of opening a second charge');

select is(
  (public.settle_square_deposit_charge(
    (select id from public.deposit_payments
      where booking_id = '26600000-0000-4000-8000-000000000111' and status = 'pending'),
    'sq-paid', 'COMPLETED', 1000, 'GBP', null))->>'status',
  'completed',
  'Square completing the £10 marks the payment completed');
select is(
  (select payment from public.bookings where id = '26600000-0000-4000-8000-000000000111'),
  'Deposit Paid',
  'and the booking is marked deposit paid');

update public.bookings set deposit_required = true where id = '26600000-0000-4000-8000-000000000110';
select public.prepare_square_deposit_charge(
  '26600000-0000-4000-8000-000000000110',
  '26600000-0000-4000-8000-00000000000a');
select is(
  (public.settle_square_deposit_charge(
    (select id from public.deposit_payments
      where booking_id = '26600000-0000-4000-8000-000000000110' and status = 'pending'),
    'sq-wrong', 'COMPLETED', 500, 'GBP', null))->>'reason',
  'amount_mismatch',
  'a completed charge for anything other than £10 is not kept');
select is(
  (select payment from public.bookings where id = '26600000-0000-4000-8000-000000000110'),
  'Due at Pick-up',
  'the wrong amount does not mark the booking deposit paid');

-- A waiver that beats the Square response must still send the money back.
update public.deposit_payments
   set status = 'waived'
 where id = '26600000-0000-4000-8000-000000000307';
select is(
  (public.settle_square_deposit_charge(
    '26600000-0000-4000-8000-000000000307', 'sq-waived-capture', 'COMPLETED', 1000, 'GBP', null))->>'status',
  'refund_due',
  'a charge that captures after a waiver is refunded');
select is(
  (select square_payment_id from public.deposit_payments where id = '26600000-0000-4000-8000-000000000307'),
  'sq-waived-capture',
  'the captured Square id is kept so the refund can be sent');

-- Refunding a deposit that was already marked paid removes that credit.
select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-000000000001","role":"authenticated"}',
  true);
set local role authenticated;
select is(
  (public.staff_refund_booking_deposit(
    '26600000-0000-4000-8000-000000000111', 'paid in error'))->>'status',
  'refund_due',
  'staff can refund a deposit on an appointment that is still booked');
reset role;
select is(
  (public.settle_square_deposit_refund(
    (select id from public.deposit_payments
      where booking_id = '26600000-0000-4000-8000-000000000111' and status = 'refund_due'),
    'sq-refund-111', 'COMPLETED', null))->>'status',
  'refunded',
  'Square confirming the refund stores it');
select is(
  (select payment from public.bookings where id = '26600000-0000-4000-8000-000000000111'),
  'Due at Pick-up',
  'refunding the deposit removes the Deposit Paid credit from the booking');

-- Merging a customer moves their deposit onto the surviving person.
update public.dogs
   set human_id = '26600000-0000-4000-8000-000000000010'
 where id = '26600000-0000-4000-8000-000000000021';
delete from public.humans where id = '26600000-0000-4000-8000-000000000020';
select is(
  (select human_id from public.deposit_payments where id = '26600000-0000-4000-8000-000000000401'),
  '26600000-0000-4000-8000-000000000010'::uuid,
  'deleting a merged customer keeps the deposit on the surviving person');

select * from finish();
rollback;
