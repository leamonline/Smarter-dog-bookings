-- ============================================================
-- #salon-today Slack alerts: triggers, cron and retention
--
-- APPLY THIS ONLY AFTER THE slack-alerts EDGE FUNCTION IS DEPLOYED.
-- Applied first, the trigger and the cron jobs POST into a 404. That is
-- harmless — every call is fire-and-forget and errors are swallowed — but
-- pointless, and it fills the pg_net log with noise.
--
-- WHAT CALLS WHAT, AND WHY
--
--   booking_events AFTER INSERT -> mode 'event'
--     Bookings created, moved or cancelled are EVENTS: there is an exact
--     moment they happen and booking_events already recorded it, including
--     previous_booking_date, so "moved off today" is a column comparison
--     rather than a state diff. A trigger also avoids up to five minutes of
--     lag on the one alert class where lag costs money — a cancellation
--     frees a slot staff might refill.
--
--     Attached to booking_events, not bookings: the classification work
--     (created / rescheduled / cancelled, with the previous date and slot)
--     is already done there, so this is one trigger instead of two and no
--     duplicated logic.
--
--   pg_cron every 5 minutes -> mode 'sweep'
--     No-shows, dogs left in Ready and unanswered messages are the ABSENCE
--     of events. When a dog fails to arrive, no row changes; the signal is
--     that nothing happened, and only a clock can see that. The same pass
--     flushes anything queued outside the posting window.
--
--   pg_cron twice each morning -> mode 'summary'
--     The BST/GMT pair, exactly as daily-booking-reminder-1400/1500-utc
--     already does it (migration 20260906120000). Both jobs pass
--     at_hour_uk = 8; whichever one lands on 08:xx London does the work and
--     the other returns skipped. No DST arithmetic anywhere.
--
-- SAFETY
--
-- The trigger POST is wrapped in an exception-swallowing block, copied from
-- notify_staff_booking_event. It runs INSIDE the originating transaction --
-- booking_events is written by a trigger on bookings -- so a Slack plumbing
-- failure must never roll back a customer's booking. pg_net is already
-- fire-and-forget; the guard is belt and braces.
--
-- Everything stays dormant until SLACK_ALERTS_ENABLED=true is set on the
-- Edge Function, which returns {skipped:true} until then.
--
-- Idempotent: create or replace, drop trigger if exists, unschedule before
-- schedule.
-- ============================================================

-- ── 1. booking_events -> the alerts function ──────────────────
create or replace function public.notify_slack_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the three life-cycle events that change a day. 'reconfirmed' (a
  -- customer tapping Confirm on a reminder) and 'completed' (a groom
  -- finishing) are normal progress, not something needing a human today.
  if new.event_type not in ('created', 'rescheduled', 'cancelled') then
    return new;
  end if;

  begin
    perform net.http_post(
      url     := get_supabase_url() || '/functions/v1/slack-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body    := jsonb_build_object(
        'mode',                  'event',
        'event_type',            new.event_type,
        'booking_id',            new.booking_id,
        'booking_date',          new.booking_date,
        'slot',                  new.slot,
        'previous_booking_date', new.previous_booking_date,
        'previous_slot',         new.previous_slot,
        -- Dog facts only. The event row also carries customer_name; it is
        -- deliberately NOT forwarded, because no customer name may reach
        -- Slack and the cheapest way to guarantee that is never to send it.
        'dog_name',              new.dog_name,
        'dog_breed',             new.dog_breed
      )
    );
  exception when others then
    null; -- never let alert plumbing break a real booking write
  end;

  return new;
end;
$$;

comment on function public.notify_slack_booking_event() is
  'Posts booking created/rescheduled/cancelled events to the slack-alerts Edge Function for the #salon-today channel. Forwards dog facts only -- customer_name is deliberately withheld. Swallows every error: it runs inside the booking transaction and must never roll back a customer write.';

drop trigger if exists trg_slack_alerts_booking_event on public.booking_events;
create trigger trg_slack_alerts_booking_event
  after insert on public.booking_events
  for each row execute function public.notify_slack_booking_event();

-- Postgres grants EXECUTE to PUBLIC on every new function, so a trigger
-- function that ships without this block becomes callable over /rest/v1/rpc/.
-- That class has regressed repeatedly here (20260625120000 enumerated the
-- offenders, 20260701213000 had to do it again), and supabase/tests/179
-- exists to fail the moment it happens once more -- which is how this line
-- came to be written. Triggers fire WITHOUT an EXECUTE privilege check, so
-- the revoke cannot break the trigger.
revoke execute on function public.notify_slack_booking_event() from public, anon, authenticated;

-- ── 2. The five-minute sweep ──────────────────────────────────
--
-- UTC hours 07-15 cover 08:00-16:00 in BST and 07:00-15:00 in GMT, which
-- brackets the 08:00-15:30 London posting window from both sides all year.
-- The function makes the precise London judgement and returns skipped
-- outside it. Deliberately coarse here, exact there.
--
-- Days 1-3 are Mon-Wed. The window never crosses midnight UTC, so the
-- weekday cannot shift between the two timezones.
--
-- This is the most frequent job in the database (the next is */15). It is a
-- single HTTP POST that usually finds nothing.
select cron.unschedule(jobid) from cron.job where jobname = 'slack-alerts-sweep';

select cron.schedule(
  'slack-alerts-sweep',
  '*/5 7-15 * * 1-3',
  $cron$
    select net.http_post(
      url := public.get_supabase_url() || '/functions/v1/slack-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(public.get_webhook_secret(), '')
      ),
      body := '{"mode": "sweep"}'::jsonb
    );
  $cron$
);

-- ── 3. The 08:15 morning summary (BST/GMT pair) ───────────────
--
--   summer: 07:15 UTC = 08:15 BST -> sends;  08:15 UTC = 09:15 BST -> skipped
--   winter: 07:15 UTC = 07:15 GMT -> skipped; 08:15 UTC = 08:15 GMT -> sends
--
-- Same trick as the reminder jobs. at_hour_uk is what the function checks.
select cron.unschedule(jobid) from cron.job
 where jobname in ('slack-alerts-summary-0715-utc', 'slack-alerts-summary-0815-utc');

select cron.schedule(
  'slack-alerts-summary-0715-utc',
  '15 7 * * 1-3',
  $cron$
    select net.http_post(
      url := public.get_supabase_url() || '/functions/v1/slack-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(public.get_webhook_secret(), '')
      ),
      body := '{"mode": "summary", "at_hour_uk": 8}'::jsonb
    );
  $cron$
);

select cron.schedule(
  'slack-alerts-summary-0815-utc',
  '15 8 * * 1-3',
  $cron$
    select net.http_post(
      url := public.get_supabase_url() || '/functions/v1/slack-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(public.get_webhook_secret(), '')
      ),
      body := '{"mode": "summary", "at_hour_uk": 8}'::jsonb
    );
  $cron$
);

-- ── 4. Retention ──────────────────────────────────────────────
--
-- 90 days, matching the measurement-telemetry retention decided on
-- 9 September 2026. The ledger is an operational audit trail ("why didn't
-- we get an alert for that?"), which stops being useful long before then.
create or replace function public.prune_slack_alerts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  with gone as (
    delete from public.slack_alerts a
    where a.created_at < now() - interval '90 days'
    returning a.id
  )
  select count(*) into v_deleted from gone;
  return v_deleted;
end;
$$;

comment on function public.prune_slack_alerts() is
  'Daily cleanup. Deletes slack_alerts rows older than 90 days and returns the count. SECURITY DEFINER; cron-only.';

revoke execute on function public.prune_slack_alerts() from public, anon, authenticated;
grant execute on function public.prune_slack_alerts() to service_role;

-- 03:30 UTC, after prune_measurement_telemetry_daily (03:25), so the
-- overnight jobs stay serial.
do $$
begin
  perform cron.unschedule('prune_slack_alerts_daily');
exception when others then
  null;
end$$;

select cron.schedule(
  'prune_slack_alerts_daily',
  '30 3 * * *',
  $cron$ select public.prune_slack_alerts(); $cron$
);
