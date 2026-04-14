-- 013_cron_and_waitlist_notify.sql
-- ⚠ WARNING: This migration contains a hardcoded Supabase project URL
-- (nlzhllhkigmsvrzduefz.supabase.co). If the project ref changes, update
-- the cron job URL in this file accordingly.
-- 1. Extend notification_log trigger_type to include 'waitlist_joined'
-- 2. Enable pg_cron + pg_net for scheduled reminder calls
-- 3. Schedule the daily reminder cron job

-- ── 1. Extend notification_log trigger_type constraint ─────────────────────
ALTER TABLE notification_log
  DROP CONSTRAINT IF EXISTS notification_log_trigger_type_check;

ALTER TABLE notification_log
  ADD CONSTRAINT notification_log_trigger_type_check
  CHECK (trigger_type IN ('confirmed', 'reminder', 'cancelled', 'waitlist_joined'));

-- ── 2. Enable extensions ──────────────────────────────────────────────────
-- pg_cron and pg_net are available on paid Supabase plans (Pro+).
-- On free plans, enable via Dashboard → Extensions.
-- These are no-ops if already enabled.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 3. Daily reminder cron ────────────────────────────────────────────────
-- Runs every day at 18:00 UTC (adjust timezone as needed).
-- Replace <PROJECT_REF> with your actual Supabase project ref (nlzhllhkigmsvrzduefz).
-- The Authorization header must match WEBHOOK_SECRET set in your edge function secrets.
--
-- NOTE: pg_cron jobs must be created in the postgres database.
-- If this migration fails on a free plan, create the cron job manually via
-- Dashboard → Extensions → pg_cron, or use a third-party scheduler like cron-job.org
-- to call: https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/notify-booking-reminder

SELECT cron.schedule(
  'daily-booking-reminder',                     -- job name (unique)
  '0 18 * * *',                                  -- every day at 18:00 UTC
  $$
    SELECT net.http_post(
      url := 'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/notify-booking-reminder',
      headers := '{"Authorization": "Bearer ' || current_setting('app.webhook_secret', true) || '", "Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
