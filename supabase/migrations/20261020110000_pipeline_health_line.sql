-- ============================================================
-- Daily pipeline health line (#1007)
--
-- Edge Function failures, stuck notifications, failed pg_cron runs and
-- pg_net error responses were visible only to someone who went looking.
-- Once a day slack-alerts now posts ONE line of counts to a separate ops
-- channel (SLACK_OPS_WEBHOOK). Counts only: no customer field is selected
-- anywhere in this file.
--
--   1. slack_alerts.alert_type admits 'pipeline_health' (one per London day,
--      alert_key 'pipelinehealth:<date>').
--   2. public.pipeline_health_counts(minutes, hours) returns the counts as
--      jsonb. SECURITY DEFINER because cron.* and net.* are not readable by
--      service_role through PostgREST; executable by service_role only. The
--      thresholds are parameters, so they live in _shared/slackAlertThresholds.ts.
--   3. Two cron jobs, 06:00 and 07:00 UTC; slack-alerts acts on whichever is
--      07:xx London (the summary's BST/GMT pattern).
--
-- Dark like the rest of slack-alerts: nothing posts unless
-- SLACK_ALERTS_ENABLED is true, and dry run logs instead of posting.
-- Additive + idempotent.
-- ============================================================

begin;

alter table public.slack_alerts
  drop constraint if exists slack_alerts_alert_type_check;

alter table public.slack_alerts
  add constraint slack_alerts_alert_type_check check (alert_type in (
    'cancellation',
    'moved_off',
    'new_booking',
    'moved_in',
    'no_show',
    'ready_overdue',
    'unanswered',
    'summary',
    'ai_credit',
    'pipeline_health'
  ));

create or replace function public.pipeline_health_counts(
  p_pending_after_minutes integer,
  p_window_hours integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_since timestamptz := now() - make_interval(hours => greatest(coalesce(p_window_hours, 24), 1));
  v_stuck_before timestamptz := now() - make_interval(mins => greatest(coalesce(p_pending_after_minutes, 10), 1));
  v_failed jsonb;
  v_cron bigint;
  v_http bigint;
begin
  select coalesce(jsonb_object_agg(trigger_type, n), '{}'::jsonb) into v_failed
    from (
      select coalesce(trigger_type, 'unknown') as trigger_type, count(*) as n
        from public.notification_log
       where status = 'failed' and created_at >= v_since
       group by 1
    ) f;

  -- pg_cron and pg_net are Supabase extensions; a project without them gets
  -- null ("not readable") rather than an error.
  if to_regclass('cron.job_run_details') is not null then
    execute 'select count(*) from cron.job_run_details where status = ''failed'' and start_time >= $1'
      into v_cron using v_since;
  end if;
  if to_regclass('net._http_response') is not null then
    execute 'select count(*) from net._http_response where status_code >= 400'
      into v_http;
  end if;

  return jsonb_build_object(
    'pending_stuck', (select count(*) from public.notification_log
                       where status = 'pending' and created_at < v_stuck_before),
    'failed_by_trigger', v_failed,
    'whatsapp_events_failed', (select count(*) from public.whatsapp_events
                                where processing_status = 'failed' and received_at >= v_since),
    'cron_failed', v_cron,
    'http_errors', v_http,
    'sms_sent', (select count(*) from public.notification_log
                  where channel = 'sms' and status = 'sent' and created_at >= v_since)
  );
end;
$$;

revoke all on function public.pipeline_health_counts(integer, integer) from public, anon, authenticated;
grant execute on function public.pipeline_health_counts(integer, integer) to service_role;

comment on function public.pipeline_health_counts(integer, integer) is
  'Counts only, for the daily ops Slack line (#1007): stuck and failed notifications, failed WhatsApp events, failed cron runs, pg_net error responses, SMS sent. service_role only.';

select cron.unschedule(jobid) from cron.job
 where jobname in ('slack-alerts-pipeline-health-0600-utc', 'slack-alerts-pipeline-health-0700-utc');

select cron.schedule(
  'slack-alerts-pipeline-health-0600-utc',
  '0 6 * * *',
  $cron$
    select net.http_post(
      url := public.get_supabase_url() || '/functions/v1/slack-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(public.get_webhook_secret(), '')
      ),
      body := '{"mode": "pipeline_health"}'::jsonb
    );
  $cron$
);

select cron.schedule(
  'slack-alerts-pipeline-health-0700-utc',
  '0 7 * * *',
  $cron$
    select net.http_post(
      url := public.get_supabase_url() || '/functions/v1/slack-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(public.get_webhook_secret(), '')
      ),
      body := '{"mode": "pipeline_health"}'::jsonb
    );
  $cron$
);

commit;
