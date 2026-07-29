-- Customer rescheduling is one atomic command. Every synthetic fixture is
-- rolled back; no production customer data is read or changed.

begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- Live booking/cancellation triggers enqueue notifications and therefore need
-- throwaway local Vault values, matching the other trigger-level pgTAP tests.
\ir fixtures/ensure_local_vault_secrets.psql

set local session_replication_role = replica;

insert into auth.users (id) values
  ('47000000-0000-4000-8000-000000000002'),
  ('47000000-0000-4000-8000-000000000012');

insert into public.humans (
  id, name, surname, address, customer_user_id, approved_at,
  policies_accepted_at, policies_version
) values
  (
    '47000000-0000-4000-8000-000000000001',
    'Reschedule', 'Customer', '1 Atomic Street',
    '47000000-0000-4000-8000-000000000002', now(), now(), '2026-07-test'
  ),
  (
    '47000000-0000-4000-8000-000000000011',
    'Other', 'Customer', '2 Isolation Street',
    '47000000-0000-4000-8000-000000000012', now(), now(), '2026-07-test'
  );

insert into public.dogs (id, name, breed, human_id, size) values
  (
    '47100000-0000-4000-8000-000000000001',
    'Owned One', 'Poodle',
    '47000000-0000-4000-8000-000000000001', 'small'
  ),
  (
    '47100000-0000-4000-8000-000000000002',
    'Owned Two', 'Poodle',
    '47000000-0000-4000-8000-000000000001', 'medium'
  ),
  (
    '47100000-0000-4000-8000-000000000011',
    'Other Dog', 'Poodle',
    '47000000-0000-4000-8000-000000000011', 'small'
  );

insert into public.bookings (
  id, booking_date, slot, dog_id, size, service, status, confirmed,
  payment, group_id
) values
  -- Successful two-dog visit.
  (
    '47200000-0000-4000-8000-000000000001',
    (date_trunc('week', current_date) + interval '21 days')::date,
    '09:00', '47100000-0000-4000-8000-000000000001',
    'small', 'full-groom', 'Booked', false, 'Due at Pick-up',
    '47300000-0000-4000-8000-000000000001'
  ),
  (
    '47200000-0000-4000-8000-000000000002',
    (date_trunc('week', current_date) + interval '21 days')::date,
    '10:00', '47100000-0000-4000-8000-000000000002',
    'medium', 'full-groom', 'Booked', false, 'Due at Pick-up',
    '47300000-0000-4000-8000-000000000001'
  ),
  -- A two-dog visit inside the cancellation deadline.
  (
    '47200000-0000-4000-8000-000000000010',
    (now() at time zone 'Europe/London')::date,
    '23:58',
    '47100000-0000-4000-8000-000000000001',
    'small', 'full-groom', 'Booked', false, 'Due at Pick-up',
    '47300000-0000-4000-8000-000000000010'
  ),
  (
    '47200000-0000-4000-8000-000000000011',
    (now() at time zone 'Europe/London')::date,
    '23:59',
    '47100000-0000-4000-8000-000000000002',
    'medium', 'full-groom', 'Booked', false, 'Due at Pick-up',
    '47300000-0000-4000-8000-000000000010'
  ),
  -- A valid old visit whose replacement is deliberately made invalid.
  (
    '47200000-0000-4000-8000-000000000020',
    (date_trunc('week', current_date) + interval '35 days')::date,
    '09:00', '47100000-0000-4000-8000-000000000001',
    'small', 'full-groom', 'Booked', false, 'Due at Pick-up',
    '47300000-0000-4000-8000-000000000020'
  ),
  (
    '47200000-0000-4000-8000-000000000021',
    (date_trunc('week', current_date) + interval '35 days')::date,
    '10:00', '47100000-0000-4000-8000-000000000002',
    'medium', 'full-groom', 'Booked', false, 'Due at Pick-up',
    '47300000-0000-4000-8000-000000000020'
  ),
  -- Grouped identity mismatch: the request omits the second dog.
  (
    '47200000-0000-4000-8000-000000000030',
    (date_trunc('week', current_date) + interval '42 days')::date,
    '09:00', '47100000-0000-4000-8000-000000000001',
    'small', 'full-groom', 'Booked', false, 'Due at Pick-up',
    '47300000-0000-4000-8000-000000000030'
  ),
  (
    '47200000-0000-4000-8000-000000000031',
    (date_trunc('week', current_date) + interval '42 days')::date,
    '10:00', '47100000-0000-4000-8000-000000000002',
    'medium', 'full-groom', 'Booked', false, 'Due at Pick-up',
    '47300000-0000-4000-8000-000000000030'
  ),
  -- Singleton identity mismatch: a null group_id must still move only the
  -- target's exact dog.
  (
    '47200000-0000-4000-8000-000000000040',
    (date_trunc('week', current_date) + interval '49 days')::date,
    '09:00', '47100000-0000-4000-8000-000000000001',
    'small', 'full-groom', 'Booked', false, 'Due at Pick-up', null
  ),
  -- An owned singleton used to probe another customer's dog in the payload.
  (
    '47200000-0000-4000-8000-000000000050',
    (date_trunc('week', current_date) + interval '56 days')::date,
    '09:00', '47100000-0000-4000-8000-000000000001',
    'small', 'full-groom', 'Booked', false, 'Due at Pick-up', null
  ),
  -- Another customer's original target.
  (
    '47200000-0000-4000-8000-000000000060',
    (date_trunc('week', current_date) + interval '63 days')::date,
    '09:00', '47100000-0000-4000-8000-000000000011',
    'small', 'full-groom', 'Booked', false, 'Due at Pick-up', null
  );

delete from public.salon_config;
insert into public.salon_config (settings) values
  ('{"minCancellationHours":24,"customerPortal":{"allowCancellations":true}}'::jsonb);

set local session_replication_role = default;

select set_config(
  'request.jwt.claims',
  '{"sub":"47000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

create temp table _successful_replacements as
select *
from public.reschedule_customer_booking(
  '47200000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'dog_id', '47100000-0000-4000-8000-000000000001',
      'slot', '09:00', 'service', 'full-groom'
    ),
    jsonb_build_object(
      'dog_id', '47100000-0000-4000-8000-000000000002',
      'slot', '10:00', 'service', 'full-groom'
    )
  ),
  (date_trunc('week', current_date) + interval '28 days')::date,
  'Moved online'
);

set local role postgres;

select is(
  (select count(*) from _successful_replacements),
  2::bigint,
  'a successful two-dog reschedule returns both replacement IDs'
);

select ok(
  (select count(*) = 2
          and bool_and(status = 'Booked')
          and bool_and(
            booking_date =
              (date_trunc('week', current_date) + interval '28 days')::date
          )
   from public.bookings
   where id in (select id from _successful_replacements)),
  'both replacement bookings are active on the requested date'
);

select ok(
  (select count(distinct group_id) = 1 and bool_and(group_id is not null)
   from public.bookings
   where id in (select id from _successful_replacements)),
  'the two replacement rows form one visit group'
);

select results_eq(
  $$ select dog_id, slot
       from public.bookings
      where id in (select id from _successful_replacements)
      order by dog_id $$,
  $$ values
       ('47100000-0000-4000-8000-000000000001'::uuid, '09:00'::text),
       ('47100000-0000-4000-8000-000000000002'::uuid, '10:00'::text) $$,
  'the replacement keeps the exact two-dog visit and requested slots'
);

select ok(
  (select count(*) = 2
          and bool_and(status = 'Cancelled')
          and bool_and(cancel_reason = 'Moved online')
   from public.bookings
   where group_id = '47300000-0000-4000-8000-000000000001'),
  'the whole original visit is cancelled with the reschedule reason'
);

select ok(
  (select count(*) = 1
          and bool_and(cancelled_count = 2)
          and bool_and(
            cancelled_booking_ids = array[
              '47200000-0000-4000-8000-000000000001'::uuid,
              '47200000-0000-4000-8000-000000000002'::uuid
            ]
          )
   from smarter_dog_private.customer_cancellation_receipts
   where customer_user_id = '47000000-0000-4000-8000-000000000002'
     and target_booking_id = '47200000-0000-4000-8000-000000000001'
     and cancel_reason = 'Moved online'),
  'one durable receipt records the complete original visit'
);

set local role authenticated;

create temp table _replayed_replacements as
select *
from public.reschedule_customer_booking(
  '47200000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'dog_id', '47100000-0000-4000-8000-000000000001',
      'slot', '09:00', 'service', 'full-groom'
    ),
    jsonb_build_object(
      'dog_id', '47100000-0000-4000-8000-000000000002',
      'slot', '10:00', 'service', 'full-groom'
    )
  ),
  (date_trunc('week', current_date) + interval '28 days')::date,
  'Moved online'
);

set local role postgres;

select results_eq(
  $$ select id from _replayed_replacements order by id $$,
  $$ select id from _successful_replacements order by id $$,
  'an exact retry replays the original replacement IDs'
);

select is(
  (select count(*)
     from public.bookings
    where booking_date =
            (date_trunc('week', current_date) + interval '28 days')::date
      and status = 'Booked'
      and dog_id in (
        '47100000-0000-4000-8000-000000000001',
        '47100000-0000-4000-8000-000000000002'
      )),
  2::bigint,
  'an exact retry creates no additional replacement rows'
);

select ok(
  (select count(*) = 1
     from smarter_dog_private.customer_reschedule_receipts r
    where r.customer_user_id = '47000000-0000-4000-8000-000000000002'
      and r.target_booking_id = '47200000-0000-4000-8000-000000000001'
      and r.reschedule_reason = 'Moved online'
      and r.replacement_booking_ids @>
            array(select id from _successful_replacements)
      and r.replacement_booking_ids <@
            array(select id from _successful_replacements)),
  'an exact retry keeps one private receipt with the original response IDs'
);

set local role authenticated;

select throws_ok(
  $$ select * from public.reschedule_customer_booking(
       '47200000-0000-4000-8000-000000000010',
       '[
         {"dog_id":"47100000-0000-4000-8000-000000000001","slot":"09:00","service":"full-groom"},
         {"dog_id":"47100000-0000-4000-8000-000000000002","slot":"10:00","service":"full-groom"}
       ]'::jsonb,
       (date_trunc('week', current_date) + interval '70 days')::date,
       'Too late'
     ) $$,
  'SDC02', null,
  'the 24-hour cancellation cutoff rejects the whole reschedule'
);

set local role postgres;

select ok(
  (select count(*) = 2
          and bool_and(status = 'Booked')
          and bool_and(cancel_reason is null)
   from public.bookings
   where group_id = '47300000-0000-4000-8000-000000000010'),
  'a cutoff rejection preserves every original visit row'
);

select is(
  (select count(*)
   from public.bookings
   where booking_date =
           (date_trunc('week', current_date) + interval '70 days')::date
     and dog_id in (
       '47100000-0000-4000-8000-000000000001',
       '47100000-0000-4000-8000-000000000002'
     )),
  0::bigint,
  'a cutoff rejection creates no replacements'
);

select is(
  (select count(*)
   from smarter_dog_private.customer_cancellation_receipts
   where target_booking_id = '47200000-0000-4000-8000-000000000010'
     and cancel_reason = 'Too late'),
  0::bigint,
  'a cutoff rejection creates no cancellation receipt'
);

set local role authenticated;

select throws_ok(
  $$ select * from public.reschedule_customer_booking(
       '47200000-0000-4000-8000-000000000020',
       '[
         {"dog_id":"47100000-0000-4000-8000-000000000001","slot":"07:00","service":"full-groom"},
         {"dog_id":"47100000-0000-4000-8000-000000000002","slot":"10:00","service":"full-groom"}
       ]'::jsonb,
       (date_trunc('week', current_date) + interval '77 days')::date,
       'Invalid replacement'
     ) $$,
  'P0001', 'Invalid slot: 07:00',
  'a replacement insert failure aborts the reschedule'
);

set local role postgres;

select ok(
  (select count(*) = 2
          and bool_and(status = 'Booked')
          and bool_and(cancel_reason is null)
   from public.bookings
   where group_id = '47300000-0000-4000-8000-000000000020'),
  'replacement failure rolls the original cancellation back'
);

select is(
  (select count(*)
   from public.bookings
   where booking_date =
           (date_trunc('week', current_date) + interval '77 days')::date
     and dog_id in (
       '47100000-0000-4000-8000-000000000001',
       '47100000-0000-4000-8000-000000000002'
     )),
  0::bigint,
  'replacement failure leaves no partially-created replacement rows'
);

select is(
  (select count(*)
   from smarter_dog_private.customer_cancellation_receipts
   where target_booking_id = '47200000-0000-4000-8000-000000000020'
     and cancel_reason = 'Invalid replacement'),
  0::bigint,
  'replacement failure rolls the cancellation receipt back'
);

set local role authenticated;

select throws_ok(
  $$ select * from public.reschedule_customer_booking(
       '47200000-0000-4000-8000-000000000030',
       '[{"dog_id":"47100000-0000-4000-8000-000000000001","slot":"09:00","service":"full-groom"}]'::jsonb,
       (date_trunc('week', current_date) + interval '84 days')::date,
       'Incomplete group'
     ) $$,
  'SDC04', 'replacement_visit_mismatch',
  'a grouped visit cannot omit a dog from its replacement'
);

set local role postgres;

select ok(
  (select count(*) = 2
          and bool_and(status = 'Booked')
          and bool_and(cancel_reason is null)
   from public.bookings
   where group_id = '47300000-0000-4000-8000-000000000030'),
  'a grouped dog-set mismatch rolls the original cancellation back'
);

select is(
  (select count(*)
   from public.bookings
   where booking_date =
           (date_trunc('week', current_date) + interval '84 days')::date
     and dog_id in (
       '47100000-0000-4000-8000-000000000001',
       '47100000-0000-4000-8000-000000000002'
     )),
  0::bigint,
  'a grouped dog-set mismatch creates no replacement'
);

select is(
  (select count(*)
   from smarter_dog_private.customer_cancellation_receipts
   where target_booking_id = '47200000-0000-4000-8000-000000000030'
     and cancel_reason = 'Incomplete group'),
  0::bigint,
  'a grouped dog-set mismatch creates no receipt'
);

set local role authenticated;

select throws_ok(
  $$ select * from public.reschedule_customer_booking(
       '47200000-0000-4000-8000-000000000040',
       '[{"dog_id":"47100000-0000-4000-8000-000000000002","slot":"09:00","service":"full-groom"}]'::jsonb,
       (date_trunc('week', current_date) + interval '91 days')::date,
       'Wrong singleton dog'
     ) $$,
  'SDC04', 'replacement_visit_mismatch',
  'a null-group visit cannot be moved as a different owned dog'
);

set local role postgres;

select ok(
  (select status = 'Booked' and cancel_reason is null
   from public.bookings
   where id = '47200000-0000-4000-8000-000000000040'),
  'a null-group dog mismatch rolls the original cancellation back'
);

select is(
  (select count(*)
   from public.bookings
   where booking_date =
           (date_trunc('week', current_date) + interval '91 days')::date
     and dog_id = '47100000-0000-4000-8000-000000000002'),
  0::bigint,
  'a null-group dog mismatch creates no replacement'
);

select is(
  (select count(*)
   from smarter_dog_private.customer_cancellation_receipts
   where target_booking_id = '47200000-0000-4000-8000-000000000040'
     and cancel_reason = 'Wrong singleton dog'),
  0::bigint,
  'a null-group dog mismatch creates no receipt'
);

set local role authenticated;

select throws_ok(
  $$ select * from public.reschedule_customer_booking(
       '47200000-0000-4000-8000-000000000050',
       '[{"dog_id":"47100000-0000-4000-8000-000000000011","slot":"09:00","service":"full-groom"}]'::jsonb,
       (date_trunc('week', current_date) + interval '98 days')::date,
       'Unauthorised dog'
     ) $$,
  'SDC04', 'replacement_visit_mismatch',
  'another customer dog cannot replace the owned target dog'
);

set local role postgres;

select ok(
  (select status = 'Booked' and cancel_reason is null
   from public.bookings
   where id = '47200000-0000-4000-8000-000000000050'),
  'an unauthorised replacement dog leaves the owned target unchanged'
);

select is(
  (select count(*)
   from public.bookings
   where booking_date =
           (date_trunc('week', current_date) + interval '98 days')::date
     and dog_id = '47100000-0000-4000-8000-000000000011'),
  0::bigint,
  'an unauthorised replacement dog is never booked'
);

select is(
  (select count(*)
   from smarter_dog_private.customer_cancellation_receipts
   where target_booking_id = '47200000-0000-4000-8000-000000000050'
     and cancel_reason = 'Unauthorised dog'),
  0::bigint,
  'an unauthorised replacement dog creates no receipt'
);

set local role authenticated;

select throws_ok(
  $$ select * from public.reschedule_customer_booking(
       '47200000-0000-4000-8000-000000000060',
       '[{"dog_id":"47100000-0000-4000-8000-000000000001","slot":"09:00","service":"full-groom"}]'::jsonb,
       (date_trunc('week', current_date) + interval '105 days')::date,
       'Not my booking'
     ) $$,
  'SDC03', null,
  'another customer original booking is rejected without disclosure'
);

set local role postgres;

select ok(
  (select status = 'Booked'
          and cancel_reason is null
          and not exists (
            select 1
            from public.bookings replacement
            where replacement.booking_date =
                    (date_trunc('week', current_date) + interval '105 days')::date
              and replacement.dog_id =
                    '47100000-0000-4000-8000-000000000001'
          )
   from public.bookings
   where id = '47200000-0000-4000-8000-000000000060'),
  'an unauthorised original target and proposed replacement stay unchanged'
);

select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok(
  $$ select * from public.reschedule_customer_booking(
       '47200000-0000-4000-8000-000000000040',
       '[{"dog_id":"47100000-0000-4000-8000-000000000001","slot":"09:00","service":"full-groom"}]'::jsonb,
       (date_trunc('week', current_date) + interval '112 days')::date,
       'Anonymous attempt'
     ) $$,
  '42501', null,
  'anon cannot execute the customer reschedule function'
);

set local role postgres;
select * from finish();
rollback;
