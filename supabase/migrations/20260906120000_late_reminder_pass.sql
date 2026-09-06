-- Migration: late_reminder_pass
-- Date: 2026-09-06
--
-- PROBLEM: booking reminders go out once, at 15:00 Europe/London the day
-- before (daily-booking-reminder-1400-utc / -1500-utc, gated in
-- notify-booking-reminder on at_hour_uk = 15). Any booking created or
-- rescheduled onto tomorrow AFTER that run never gets a reminder. On
-- Wed 3 Sep 2026, 6 of 12 dogs missed theirs this way — two were moved
-- onto the day two minutes after the 15:00 run.
--
-- FIX: a second, identical pass at 19:00 Europe/London. The function is
-- already idempotent per (booking_id, trigger_type, human_id) via the
-- partial unique index on notification_log, so customers reminded at
-- 15:00 are skipped ("skipped (duplicate)") and only the late additions
-- receive a message. Same UTC-pair trick as the 15:00 jobs:
--   summer: 18:00 UTC = 19:00 BST → sends; 19:00 UTC = 20:00 BST → skipped
--   winter: 18:00 UTC = 18:00 GMT → skipped; 19:00 UTC = 19:00 GMT → sends
-- The hourly reminder-sms-fallback job (:15) chases undelivered WhatsApp
-- from this pass at ~20:15 UK, same as it does for the 15:00 pass.
--
-- Idempotent: unschedules its own jobs before (re)creating them.

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
  'daily-booking-reminder-late-1800-utc',
  'daily-booking-reminder-late-1900-utc'
);

SELECT cron.schedule(
  'daily-booking-reminder-late-1800-utc',
  '0 18 * * *',
  $$
    SELECT net.http_post(
      url := public.get_supabase_url() || '/functions/v1/notify-booking-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(public.get_webhook_secret(), '')
      ),
      body := '{"at_hour_uk": 19}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'daily-booking-reminder-late-1900-utc',
  '0 19 * * *',
  $$
    SELECT net.http_post(
      url := public.get_supabase_url() || '/functions/v1/notify-booking-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(public.get_webhook_secret(), '')
      ),
      body := '{"at_hour_uk": 19}'::jsonb
    );
  $$
);
