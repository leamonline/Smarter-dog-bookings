-- link_pending_signup(): an existing customer who signed up to the portal
-- with a new number gets their verified number + portal login moved onto
-- their real record, the placeholder shell deleted, and booking approved —
-- in one call. Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

set local session_replication_role = replica;

insert into auth.users (id)
values
  ('18300000-0000-4000-8000-000000000041'),  -- staff
  ('18300000-0000-4000-8000-000000000042');  -- the customer's portal login

insert into public.staff_profiles (id, user_id, role, display_name)
values (
  '18300000-0000-4000-8000-000000000040',
  '18300000-0000-4000-8000-000000000041',
  'staff',
  'Link Signup Staff'
);

insert into public.humans (id, name, surname, phone, source, approved_at, customer_user_id)
values
  -- The real customer: old number, on the books since forever, no login.
  ('18300000-0000-4000-8000-000000000001',
   'Link', 'Existing', '+447700900001', null, timestamptz '2026-01-01 10:00:00+00', null),
  -- The portal shell created when they verified their NEW number.
  ('18300000-0000-4000-8000-000000000002',
   'New member', 'Pending 7700900002', '+447700900002', 'self_signup', null,
   '18300000-0000-4000-8000-000000000042'),
  -- An ordinary second customer (not a shell) to prove the guard.
  ('18300000-0000-4000-8000-000000000003',
   'Link', 'Bystander', '+447700900003', null, timestamptz '2026-01-01 10:00:00+00', null);

-- A dog typed into the signup form lands on the shell.
insert into public.dogs (id, name, breed, human_id)
values ('18300000-0000-4000-8000-000000000011', 'Shell Dog', 'Spaniel',
        '18300000-0000-4000-8000-000000000002');

-- The signup-review to-do the portal raises for staff.
insert into public.salon_todos (id, text, human_id, kind)
values ('18300000-0000-4000-8000-000000000021', 'Review signup',
        '18300000-0000-4000-8000-000000000002', 'signup_review');

set local session_replication_role = default;

-- ── Guards ────────────────────────────────────────────────────

select throws_ok(
  $$ select public.link_pending_signup(
       '18300000-0000-4000-8000-000000000001',
       '18300000-0000-4000-8000-000000000002'
     ) $$,
  '42501',
  'link_pending_signup: staff only',
  'anonymous/non-staff callers are refused'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"18300000-0000-4000-8000-000000000041","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$ select public.link_pending_signup(
       '18300000-0000-4000-8000-000000000001',
       '18300000-0000-4000-8000-000000000003'
     ) $$,
  '22023',
  'link_pending_signup: 18300000-0000-4000-8000-000000000003 is not a pending self-signup',
  'an ordinary customer record cannot be "linked" as if it were a signup shell'
);

-- ── The happy path ────────────────────────────────────────────

select lives_ok(
  $$ select public.link_pending_signup(
       '18300000-0000-4000-8000-000000000001',
       '18300000-0000-4000-8000-000000000002'
     ) $$,
  'staff can link the pending signup onto the existing customer'
);

set local role postgres;

select results_eq(
  $$ select phone, customer_user_id, approved_at is not null
       from public.humans
      where id = '18300000-0000-4000-8000-000000000001' $$,
  $$ values ('+447700900002'::text,
             '18300000-0000-4000-8000-000000000042'::uuid,
             true) $$,
  'the kept record takes the verified number and the portal login, and is approved'
);

select is(
  (select count(*) from public.humans
    where id = '18300000-0000-4000-8000-000000000002'),
  0::bigint,
  'the placeholder shell is deleted'
);

select is(
  (select human_id from public.dogs
    where id = '18300000-0000-4000-8000-000000000011'),
  '18300000-0000-4000-8000-000000000001'::uuid,
  'a dog entered on the signup form moves to the kept record'
);

select results_eq(
  $$ select human_id, done from public.salon_todos
      where id = '18300000-0000-4000-8000-000000000021' $$,
  $$ values ('18300000-0000-4000-8000-000000000001'::uuid, true) $$,
  'the signup-review to-do is kept as history on the linked record and closed'
);

select is(
  (select approved_by from public.humans
    where id = '18300000-0000-4000-8000-000000000001'),
  '18300000-0000-4000-8000-000000000041'::uuid,
  'approval is attributed to the staff member who linked'
);

-- The shell is gone, so a repeat tap on "Link" is a clean not-found rather
-- than a second orphaned login.
set local role authenticated;
select throws_ok(
  $$ select public.link_pending_signup(
       '18300000-0000-4000-8000-000000000001',
       '18300000-0000-4000-8000-000000000002'
     ) $$,
  '42704',
  'link_pending_signup: pending signup 18300000-0000-4000-8000-000000000002 not found',
  'linking the same shell twice reports it as gone'
);

select * from finish();
rollback;
