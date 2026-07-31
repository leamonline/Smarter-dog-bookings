-- No trigger function in `public` may be reachable by anon or authenticated.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, so a trigger
-- function that ships without an explicit revoke block becomes callable over
-- /rest/v1/rpc/. That class has regressed repeatedly (see docs/migrations.md),
-- most recently across the booking-policy visit batch. This suite fails the
-- moment a new trigger function is added without its revoke block, rather than
-- waiting for a production advisor to notice.
--
-- Triggers fire without an EXECUTE privilege check, so these revokes never
-- change behaviour — a failure here is always a missing revoke, never a
-- working trigger that needs the grant.

begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

-- 1. The class as a whole.
select is_empty(
  $$
    select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and pg_get_function_result(p.oid) = 'trigger'
       and (
         has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE')
       )
  $$,
  'no public trigger function is executable by anon or authenticated'
);

-- 2. A representative from the booking-policy visit batch, named explicitly so
--    the failure message points at the migration that regressed.
select ok(
  not has_function_privilege('anon', 'public.guard_immutable_booking_row()', 'EXECUTE'),
  'guard_immutable_booking_row() is not executable by anon'
);

-- 3. The deliberate customer-safe grants are untouched. These are not trigger
--    functions: 20260726144001 revokes then intentionally re-grants them so the
--    portal can read the policy runtime state.
select ok(
  has_function_privilege('anon', 'public.booking_policy_runtime_status()', 'EXECUTE'),
  'booking_policy_runtime_status() keeps its deliberate anon grant'
);

select * from finish();
rollback;
