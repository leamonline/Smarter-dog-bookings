-- booking_funnel_events + log_funnel_event (migration 20260704120000).
--
-- Verifies: the fire-and-forget RPC lets an ordinary authenticated (non-staff)
-- session write; RLS keeps the table staff-read-only; anon cannot execute the
-- RPC. No booking inserts, so no notify triggers and no Vault secrets needed.
-- One txn, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- Seed a staff profile (FK to auth.users skipped in replica mode).
set local session_replication_role = replica;
insert into public.staff_profiles (user_id)
  values ('f0000000-0000-4000-8000-00000000007f');
set local session_replication_role = default;

-- A non-staff authenticated session (a customer in the portal) can log a step.
set local request.jwt.claims = '{"sub":"e0000000-0000-4000-8000-00000000007e","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ select public.log_funnel_event('11111111-2222-4333-8444-555555555555'::uuid, 'select_dogs', null, 2) $$,
  'an authenticated (non-staff) session can log a funnel step'
);

select is(
  (select count(*) from public.booking_funnel_events), 0::bigint,
  'a non-staff session cannot read booking_funnel_events'
);

-- Staff can read the logged step.
reset role;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-00000000007f","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*) from public.booking_funnel_events), 1::bigint,
  'staff can read the logged funnel step'
);

-- Anon cannot execute the RPC.
reset role;
set local request.jwt.claims = '';
set local role anon;

select throws_ok(
  $$ select public.log_funnel_event('11111111-2222-4333-8444-555555555555'::uuid, 'started') $$,
  '42501', null,
  'anon cannot execute log_funnel_event'
);

reset role;
select * from finish();
rollback;
