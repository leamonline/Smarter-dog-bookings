-- A portal self-signup may now give a dog's age as "Not sure" (audit N-13).
-- The form then sends no birth date (`dob: null`). This asserts the rows
-- submit_customer_signup() actually writes, not the payload handed to it: a
-- dog of unknown age is saved with an empty dob, an empty string is saved as
-- empty too, and a known month still round-trips. Synthetic fixtures are
-- rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

set local session_replication_role = replica;

insert into auth.users (id)
values ('26200000-0000-4000-8000-000000000042');

-- The portal shell created when the customer verified their number.
insert into public.humans (id, name, surname, phone, address, source, approved_at, customer_user_id)
values (
  '26200000-0000-4000-8000-000000000002',
  'New member', 'Pending 7700900262', '+447700900262', null, 'self_signup', null,
  '26200000-0000-4000-8000-000000000042'
);

set local session_replication_role = default;

select set_config(
  'request.jwt.claims',
  '{"sub":"26200000-0000-4000-8000-000000000042","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$select public.submit_customer_signup(
    '{"name":"Unknownage","surname":"Signup","address":"262 Test Road","email":"unknown.age@example.test","policies_version":"2026-11-test"}'::jsonb,
    '[
      {"name":"Rescue Unknown","breed":"Poodle","sex":"female","dob":null,"neutered":null},
      {"name":"Rescue Blank","breed":"Poodle","sex":"male","dob":"","neutered":null},
      {"name":"Known Month","breed":"Poodle","sex":"female","dob":"2023-05","neutered":null}
    ]'::jsonb
  )$$,
  'a signup whose dogs include an unknown age is accepted'
);

reset role;

select is(
  (select dob from public.dogs
    where human_id = '26200000-0000-4000-8000-000000000002' and name = 'Rescue Unknown'),
  null,
  'a dog sent with no birth date ("Not sure") is saved with an empty dob'
);

select is(
  (select dob from public.dogs
    where human_id = '26200000-0000-4000-8000-000000000002' and name = 'Rescue Blank'),
  null,
  'an empty birth date is saved as empty, never as a blank string'
);

select is(
  (select dob from public.dogs
    where human_id = '26200000-0000-4000-8000-000000000002' and name = 'Known Month'),
  '2023-05',
  'a known birth month is still saved as given'
);

select * from finish();
rollback;
