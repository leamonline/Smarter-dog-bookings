-- Customer profile writes are RPC-only: authenticated customers cannot update
-- humans directly, while the two narrow SECURITY DEFINER functions may change
-- only the profile fields they own. Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (with changed as (
    update public.humans set approved_at = now()
    where id = '10000000-0000-4000-8000-000000000001'
    returning id
  ) select count(*) from changed),
  0::bigint,
  'a pending customer cannot forge approved_at directly'
);

select is(
  (with changed as (
    update public.humans
    set approved_by = '10000000-0000-4000-8000-000000000099'
    where id = '10000000-0000-4000-8000-000000000001'
    returning id
  ) select count(*) from changed),
  0::bigint,
  'a pending customer cannot forge approved_by directly'
);

select is(
  (with changed as (
    update public.humans set source = 'forged'
    where id = '10000000-0000-4000-8000-000000000001'
    returning id
  ) select count(*) from changed),
  0::bigint,
  'a pending customer cannot rewrite source directly'
);

select is(
  (with changed as (
    update public.humans set signup_submitted_at = now()
    where id = '10000000-0000-4000-8000-000000000001'
    returning id
  ) select count(*) from changed),
  0::bigint,
  'a pending customer cannot forge signup_submitted_at directly'
);

select is(
  (with changed as (
    update public.humans set archived_at = now()
    where id = '10000000-0000-4000-8000-000000000001'
    returning id
  ) select count(*) from changed),
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

reset role;
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

reset role;
select * from finish();
rollback;
