-- Customer cancellation is one server-authoritative command. Synthetic
-- fixtures are rolled back; no identifiable customer data is read.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Prove the command uses the salon's London wall clock rather than inheriting
-- the database session timezone.
set local timezone = 'Pacific/Auckland';

select vault.create_secret('http://localhost:54321', 'supabase_url');
select vault.create_secret('pgtap-test-secret', 'webhook_secret');

set local session_replication_role = replica;

insert into public.humans (id, name, surname, customer_user_id) values
  (
    '41000000-0000-4000-8000-000000000001',
    'Cancellation Customer',
    'Owner',
    '41000000-0000-4000-8000-000000000002'
  ),
  (
    '41000000-0000-4000-8000-000000000010',
    'Other Customer',
    'Owner',
    '41000000-0000-4000-8000-000000000011'
  );

insert into public.dogs (id, name, breed, human_id, size) values
  (
    '42000000-0000-4000-8000-000000000001',
    'Owned One', 'Poodle',
    '41000000-0000-4000-8000-000000000001', 'small'
  ),
  (
    '42000000-0000-4000-8000-000000000002',
    'Owned Two', 'Poodle',
    '41000000-0000-4000-8000-000000000001', 'medium'
  ),
  (
    '42000000-0000-4000-8000-000000000010',
    'Other Dog', 'Poodle',
    '41000000-0000-4000-8000-000000000010', 'small'
  );

insert into public.bookings (
  id, booking_date, slot, dog_id, size, service, status, confirmed,
  payment, group_id, staff_capacity_override, staff_capacity_override_by,
  staff_capacity_override_at
) values
  -- Successful owned group. The first row carries staff override audit data
  -- which a cancellation must preserve.
  (
    '43000000-0000-4000-8000-000000000001', current_date + 30, '09:00',
    '42000000-0000-4000-8000-000000000001', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up',
    '44000000-0000-4000-8000-000000000001', true,
    '45000000-0000-4000-8000-000000000001',
    '2026-07-01 10:00:00+00'
  ),
  (
    '43000000-0000-4000-8000-000000000002', current_date + 30, '10:00',
    '42000000-0000-4000-8000-000000000002', 'medium', 'full-groom',
    'Booked', false, 'Due at Pick-up',
    '44000000-0000-4000-8000-000000000001', false, null, null
  ),
  -- Staff recurring bookings reuse group_id across dates. This later visit
  -- must not be pulled into the target date's atomic cancellation.
  (
    '43000000-0000-4000-8000-000000000003', current_date + 37, '09:00',
    '42000000-0000-4000-8000-000000000001', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up',
    '44000000-0000-4000-8000-000000000001', false, null, null
  ),
  -- Another customer's singleton.
  (
    '43000000-0000-4000-8000-000000000010', current_date + 30, '09:00',
    '42000000-0000-4000-8000-000000000010', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up', null, false, null, null
  ),
  -- Disabled-setting and deadline singletons.
  (
    '43000000-0000-4000-8000-000000000020', current_date + 30, '10:00',
    '42000000-0000-4000-8000-000000000001', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up', null, false, null, null
  ),
  (
    '43000000-0000-4000-8000-000000000021',
    ((now() at time zone 'Europe/London') + interval '48 hours')::date,
    to_char(
      (now() at time zone 'Europe/London') + interval '48 hours',
      'HH24:MI:SS.US'
    ),
    '42000000-0000-4000-8000-000000000001', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up', null, false, null, null
  ),
  (
    '43000000-0000-4000-8000-000000000022',
    (
      (now() at time zone 'Europe/London')
      + interval '48 hours'
      - interval '1 microsecond'
    )::date,
    to_char(
      (now() at time zone 'Europe/London')
      + interval '48 hours'
      - interval '1 microsecond',
      'HH24:MI:SS.US'
    ),
    '42000000-0000-4000-8000-000000000001', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up', null, false, null, null
  ),
  -- Missing and malformed setting values must use documented defaults.
  (
    '43000000-0000-4000-8000-000000000023',
    ((now() at time zone 'Europe/London') + interval '24 hours')::date,
    to_char(
      (now() at time zone 'Europe/London') + interval '24 hours',
      'HH24:MI:SS.US'
    ),
    '42000000-0000-4000-8000-000000000001', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up', null, false, null, null
  ),
  (
    '43000000-0000-4000-8000-000000000024',
    (
      (now() at time zone 'Europe/London')
      + interval '24 hours'
      - interval '1 microsecond'
    )::date,
    to_char(
      (now() at time zone 'Europe/London')
      + interval '24 hours'
      - interval '1 microsecond',
      'HH24:MI:SS.US'
    ),
    '42000000-0000-4000-8000-000000000001', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up', null, false, null, null
  ),
  (
    '43000000-0000-4000-8000-000000000025',
    ((now() at time zone 'Europe/London') + interval '24 hours')::date,
    to_char(
      (now() at time zone 'Europe/London') + interval '24 hours',
      'HH24:MI:SS.US'
    ),
    '42000000-0000-4000-8000-000000000002', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up', null, false, null, null
  ),
  (
    '43000000-0000-4000-8000-000000000026',
    (
      (now() at time zone 'Europe/London')
      + interval '24 hours'
      - interval '1 microsecond'
    )::date,
    to_char(
      (now() at time zone 'Europe/London')
      + interval '24 hours'
      - interval '1 microsecond',
      'HH24:MI:SS.US'
    ),
    '42000000-0000-4000-8000-000000000002', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up', null, false, null, null
  ),
  (
    '43000000-0000-4000-8000-000000000027', current_date + 30, '11:30',
    '42000000-0000-4000-8000-000000000001', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up', null, false, null, null
  ),
  -- A mixed-status owned group must roll back as a unit.
  (
    '43000000-0000-4000-8000-000000000030', current_date + 30, '12:00',
    '42000000-0000-4000-8000-000000000001', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up',
    '44000000-0000-4000-8000-000000000030', false, null, null
  ),
  (
    '43000000-0000-4000-8000-000000000031', current_date + 30, '12:30',
    '42000000-0000-4000-8000-000000000002', 'medium', 'full-groom',
    'Completed', false, 'Due at Pick-up',
    '44000000-0000-4000-8000-000000000030', false, null, null
  ),
  -- Corrupt/mixed ownership inside one stored group must also fail closed.
  (
    '43000000-0000-4000-8000-000000000040', current_date + 30, '13:00',
    '42000000-0000-4000-8000-000000000001', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up',
    '44000000-0000-4000-8000-000000000040', false, null, null
  ),
  (
    '43000000-0000-4000-8000-000000000041', current_date + 30, '13:00',
    '42000000-0000-4000-8000-000000000010', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up',
    '44000000-0000-4000-8000-000000000040', false, null, null
  ),
  -- Direct-update probe.
  (
    '43000000-0000-4000-8000-000000000050', current_date + 31, '09:00',
    '42000000-0000-4000-8000-000000000001', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up', null, false, null, null
  );

-- Exercise fields managed by unrelated booking triggers. Cancellation may
-- change only status, cancel_reason and the standard updated_at timestamp.
update public.bookings
set addons = array['nails'],
    pickup_by_id = '41000000-0000-4000-8000-000000000001',
    payment = 'Paid in Full',
    deposit_amount = 10,
    source = 'customer_portal',
    notes = 'Preserve this cancellation sentinel',
    breed_snapshot = 'Poodle snapshot',
    dog_name_snapshot = 'Owned One snapshot',
    owner_name_snapshot = 'Cancellation Customer snapshot',
    reminder_confirmed_at = '2026-07-01 08:00:00+00',
    notify_human_ids = array['41000000-0000-4000-8000-000000000001'::uuid],
    confirmation_channel = 'email',
    completed_at = '2026-07-01 09:00:00+00',
    checked_in_at = '2026-07-01 08:30:00+00',
    ready_at = '2026-07-01 08:50:00+00',
    payment_method = 'card',
    paid_at = '2026-07-01 09:05:00+00',
    paid_amount = 55,
    price_override = 55,
    created_by_id = '41000000-0000-4000-8000-000000000002',
    created_by_role = 'customer',
    created_by_name = 'Cancellation Customer'
where id = '43000000-0000-4000-8000-000000000001';

insert into public.salon_config (settings)
select '{"minCancellationHours":24,"customerPortal":{"allowCancellations":true}}'::jsonb
where not exists (select 1 from public.salon_config);

set local session_replication_role = default;

create temp table _before_success as
select id,
       to_jsonb(b) - array['status', 'cancel_reason', 'updated_at']::text[]
         as snapshot
from public.bookings b
where group_id = '44000000-0000-4000-8000-000000000001';
grant select on _before_success to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000010', 'Not mine'
     ) $$,
  'SDC03', null,
  'another customer booking is rejected without disclosure'
);

select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000050', '   '
     ) $$,
  '22023', null,
  'a blank cancellation reason is rejected'
);

select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000050', repeat('x', 501)
     ) $$,
  '22023', null,
  'a cancellation reason longer than 500 characters is rejected'
);

reset role;
update public.salon_config
set settings = '{"minCancellationHours":24,"customerPortal":{"allowCancellations":false}}'::jsonb;
set local role authenticated;

select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000020', 'Changed plans'
     ) $$,
  'SDC01', null,
  'disabled online cancellation is enforced server-side'
);

reset role;
update public.salon_config
set settings = '{"minCancellationHours":48,"customerPortal":{"allowCancellations":true}}'::jsonb;
set local role authenticated;

select lives_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000021', 'Changed plans'
     ) $$,
  'a request exactly on the London cancellation deadline is allowed'
);

select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000022', 'Changed plans'
     ) $$,
  'SDC02', null,
  'a request one microsecond after the London deadline is rejected'
);

reset role;
update public.salon_config set settings = '{}'::jsonb;
set local role authenticated;

select lives_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000023', 'Changed plans'
     ) $$,
  'missing cancellation settings allow the exact default 24-hour deadline'
);

select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000024', 'Changed plans'
     ) $$,
  'SDC02', null,
  'missing cancellation settings reject one microsecond inside the default 24-hour deadline'
);

reset role;
update public.salon_config
set settings = '{"minCancellationHours":"invalid","customerPortal":{"allowCancellations":"invalid"}}'::jsonb;
set local role authenticated;

select lives_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000025', 'Changed plans'
     ) $$,
  'malformed cancellation settings allow the exact default 24-hour deadline without a cast error'
);

select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000026', 'Changed plans'
     ) $$,
  'SDC02', null,
  'malformed cancellation settings reject one microsecond inside the default 24-hour deadline'
);

reset role;
update public.salon_config
set settings = '{"minCancellationHours":48,"customerPortal":{"allowCancellations":true}}'::jsonb;

insert into public.salon_config (id, settings) values (
  '46000000-0000-4000-8000-000000000001',
  '{"minCancellationHours":48,"customerPortal":{"allowCancellations":true}}'::jsonb
);
set local role authenticated;

select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000027', 'Changed plans'
     ) $$,
  'SDC01', null,
  'duplicate cancellation configuration fails closed'
);

reset role;
delete from public.salon_config
where id = '46000000-0000-4000-8000-000000000001';
set local role authenticated;

create temp table _success_receipt as
select * from public.cancel_customer_booking(
  '43000000-0000-4000-8000-000000000001', 'Changed plans'
);

select is(
  (select cancelled_count from _success_receipt),
  2,
  'a successful grouped cancellation returns the exact row count'
);

select is(
  (select cancelled_booking_ids from _success_receipt),
  array[
    '43000000-0000-4000-8000-000000000001'::uuid,
    '43000000-0000-4000-8000-000000000002'::uuid
  ],
  'the receipt returns the complete deterministic group ID set'
);

select ok(
  (select target_booking_id = '43000000-0000-4000-8000-000000000001'::uuid
          and booking_group_id = '44000000-0000-4000-8000-000000000001'::uuid
          and cancelled_at is not null
   from _success_receipt),
  'the receipt identifies the requested booking, stored group and timestamp'
);

select ok(
  (select count(*) = 2
          and bool_and(status = 'Cancelled')
          and bool_and(cancel_reason = 'Changed plans')
   from public.bookings
   where group_id = '44000000-0000-4000-8000-000000000001'
     and booking_date = current_date + 30),
  'the whole group is cancelled with one reason'
);

select is(
  (select status
   from public.bookings
   where id = '43000000-0000-4000-8000-000000000003'),
  'Booked'::text,
  'a later recurring appointment sharing group_id remains booked'
);

select results_eq(
  $$ select id,
            to_jsonb(b) - array['status', 'cancel_reason', 'updated_at']::text[]
              as snapshot
     from public.bookings b
     where group_id = '44000000-0000-4000-8000-000000000001'
     order by id $$,
  $$ select id, snapshot from _before_success order by id $$,
  'cancellation preserves every non-cancellation field including trigger-managed audit data'
);

select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000030', 'Changed plans'
     ) $$,
  'SDC03', null,
  'a mixed-status group is rejected atomically'
);

select ok(
  (select count(*) = 2
          and count(*) filter (where status = 'Booked') = 1
          and count(*) filter (where status = 'Completed') = 1
          and bool_and(cancel_reason is null)
   from public.bookings
   where group_id = '44000000-0000-4000-8000-000000000030'),
  'a rejected mixed-status group remains unchanged'
);

select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000040', 'Changed plans'
     ) $$,
  'SDC03', null,
  'mixed ownership inside a stored group fails closed'
);

reset role;
select ok(
  (select count(*) = 2
          and bool_and(status = 'Booked')
          and bool_and(cancel_reason is null)
   from public.bookings
   where group_id = '44000000-0000-4000-8000-000000000040'),
  'a rejected mixed-ownership group remains unchanged'
);

set local role authenticated;

with changed as (
  update public.bookings
     set status = 'Cancelled',
         cancel_reason = 'Forged',
         service = 'other',
         payment = 'Free'
   where id = '43000000-0000-4000-8000-000000000050'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'a raw customer multi-column cancellation update affects zero rows'
);

select ok(
  (select status = 'Booked'
          and cancel_reason is null
          and service = 'full-groom'
          and payment = 'Due at Pick-up'
   from public.bookings
   where id = '43000000-0000-4000-8000-000000000050'),
  'the blocked raw update changes no booking fields'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000050', 'Changed plans'
     ) $$,
  '42501', null,
  'anon cannot execute the customer cancellation function'
);

reset role;
select * from finish();
rollback;
