-- Customer profile writes are RPC-only: authenticated customers cannot update
-- humans directly, while the two narrow SECURITY DEFINER functions may change
-- only the profile fields they own. Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

set local session_replication_role = replica;

insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000011'),
  ('10000000-0000-4000-8000-000000000021'),
  ('10000000-0000-4000-8000-000000000031'),
  ('10000000-0000-4000-8000-000000000041');

insert into public.humans (
  id, name, surname, address, postcode, email, whatsapp, fb, insta, tiktok,
  customer_user_id, source, approved_at, approved_by, signup_submitted_at,
  archived_at, policies_accepted_at, policies_version
) values (
  '10000000-0000-4000-8000-000000000001',
  'Pending',
  'Customer',
  '1 Original Street',
  'AA1 1AA',
  'before@example.test',
  false,
  null,
  null,
  null,
  '10000000-0000-4000-8000-000000000002',
  'self_signup',
  null,
  null,
  null,
  null,
  null,
  null
);

insert into public.humans (
  id, name, surname, address, customer_user_id, source, approved_at,
  signup_submitted_at, policies_accepted_at, policies_version
) values
  (
    '10000000-0000-4000-8000-000000000010',
    'Approved', 'Customer', '10 Booking Street',
    '10000000-0000-4000-8000-000000000011',
    'existing', now(), null, now(), '2026-07-test'
  ),
  (
    '10000000-0000-4000-8000-000000000020',
    'Signup', 'Pending', '20 Signup Street',
    '10000000-0000-4000-8000-000000000021',
    'self_signup', null, null, null, null
  ),
  (
    '10000000-0000-4000-8000-000000000030',
    'Signup', 'Approved', '30 Signup Street',
    '10000000-0000-4000-8000-000000000031',
    'self_signup', now(), null, null, null
  );

insert into public.staff_profiles (id, user_id, role, display_name)
values (
  '10000000-0000-4000-8000-000000000040',
  '10000000-0000-4000-8000-000000000041',
  'staff',
  'pgTAP Staff'
);

set local session_replication_role = default;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

with changed as (
  update public.humans set approved_at = now()
  where id = '10000000-0000-4000-8000-000000000001'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'a pending customer cannot forge approved_at directly'
);

with changed as (
  update public.humans
  set approved_by = '10000000-0000-4000-8000-000000000099'
  where id = '10000000-0000-4000-8000-000000000001'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'a pending customer cannot forge approved_by directly'
);

with changed as (
  update public.humans set source = 'forged'
  where id = '10000000-0000-4000-8000-000000000001'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'a pending customer cannot rewrite source directly'
);

with changed as (
  update public.humans set signup_submitted_at = now()
  where id = '10000000-0000-4000-8000-000000000001'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'a pending customer cannot forge signup_submitted_at directly'
);

with changed as (
  update public.humans set archived_at = now()
  where id = '10000000-0000-4000-8000-000000000001'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'a pending customer cannot archive their record directly'
);

select throws_ok(
  $$ select * from public.create_customer_booking_group('[]'::jsonb, current_date + 7) $$,
  'P0001',
  'Your account is awaiting approval. We''ll be in touch as soon as you''re set up.',
  'booking remains blocked after a forged approval attempt'
);

select lives_ok(
  $$ select * from public.update_customer_contact_details(
       '  Contact  ', '  Updated  ', '  2 Contact Road  ', null,
       'contact@example.test', true, 'facebook', 'instagram', 'tiktok'
     ) $$,
  'the contact-details RPC accepts a null postcode'
);

select ok(
  (select
     name = 'Contact'
     and surname = 'Updated'
     and address = '2 Contact Road'
     and postcode = 'AA1 1AA'
     and email = 'contact@example.test'
     and whatsapp
     and fb = 'facebook'
     and insta = 'instagram'
     and tiktok = 'tiktok'
     and approved_at is null
     and approved_by is null
     and source = 'self_signup'
     and signup_submitted_at is null
     and archived_at is null
   from public.humans
   where id = '10000000-0000-4000-8000-000000000001'),
  'the contact-details RPC changes permitted fields only'
);

select lives_ok(
  $$ select * from public.update_customer_contact_details(
       'Contact', 'Updated', '2 Contact Road', 'bb2 2bb',
       'contact@example.test', true, 'facebook', 'instagram', 'tiktok'
     ) $$,
  'the contact-details RPC accepts an explicit postcode'
);

select is(
  (select postcode from public.humans
   where id = '10000000-0000-4000-8000-000000000001'),
  'BB2 2BB'::text,
  'the contact-details RPC applies an explicitly supplied postcode'
);

select lives_ok(
  $$ select * from public.complete_customer_profile(
       '  Complete  ', '  Customer  ', '  3 Complete Lane  ',
       null, '2026-07-test'
     ) $$,
  'the profile-completion RPC accepts a null postcode'
);

select ok(
  (select
     name = 'Complete'
     and surname = 'Customer'
     and address = '3 Complete Lane'
     and postcode = 'BB2 2BB'
     and policies_accepted_at is not null
     and policies_version = '2026-07-test'
     and approved_at is null
     and approved_by is null
     and source = 'self_signup'
     and signup_submitted_at is null
     and archived_at is null
   from public.humans
   where id = '10000000-0000-4000-8000-000000000001'),
  'the profile-completion RPC changes permitted fields only'
);

select lives_ok(
  $$ select * from public.complete_customer_profile(
       'Complete', 'Customer', '3 Complete Lane',
       'cc3 3cc', '2026-07-test'
     ) $$,
  'the profile-completion RPC accepts an explicit postcode'
);

select is(
  (select postcode from public.humans
   where id = '10000000-0000-4000-8000-000000000001'),
  'CC3 3CC'::text,
  'the profile-completion RPC applies an explicitly supplied postcode'
);

-- Dog writes: customers may use the narrow RPCs, but cannot insert raw rows or
-- promote their reported size to the staff-authoritative dogs.size column.
set local role postgres;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$ insert into public.dogs (name, breed, size, human_id)
     values (
       'Raw Insert', 'Poodle', 'small',
       '10000000-0000-4000-8000-000000000010'
     ) $$,
  '42501',
  null,
  'a customer cannot insert a raw owned dog row'
);

select lives_ok(
  $$ select * from public.create_customer_dog(
       'Customer Pup', 'Poodle', 'small',
       '10000000-0000-4000-8000-000000000010'
     ) $$,
  'create_customer_dog accepts a customer-reported size'
);

select ok(
  (select size is null and reported_size = 'small'
   from public.dogs
   where human_id = '10000000-0000-4000-8000-000000000010'
     and name = 'Customer Pup'),
  'create_customer_dog keeps size unconfirmed and stores reported_size'
);

set local role postgres;
update public.dogs
set id = '1a000000-0000-4000-8000-000000000001',
    size = 'medium'
where human_id = '10000000-0000-4000-8000-000000000010'
  and name = 'Customer Pup';

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ select * from public.update_customer_dog(
       (select id from public.dogs
        where human_id = '10000000-0000-4000-8000-000000000010'
          and name = 'Customer Pup'),
       'Customer Pup Renamed', 'Poodle', 'small', '2020-01'
     ) $$,
  'update_customer_dog accepts changes that leave breed and reported size unchanged'
);

select is(
  (select size from public.dogs
   where human_id = '10000000-0000-4000-8000-000000000010'
     and name = 'Customer Pup Renamed'),
  'medium'::text,
  'a name-only customer edit preserves staff-confirmed size'
);

select lives_ok(
  $$ select * from public.update_customer_dog(
       (select id from public.dogs
        where human_id = '10000000-0000-4000-8000-000000000010'
          and name = 'Customer Pup Renamed'),
       'Customer Pup Renamed', 'Poodle', 'large', '2020-01'
     ) $$,
  'update_customer_dog accepts a changed reported size'
);

select ok(
  (select size is null and reported_size = 'large'
   from public.dogs
   where human_id = '10000000-0000-4000-8000-000000000010'
     and name = 'Customer Pup Renamed'),
  'a changed customer-reported size clears the authoritative size'
);

-- Self-signup accepts only one pending self_signup shell. Dog size remains
-- unverified until staff set dogs.size, and an approved shell cannot submit.
set local role postgres;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000021","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.submit_customer_signup(
       '{"name":"New","surname":"Customer","address":"20 Signup Street","policies_version":"2026-07-test"}'::jsonb,
       '[{"name":"Signup Pup","breed":"Poodle","size":"small","sex":"female","neutered":false}]'::jsonb
     ) $$,
  'a pending self-signup shell can submit once'
);

select ok(
  (select d.size is null and d.reported_size = 'small'
   from public.dogs d
   where d.human_id = '10000000-0000-4000-8000-000000000020'
     and d.name = 'Signup Pup'),
  'self-signup dogs keep size unverified and store reported_size'
);

select throws_ok(
  $$ select public.submit_customer_signup(
       '{"name":"Repeat","surname":"Customer","address":"20 Signup Street","policies_version":"2026-07-test"}'::jsonb,
       '[{"name":"Second Pup","breed":"Poodle","size":"small","sex":"female","neutered":false}]'::jsonb
     ) $$,
  'P0001',
  'signup_not_pending',
  'a submitted self-signup shell cannot submit again'
);

set local role postgres;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000031","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$ select public.submit_customer_signup(
       '{"name":"Already","surname":"Approved","address":"30 Signup Street","policies_version":"2026-07-test"}'::jsonb,
       '[{"name":"Approved Pup","breed":"Poodle","size":"small","sex":"female","neutered":false}]'::jsonb
     ) $$,
  'P0001',
  'signup_not_pending',
  'an approved self-signup shell cannot submit'
);

-- Staff cannot approve a signup while any active owned dog lacks a confirmed
-- size. The caller-provided booking JSON likewise cannot bypass that null.
set local role postgres;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000041","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$ select public.approve_customer_signup(
       '10000000-0000-4000-8000-000000000020'
     ) $$,
  'P0001',
  'signup_dog_size_unconfirmed',
  'staff cannot approve a signup with an unconfirmed active dog size'
);

set local role postgres;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$ select * from public.create_customer_booking_group(
       jsonb_build_array(jsonb_build_object(
         'dog_id', (select id from public.dogs
                    where human_id = '10000000-0000-4000-8000-000000000010'
                      and name = 'Customer Pup Renamed'),
         'slot', '09:00',
         'service', 'full-groom',
         'size', 'small'
       )),
       (date_trunc('week', current_date) + interval '7 days')::date
     ) $$,
  '22023',
  'dog_size_unconfirmed',
  'booking JSON size cannot bypass an unconfirmed authoritative dog size'
);

select throws_ok(
  $$ select * from public.create_customer_booking_group(
       (
         select jsonb_build_array(
           jsonb_build_object(
             'dog_id', upper(d.id::text),
             'slot', '09:00',
             'service', 'full-groom'
           ),
           jsonb_build_object(
             'dog_id', lower(d.id::text),
             'slot', '10:00',
             'service', 'full-groom'
           )
         )
         from public.dogs d
         where d.human_id = '10000000-0000-4000-8000-000000000010'
           and d.name = 'Customer Pup Renamed'
       ),
       current_date + 7
     ) $$,
  '22023',
  'The same dog is listed more than once',
  'equivalent upper- and lower-case UUID text cannot bypass duplicate dog detection'
);

select throws_ok(
  $$ select * from public.create_customer_booking_group(
       '[{"dog_id":"not-a-uuid","slot":"09:00","service":"full-groom"}]'::jsonb,
       current_date + 7
     ) $$,
  '22023',
  'dog_id must be a valid UUID',
  'invalid dog UUID text is rejected with the public input SQLSTATE'
);

set local role postgres;
select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok(
  $$ select * from public.update_customer_contact_details(
       'Anon', 'Customer', 'No Address'
     ) $$,
  '42501',
  null,
  'anon cannot execute update_customer_contact_details'
);

select throws_ok(
  $$ select * from public.complete_customer_profile(
       'Anon', 'Customer', 'No Address', null, '2026-07-test'
     ) $$,
  '42501',
  null,
  'anon cannot execute complete_customer_profile'
);

set local role postgres;
select * from finish();
rollback;
