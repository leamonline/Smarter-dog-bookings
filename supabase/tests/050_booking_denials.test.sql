-- booking_denials + log_booking_denial (migration 20260702181000).
--
-- Verifies: the fire-and-forget RPC lets an ordinary authenticated (non-staff)
-- session write; RLS keeps the table staff-read-only; blank inputs normalise to
-- 'unknown'; anon cannot execute the RPC. No booking inserts happen, so no
-- notify triggers fire and no Vault secrets are needed. One txn, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Seed a staff profile (FK to auth.users is skipped in replica mode).
set local session_replication_role = replica;
insert into public.staff_profiles (user_id)
  values ('f0000000-0000-4000-8000-00000000005f');
set local session_replication_role = default;

-- A non-staff authenticated session (the customer portal) can log a denial.
set local request.jwt.claims = '{"sub":"e0000000-0000-4000-8000-00000000005e","role":"authenticated"}';
set local role authenticated;

select isnt(
  public.log_booking_denial('capacity_2_2_1', 'portal', current_date, '12:30', 'small', 'full-groom'),
  null, 'an authenticated (non-staff) session can log a denial'
);

-- ...but cannot read the table back (staff-only RLS).
select is(
  (select count(*) from public.booking_denials), 0::bigint,
  'a non-staff session cannot read booking_denials'
);

-- Staff can read the logged denial.
reset role;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-00000000005f","role":"authenticated"}';
set local role authenticated;

-- Staff also logs one with blank reason + source to exercise normalisation.
select public.log_booking_denial('', '');

select is(
  (select count(*) from public.booking_denials), 2::bigint,
  'staff can read every logged denial'
);
select is(
  (select count(*) from public.booking_denials
   where reason_code = 'unknown' and source = 'unknown'), 1::bigint,
  'blank reason_code + source normalise to "unknown"'
);

-- Anon cannot execute the RPC at all (execute revoked).
reset role;
set local request.jwt.claims = '';
set local role anon;

select throws_ok(
  $$ select public.log_booking_denial('capacity_2_2_1', 'portal') $$,
  '42501', null,
  'anon cannot execute log_booking_denial'
);

reset role;
select * from finish();
rollback;
