-- Customer changes to staff-capacity-override visits are requests, not diary
-- mutations. Staff denial preserves the source; approval moves every row in
-- place and keeps the deliberate override. All fixtures roll back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);
\ir fixtures/ensure_local_vault_secrets.psql

insert into auth.users (id) values
  ('17500000-0000-4000-8000-000000000001'), -- staff
  ('17500000-0000-4000-8000-000000000002'), -- customer
  ('17500000-0000-4000-8000-000000000003'); -- other customer

insert into public.staff_profiles (user_id, role, display_name) values
  ('17500000-0000-4000-8000-000000000001', 'owner', 'Override Reviewer');

insert into public.humans (
  id, name, surname, address, customer_user_id, approved_at,
  policies_accepted_at, policies_version
) values
  (
    '17500000-0000-4000-8000-000000000010',
    'Override', 'Customer', '1 Approval Street',
    '17500000-0000-4000-8000-000000000002', now(), now(), '2026-07-test'
  ),
  (
    '17500000-0000-4000-8000-000000000020',
    'Other', 'Customer', '2 Approval Street',
    '17500000-0000-4000-8000-000000000003', now(), now(), '2026-07-test'
  );

insert into public.dogs (id, name, breed, human_id, size) values
  (
    '17500000-0000-4000-8000-000000000011',
    'Mollie Test', 'Labradoodle',
    '17500000-0000-4000-8000-000000000010', 'large'
  ),
  (
    '17500000-0000-4000-8000-000000000012',
    'Mabel Test', 'Labradoodle',
    '17500000-0000-4000-8000-000000000010', 'large'
  ),
  (
    '17500000-0000-4000-8000-000000000013',
    'Ordinary Test', 'Poodle',
    '17500000-0000-4000-8000-000000000010', 'small'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"17500000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- Use the real staff command: it deliberately leaves group_id null but writes
-- one visit_id for every dog in the command. This is the shape the override
-- gate must protect.
do $$
begin
  perform public.create_staff_booking_group(
    '[
      {"id":"17500000-0000-4000-8000-000000000101","dog_id":"17500000-0000-4000-8000-000000000011","slot":"09:00","size":"large","service":"Full Groom","status":"Booked","confirmed":true,"staff_capacity_override":true},
      {"id":"17500000-0000-4000-8000-000000000102","dog_id":"17500000-0000-4000-8000-000000000012","slot":"09:00","size":"large","service":"Full Groom","status":"Booked","confirmed":true,"staff_capacity_override":true}
    ]'::jsonb,
    (date_trunc('week', current_date) + interval '14 days')::date
  );

  perform public.create_staff_booking_group(
    '[
      {"id":"17500000-0000-4000-8000-000000000111","dog_id":"17500000-0000-4000-8000-000000000011","slot":"09:00","size":"large","service":"Full Groom","status":"Booked","confirmed":true,"staff_capacity_override":true},
      {"id":"17500000-0000-4000-8000-000000000112","dog_id":"17500000-0000-4000-8000-000000000012","slot":"09:00","size":"large","service":"Full Groom","status":"Booked","confirmed":true,"staff_capacity_override":true}
    ]'::jsonb,
    (date_trunc('week', current_date) + interval '28 days')::date
  );

  perform public.create_staff_booking_group(
    '[
      {"id":"17500000-0000-4000-8000-000000000121","dog_id":"17500000-0000-4000-8000-000000000013","slot":"10:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true,"staff_capacity_override":false}
    ]'::jsonb,
    (date_trunc('week', current_date) + interval '42 days')::date
  );
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"17500000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select * from public.reschedule_customer_booking(
       '17500000-0000-4000-8000-000000000101',
       '[
         {"dog_id":"17500000-0000-4000-8000-000000000011","slot":"11:00","service":"Full Groom"},
         {"dog_id":"17500000-0000-4000-8000-000000000012","slot":"11:00","service":"Full Groom"}
       ]'::jsonb,
       (date_trunc('week', current_date) + interval '21 days')::date,
       'Direct move must fail'
     ) $$,
  'SDR01', null,
  'an overridden visit cannot use the direct customer reschedule command'
);

set local role postgres;
select ok(
  (select count(*) = 2
          and bool_and(
            booking_date =
              (date_trunc('week', current_date) + interval '14 days')::date
          )
          and bool_and(status = 'Booked')
     from public.bookings
    where id in (
      '17500000-0000-4000-8000-000000000101',
      '17500000-0000-4000-8000-000000000102'
    )),
  'the rejected direct command leaves both source rows booked in place'
);

set local role authenticated;
create temp table _deny_request as
select public.request_customer_override_reschedule(
  '17500000-0000-4000-8000-000000000101',
  '[
    {"dog_id":"17500000-0000-4000-8000-000000000011","slot":"11:00","service":"Full Groom","addons":[]},
    {"dog_id":"17500000-0000-4000-8000-000000000012","slot":"11:00","service":"Full Groom","addons":[]}
  ]'::jsonb,
  (date_trunc('week', current_date) + interval '21 days')::date,
  'Prefer the following Monday'
) as receipt;

select is(
  (select receipt->>'status' from _deny_request),
  'pending_staff',
  'the customer receives a pending-staff request receipt'
);

set local role postgres;
select ok(
  (select count(*) = 2
          and bool_and(
            booking_date =
              (date_trunc('week', current_date) + interval '14 days')::date
          )
          and bool_and(slot = '09:00')
     from public.bookings
    where id in (
      '17500000-0000-4000-8000-000000000101',
      '17500000-0000-4000-8000-000000000102'
    )),
  'submitting the request does not move either original booking'
);

select ok(
  (select count(*) = 1
          and bool_and(reason_code = 'staff_capacity_override')
          and bool_and(status = 'pending_staff')
          and bool_and(
            target_booking_id =
              '17500000-0000-4000-8000-000000000101'::uuid
          )
     from public.booking_change_requests
    where id = (
      select (receipt->>'request_id')::uuid from _deny_request
    )),
  'the pending request is bound to the selected owned booking'
);

select ok(
  (select count(*) = 1
          and bool_and(kind = 'reschedule_request')
          and bool_and(not done)
     from public.salon_todos
    where booking_change_request_id = (
      select (receipt->>'request_id')::uuid from _deny_request
    )),
  'one open staff to-do is linked to the request'
);

set local role authenticated;
create temp table _deny_replay as
select public.request_customer_override_reschedule(
  '17500000-0000-4000-8000-000000000101',
  '[
    {"dog_id":"17500000-0000-4000-8000-000000000011","slot":"11:00","service":"Full Groom","addons":[]},
    {"dog_id":"17500000-0000-4000-8000-000000000012","slot":"11:00","service":"Full Groom","addons":[]}
  ]'::jsonb,
  (date_trunc('week', current_date) + interval '21 days')::date,
  'Prefer the following Monday'
) as receipt;

select is(
  (select receipt->>'replayed' from _deny_replay),
  'true',
  'an exact retry replays the existing request'
);

set local role postgres;
select is(
  (select count(*)
     from public.booking_change_requests
    where source_visit_id = (
      select source_visit_id
        from public.booking_change_requests
       where id = (select (receipt->>'request_id')::uuid from _deny_request)
    )),
  1::bigint,
  'an exact retry creates no duplicate request or staff task'
);

select is(
  (select count(*)
     from public.salon_todos
    where booking_change_request_id = (
      select (receipt->>'request_id')::uuid from _deny_request
    )),
  1::bigint,
  'an exact retry keeps one linked staff task'
);

set local role authenticated;
select throws_ok(
  $$ select public.request_customer_override_reschedule(
       '17500000-0000-4000-8000-000000000101',
       '[
         {"dog_id":"17500000-0000-4000-8000-000000000011","slot":"12:00","service":"Full Groom"},
         {"dog_id":"17500000-0000-4000-8000-000000000012","slot":"12:00","service":"Full Groom"}
       ]'::jsonb,
       (date_trunc('week', current_date) + interval '21 days')::date,
       'A different preference'
     ) $$,
  'SDR02', null,
  'a visit cannot accumulate competing open requests'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"17500000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.request_customer_override_reschedule(
       '17500000-0000-4000-8000-000000000101',
       '[{"dog_id":"17500000-0000-4000-8000-000000000011","slot":"12:00","service":"Full Groom"}]'::jsonb,
       (date_trunc('week', current_date) + interval '21 days')::date,
       'Probe another customer'
     ) $$,
  'SDC03', null,
  'a customer cannot request a move for somebody else'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"17500000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.request_customer_override_reschedule(
       '17500000-0000-4000-8000-000000000121',
       '[{"dog_id":"17500000-0000-4000-8000-000000000013","slot":"11:00","service":"Full Groom"}]'::jsonb,
       (date_trunc('week', current_date) + interval '49 days')::date,
       'Ordinary booking'
     ) $$,
  'SDR04', null,
  'an ordinary booking cannot be smuggled into the approval path'
);

select throws_ok(
  format(
    $$ select public.decide_customer_override_reschedule_request(
         %L::uuid, 'deny', 'Customer cannot decide'
       ) $$,
    (select receipt->>'request_id' from _deny_request)
  ),
  '42501', null,
  'a customer cannot approve or deny their own request'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"17500000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

create temp table _deny_decision as
select public.decide_customer_override_reschedule_request(
  (select (receipt->>'request_id')::uuid from _deny_request),
  'deny',
  'That time is not workable'
) as receipt;

select is(
  (select receipt->>'status' from _deny_decision),
  'declined',
  'staff receive a declined decision receipt'
);

set local role postgres;
select is(
  (select status from public.booking_change_requests
    where id = (select (receipt->>'request_id')::uuid from _deny_request)),
  'declined',
  'denial closes the durable request'
);

select ok(
  (select count(*) = 2
          and bool_and(
            booking_date =
              (date_trunc('week', current_date) + interval '14 days')::date
          )
          and bool_and(slot = '09:00')
     from public.bookings
    where id in (
      '17500000-0000-4000-8000-000000000101',
      '17500000-0000-4000-8000-000000000102'
    )),
  'denial leaves both original booking rows untouched'
);

select ok(
  (select done
     from public.salon_todos
    where booking_change_request_id = (
      select (receipt->>'request_id')::uuid from _deny_request
    )),
  'denial completes the linked staff task'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"17500000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

create temp table _approve_request as
select public.request_customer_override_reschedule(
  '17500000-0000-4000-8000-000000000111',
  '[
    {"dog_id":"17500000-0000-4000-8000-000000000011","slot":"11:00","service":"Bath and Brush","addons":[]},
    {"dog_id":"17500000-0000-4000-8000-000000000012","slot":"11:30","service":"Full Groom","addons":[]}
  ]'::jsonb,
  (date_trunc('week', current_date) + interval '35 days')::date,
  'Prefer the later Monday'
) as receipt;

select is(
  (select receipt->>'status' from _approve_request),
  'pending_staff',
  'a second override visit can create its own request'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"17500000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

create temp table _approve_decision as
select public.decide_customer_override_reschedule_request(
  (select (receipt->>'request_id')::uuid from _approve_request),
  'approve',
  'Approved by staff'
) as receipt;

select is(
  (select receipt->>'status' from _approve_decision),
  'accepted',
  'staff receive an accepted decision receipt'
);

set local role postgres;
select results_eq(
  $$ select id, booking_date, slot
       from public.bookings
      where id in (
        '17500000-0000-4000-8000-000000000111',
        '17500000-0000-4000-8000-000000000112'
      )
      order by id $$,
  $$ values
       (
         '17500000-0000-4000-8000-000000000111'::uuid,
         (date_trunc('week', current_date) + interval '35 days')::date,
         '11:00'::text
       ),
       (
         '17500000-0000-4000-8000-000000000112'::uuid,
         (date_trunc('week', current_date) + interval '35 days')::date,
         '11:30'::text
       ) $$,
  'approval moves both existing IDs to their requested date and slots'
);

select is(
  (select service from public.bookings
    where id = '17500000-0000-4000-8000-000000000111'),
  'Bath and Brush',
  'approval applies the requested service to the matching dog'
);

select ok(
  (select bool_and(staff_capacity_override)
     from public.bookings
    where id in (
      '17500000-0000-4000-8000-000000000111',
      '17500000-0000-4000-8000-000000000112'
    )),
  'approval reapplies the staff capacity override to every moved row'
);

select ok(
  (select status = 'accepted' and proposed_visit_id is not null
     from public.booking_change_requests
    where id = (
      select (receipt->>'request_id')::uuid from _approve_request
    )),
  'the accepted request records the resulting visit'
);

select ok(
  (select done
     from public.salon_todos
    where booking_change_request_id = (
      select (receipt->>'request_id')::uuid from _approve_request
    )),
  'approval completes the linked staff task'
);

set local role authenticated;
select is(
  public.decide_customer_override_reschedule_request(
    (select (receipt->>'request_id')::uuid from _approve_request),
    'approve',
    'Approved by staff'
  )->>'replayed',
  'true',
  'an exact repeated approval is idempotent'
);

select throws_ok(
  format(
    $$ select public.decide_customer_override_reschedule_request(
         %L::uuid, 'deny', 'Conflicting second decision'
       ) $$,
    (select receipt->>'request_id' from _approve_request)
  ),
  'SDR03', null,
  'a conflicting second decision cannot reverse approval'
);

set local role postgres;
select ok(
  not has_function_privilege(
    'authenticated',
    'public.reschedule_customer_booking_direct_unchecked(uuid,jsonb,date,text)',
    'execute'
  ),
  'browser roles cannot call the unchecked direct command'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.request_customer_override_reschedule(uuid,jsonb,date,text)',
    'execute'
  ),
  'authenticated customers can call the narrow request command'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.decide_customer_override_reschedule_request(uuid,text,text)',
    'execute'
  ),
  'authenticated staff can reach the internally staff-gated decision command'
);

select * from finish();
rollback;
