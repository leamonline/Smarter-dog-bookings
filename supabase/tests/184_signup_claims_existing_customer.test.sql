-- A portal self-signup whose typed name matches an existing customer is
-- saved as a CLAIM on that record (humans.claims_human_id) instead of
-- failing with "contact the salon", and staff resolve it with the same
-- link_pending_signup() the phone-collision path uses. Ordinary signups are
-- unchanged. Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

set local session_replication_role = replica;

insert into auth.users (id)
values
  ('18400000-0000-4000-8000-000000000041'),  -- staff
  ('18400000-0000-4000-8000-000000000042'),  -- claimant's portal login
  ('18400000-0000-4000-8000-000000000043');  -- an ordinary new signup

insert into public.staff_profiles (id, user_id, role, display_name)
values (
  '18400000-0000-4000-8000-000000000040',
  '18400000-0000-4000-8000-000000000041',
  'staff',
  'Claim Link Staff'
);

insert into public.humans (id, name, surname, phone, address, source, approved_at, customer_user_id)
values
  -- The real customer: old number, no portal login, on the books for years.
  ('18400000-0000-4000-8000-000000000001',
   'Claim', 'Existing', '+447700900101', '1 Old Address', null,
   timestamptz '2026-01-01 10:00:00+00', null),
  -- Their portal shell, created when they verified a NEW number.
  ('18400000-0000-4000-8000-000000000002',
   'New member', 'Pending 7700900102', '+447700900102', null, 'self_signup', null,
   '18400000-0000-4000-8000-000000000042'),
  -- A genuinely new customer's shell (regression for the ordinary path).
  ('18400000-0000-4000-8000-000000000003',
   'New member', 'Pending 7700900103', '+447700900103', null, 'self_signup', null,
   '18400000-0000-4000-8000-000000000043');

set local session_replication_role = default;

-- ── The claimant submits their real name ──────────────────────

select set_config(
  'request.jwt.claims',
  '{"sub":"18400000-0000-4000-8000-000000000042","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  public.submit_customer_signup(
    '{"name":"Claim","surname":"Existing","address":"2 New Address","email":"claim@example.test","policies_version":"2026-09-test"}'::jsonb,
    '[{"name":"Claim Pup","breed":"Poodle","size":"small","sex":"female","neutered":false}]'::jsonb
  ),
  '{"claims_existing": true}'::jsonb,
  'a name that matches an existing customer submits as a claim instead of failing'
);

set local role postgres;

select results_eq(
  $$ select name, surname, claims_human_id, address, email,
            signup_submitted_at is not null, approved_at is null, phone, customer_user_id
       from public.humans where id = '18400000-0000-4000-8000-000000000002' $$,
  $$ values ('New member'::text, 'Pending 7700900102'::text,
             '18400000-0000-4000-8000-000000000001'::uuid,
             '2 New Address'::text, 'claim@example.test'::text,
             true, true, '+447700900102'::text,
             '18400000-0000-4000-8000-000000000042'::uuid) $$,
  'the shell keeps its placeholder name, records the claim, saves the typed details, and stays pending with its own phone + login'
);

select is(
  (select count(*) from public.dogs
    where human_id = '18400000-0000-4000-8000-000000000002' and name = 'Claim Pup'),
  1::bigint,
  'the dog entered on the form is saved on the shell (it moves on link)'
);

select results_eq(
  $$ select phone, address, customer_user_id from public.humans
      where id = '18400000-0000-4000-8000-000000000001' $$,
  $$ values ('+447700900101'::text, '1 Old Address'::text, null::uuid) $$,
  'the claimed record is not touched by the customer''s submit'
);

set local role authenticated;

select throws_ok(
  $$ select public.submit_customer_signup(
       '{"name":"Claim","surname":"Existing","address":"2 New Address","policies_version":"2026-09-test"}'::jsonb,
       '[{"name":"Again","breed":"Poodle"}]'::jsonb
     ) $$,
  'P0001',
  'signup_not_pending',
  'a claiming shell cannot submit twice'
);

-- ── An ordinary signup is unchanged ───────────────────────────

set local role postgres;
select set_config(
  'request.jwt.claims',
  '{"sub":"18400000-0000-4000-8000-000000000043","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  public.submit_customer_signup(
    '{"name":"Brand","surname":"NewPerson","address":"3 Fresh Street","policies_version":"2026-09-test"}'::jsonb,
    '[{"name":"Fresh Pup","breed":"Poodle","size":"small","sex":"male","neutered":true}]'::jsonb
  ),
  '{"claims_existing": false}'::jsonb,
  'a name nobody has submits as a plain signup'
);

set local role postgres;

select results_eq(
  $$ select name, surname, claims_human_id, signup_submitted_at is not null
       from public.humans where id = '18400000-0000-4000-8000-000000000003' $$,
  $$ values ('Brand'::text, 'NewPerson'::text, null::uuid, true) $$,
  'the plain signup stores the real name and records no claim'
);

-- ── Staff resolve the claim with link_pending_signup ──────────

select set_config(
  'request.jwt.claims',
  '{"sub":"18400000-0000-4000-8000-000000000041","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.link_pending_signup(
       '18400000-0000-4000-8000-000000000001',
       '18400000-0000-4000-8000-000000000002'
     ) $$,
  'staff link the claiming shell onto the record it claims'
);

set local role postgres;

select results_eq(
  $$ select name, surname, phone, customer_user_id, address, email, approved_at is not null
       from public.humans where id = '18400000-0000-4000-8000-000000000001' $$,
  $$ values ('Claim'::text, 'Existing'::text, '+447700900102'::text,
             '18400000-0000-4000-8000-000000000042'::uuid,
             '1 Old Address'::text, 'claim@example.test'::text, true) $$,
  'the kept record gains the verified number, the login and the blank-filled email; its own name and address win'
);

select is(
  (select count(*) from public.humans where id = '18400000-0000-4000-8000-000000000002'),
  0::bigint,
  'the claiming shell is deleted'
);

select is(
  (select human_id from public.dogs where name = 'Claim Pup'),
  '18400000-0000-4000-8000-000000000001'::uuid,
  'the dog entered at signup now belongs to the kept record'
);

-- ── Function surface ──────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.submit_customer_signup(jsonb, jsonb)', 'EXECUTE'),
  'submit_customer_signup stays unavailable to anon after the redefinition'
);

select ok(
  has_function_privilege('authenticated', 'public.submit_customer_signup(jsonb, jsonb)', 'EXECUTE'),
  'submit_customer_signup stays executable by authenticated customers'
);

select * from finish();
rollback;
