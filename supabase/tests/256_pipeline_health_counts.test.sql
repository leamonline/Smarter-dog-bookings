-- #1007: the daily ops line's counts function (migration 20261020110000).
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select ok(
  to_regprocedure('public.pipeline_health_counts(integer,integer)') is not null,
  'pipeline_health_counts exists');

select ok(
  (select prosecdef from pg_proc where oid = 'public.pipeline_health_counts(integer,integer)'::regprocedure),
  'it is SECURITY DEFINER (cron.* and net.* are not readable otherwise)');

select ok(
  not has_function_privilege('anon', 'public.pipeline_health_counts(integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.pipeline_health_counts(integer,integer)', 'execute'),
  'clients cannot run it');

select ok(
  has_function_privilege('service_role', 'public.pipeline_health_counts(integer,integer)', 'execute'),
  'service_role can');

select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.pipeline_health_counts(10, 24)) k),
  array['cron_failed','failed_by_trigger','http_errors','pending_stuck','sms_sent','whatsapp_events_failed']::text[],
  'it returns exactly the six count fields and nothing else');

-- A failed notification is counted by trigger type, and no row field leaks.
insert into public.notification_log (channel, status, trigger_type, message_text, created_at)
values ('whatsapp', 'failed', 'reminder', 'Hi Fixture256, your dog is ready', now() - interval '1 hour');

select is(
  (public.pipeline_health_counts(10, 24) -> 'failed_by_trigger' ->> 'reminder')::int >= 1,
  true,
  'a failed reminder is counted under its trigger type');

select ok(
  public.pipeline_health_counts(10, 24)::text not like '%Fixture256%',
  'no message text reaches the counts');

select * from finish();
rollback;
