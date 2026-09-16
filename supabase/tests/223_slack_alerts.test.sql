-- The #salon-today Slack alert ledger, its trigger and its retention.
--
-- The properties worth pinning are the ones whose failure is silent:
-- deduplication (a repeating channel is one staff stop reading), and the
-- trigger's exception guard (alert plumbing must never be able to roll back
-- a customer's booking).

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ── Shape ─────────────────────────────────────────────────────
select has_table('public', 'slack_alerts', 'slack_alerts exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.slack_alerts'::regclass),
  'RLS is enabled on slack_alerts'
);
select is(
  (select count(*)::int from pg_policy where polrelid = 'public.slack_alerts'::regclass),
  1,
  'exactly one policy: staff read. Writes are service-role only, so nothing reachable from a browser can forge or clear a dedupe claim'
);

-- ── Deduplication: the claim ──────────────────────────────────
insert into public.slack_alerts (alert_key, alert_type, severity, message)
values ('noshow:44000000-0000-4000-8000-000000000001:2026-09-21', 'no_show', 'act', 'first');

select throws_ok(
  $$ insert into public.slack_alerts (alert_key, alert_type, severity, message)
     values ('noshow:44000000-0000-4000-8000-000000000001:2026-09-21', 'no_show', 'act', 'second') $$,
  '23505',
  null,
  'a repeated alert_key is refused — this is what stops the 5-minute sweep reposting the same no-show twelve times'
);

-- A different day is a different alert.
select lives_ok(
  $$ insert into public.slack_alerts (alert_key, alert_type, severity, message)
     values ('noshow:44000000-0000-4000-8000-000000000001:2026-09-22', 'no_show', 'act', 'next day') $$,
  'the same booking on another date alerts again'
);

-- ── Constrained vocabularies ──────────────────────────────────
select throws_ok(
  $$ insert into public.slack_alerts (alert_key, alert_type, severity)
     values ('k1', 'not_a_real_alert', 'act') $$,
  '23514', null, 'an unknown alert_type is rejected'
);
select throws_ok(
  $$ insert into public.slack_alerts (alert_key, alert_type, severity)
     values ('k2', 'no_show', 'catastrophic') $$,
  '23514', null, 'an unknown severity is rejected'
);
select throws_ok(
  $$ insert into public.slack_alerts (alert_key, alert_type, severity, state)
     values ('k3', 'no_show', 'act', 'half-sent') $$,
  '23514', null, 'an unknown state is rejected'
);
select is(
  (select state from public.slack_alerts
    where alert_key = 'noshow:44000000-0000-4000-8000-000000000001:2026-09-21'),
  'posted',
  'state defaults to posted'
);

-- ── The trigger ───────────────────────────────────────────────
select has_trigger(
  'public', 'booking_events', 'trg_slack_alerts_booking_event',
  'booking_events fans out to the alerts function'
);

-- Trigger functions must never be reachable over /rest/v1/rpc/. Supabase
-- grants EXECUTE to PUBLIC on every new function, so this needs an explicit
-- revoke; the class has regressed twice before (20260625120000, 20260701213000).
select ok(
  not has_function_privilege('anon', 'public.notify_slack_booking_event()', 'execute'),
  'anon cannot execute notify_slack_booking_event'
);
select ok(
  not has_function_privilege('authenticated', 'public.notify_slack_booking_event()', 'execute'),
  'authenticated cannot execute notify_slack_booking_event'
);

-- ── Retention ─────────────────────────────────────────────────
insert into public.slack_alerts (alert_key, alert_type, severity, created_at) values
  ('old:1', 'summary', 'good', now() - interval '91 days'),
  ('recent:1', 'summary', 'good', now() - interval '89 days');

select is(
  public.prune_slack_alerts(), 1,
  'prune deletes exactly the rows older than 90 days'
);
select is(
  (select count(*)::int from public.slack_alerts where alert_key = 'recent:1'),
  1, 'the 89-day row survives'
);
select ok(
  not has_function_privilege('anon', 'public.prune_slack_alerts()', 'execute'),
  'prune_slack_alerts is cron-only, not anon-callable'
);

select * from finish();
rollback;
