-- Customer cancellation is one server-authoritative command. Synthetic
-- fixtures are rolled back; no identifiable customer data is read.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select vault.create_secret('http://localhost:54321', 'supabase_url');
select vault.create_secret('pgtap-test-secret', 'webhook_secret');

set local session_replication_role = replica;

insert into public.humans (id, name, customer_user_id) values
  (
    '41000000-0000-4000-8000-000000000001',
    'Cancellation Customer',
    '41000000-0000-4000-8000-000000000002'
  ),
  (
    '41000000-0000-4000-8000-000000000010',
    'Other Customer',
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
    '43000000-0000-4000-8000-000000000021', current_date + 1, '00:00',
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
    '43000000-0000-4000-8000-000000000050', current_date + 30, '09:00',
    '42000000-0000-4000-8000-000000000001', 'small', 'full-groom',
    'Booked', false, 'Due at Pick-up', null, false, null, null
  );

insert into public.salon_config (settings)
select '{"minCancellationHours":24,"customerPortal":{"allowCancellations":true}}'::jsonb
where not exists (select 1 from public.salon_config);

set local session_replication_role = default;

create temp table _before_success as
select id, booking_date, slot, dog_id, size, service, confirmed, payment,
       group_id, staff_capacity_override, staff_capacity_override_by,
       staff_capacity_override_at
from public.bookings
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

select throws_ok(
  $$ select * from public.cancel_customer_booking(
       '43000000-0000-4000-8000-000000000021', 'Changed plans'
     ) $$,
  'SDC02', null,
  'the London cancellation notice deadline is enforced'
);

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
   where group_id = '44000000-0000-4000-8000-000000000001'),
  'the whole group is cancelled with one reason'
);

select results_eq(
  $$ select id, booking_date, slot, dog_id, size, service, confirmed, payment,
            group_id, staff_capacity_override, staff_capacity_override_by,
            staff_capacity_override_at
     from public.bookings
     where group_id = '44000000-0000-4000-8000-000000000001'
     order by id $$,
  $$ select * from _before_success order by id $$,
  'cancellation preserves non-cancellation fields including override audit data'
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

select is(
  (with changed as (
    update public.bookings
       set status = 'Cancelled',
           cancel_reason = 'Forged',
           service = 'other',
           payment = 'Free'
     where id = '43000000-0000-4000-8000-000000000050'
    returning id
  ) select count(*) from changed),
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
