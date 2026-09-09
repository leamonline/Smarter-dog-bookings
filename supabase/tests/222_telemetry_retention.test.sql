begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Two rows per table: one inside the 90-day window, one just outside it.
insert into public.booking_funnel_events (session_id, step, created_at) values
  ('33000000-0000-4000-8000-000000000001', 'started', now() - interval '89 days'),
  ('33000000-0000-4000-8000-000000000002', 'started', now() - interval '91 days');
insert into public.booking_denials (reason_code, source, created_at) values
  ('capacity_2_2_1', 'portal', now() - interval '89 days'),
  ('capacity_2_2_1', 'portal', now() - interval '91 days');

select results_eq(
  $$ select funnel_events_deleted, denials_deleted from public.prune_measurement_telemetry() $$,
  $$ values (1, 1) $$,
  'prune deletes exactly the rows older than 90 days in each table'
);
select is(
  (select count(*)::int from public.booking_funnel_events where session_id in ('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000002')),
  1, 'the 89-day funnel row survives');
select is(
  (select count(*)::int from public.booking_denials where created_at < now() - interval '90 days'),
  0, 'no denial row older than 90 days remains');
select results_eq(
  $$ select funnel_events_deleted, denials_deleted from public.prune_measurement_telemetry() $$,
  $$ values (0, 0) $$,
  'a second run is a no-op'
);

-- Privileges: cron-only.
select ok(not has_function_privilege('anon', 'public.prune_measurement_telemetry()', 'execute'),
  'anon cannot execute prune_measurement_telemetry');
select ok(not has_function_privilege('authenticated', 'public.prune_measurement_telemetry()', 'execute'),
  'authenticated cannot execute prune_measurement_telemetry');
select ok(has_function_privilege('service_role', 'public.prune_measurement_telemetry()', 'execute'),
  'service_role can execute prune_measurement_telemetry');

-- Schedule registered.
select is(
  (select count(*)::int from cron.job where jobname = 'prune_measurement_telemetry_daily' and schedule = '25 3 * * *'),
  1, 'daily cron job is scheduled at 03:25 UTC');

select * from finish();
rollback;
