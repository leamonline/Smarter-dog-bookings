-- ============================================================
-- Reminders → Meta WhatsApp template + SMS fallback.
--
-- WHY:
--  • The nightly day-before reminder was sent as FREE-TEXT WhatsApp via
--    Twilio (notify-booking-reminder). Twilio's WhatsApp sender is a
--    different number from our Meta WhatsApp Business line, so those
--    reminders never showed up in the staff inbox and carried no Meta
--    delivery status. We now send the approved Meta template
--    (appointment_reminder_v1) via the whatsapp-send function, which
--    records the message to the inbox with a meta_message_id — so staff
--    see sent / delivered / read just like any other thread message.
--  • If that WhatsApp reminder isn't delivered within ~1h (or the send
--    failed outright), an hourly cron sends an SMS reminder instead.
--
-- This migration:
--  1. Adds provider_message_id + message_text to notification_log so the
--     SMS-fallback job can read the WhatsApp send's delivery status and
--     resend the exact reminder wording without re-deriving it.
--  2. Extends the trigger_type CHECK to allow 'reminder_sms_fallback'.
--  3. Reschedules the WhatsApp reminder to 3pm UK (DST-aware) and adds
--     the hourly SMS-fallback cron.
--
-- ⚠ Hardcoded project URL (nlzhllhkigmsvrzduefz.supabase.co) — matches
--   migration 013. Update if the project ref changes.
-- Idempotent: safe to apply individually (we run migrations by hand).
-- ============================================================

-- ── 1. New columns ──────────────────────────────────────────
ALTER TABLE notification_log
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS message_text        text;

COMMENT ON COLUMN notification_log.provider_message_id IS
  'Provider id for the send: Meta meta_message_id (whatsapp) or Twilio sid (sms). Links a reminder row to its whatsapp_messages delivery status so the SMS-fallback job can tell whether the WhatsApp reminder actually landed.';
COMMENT ON COLUMN notification_log.message_text IS
  'The rendered reminder text. Stored so the SMS-fallback job can resend the same wording without re-deriving it from the booking.';

-- ── 2. Extend trigger_type CHECK ────────────────────────────
-- Preserve EVERY value currently allowed in prod (confirmed, reminder,
-- cancelled, waitlist_joined, ready, welcome — the last two drifted in
-- ahead of the migration files) and add the SMS-fallback type.
ALTER TABLE notification_log
  DROP CONSTRAINT IF EXISTS notification_log_trigger_type_check;

ALTER TABLE notification_log
  ADD CONSTRAINT notification_log_trigger_type_check
  CHECK (trigger_type IN (
    'confirmed', 'reminder', 'cancelled', 'waitlist_joined',
    'ready', 'welcome', 'reminder_sms_fallback'
  ));

-- ── 3. Reschedule the cron jobs ─────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- AUTH: these jobs read the webhook secret via get_webhook_secret()
-- (Supabase Vault, migration 040), NOT current_setting('app.webhook_secret').
-- That GUC is empty on this project — using it sends an empty Bearer token
-- and every cron call 401s silently. Always copy the get_webhook_secret()
-- pattern for new scheduled jobs / triggers.

-- Drop the old 18:00 UTC reminder job and our own jobs (so re-applying
-- this migration is clean). unschedule-by-jobid returns no rows when the
-- job is absent, so this never errors.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daily-booking-reminder';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
  'daily-booking-reminder-1400-utc',
  'daily-booking-reminder-1500-utc',
  'reminder-sms-fallback-hourly'
);

-- pg_cron runs in UTC and has no per-job timezone, but the salon wants
-- the reminder at 3pm UK year-round. UK is UTC+1 (BST) in summer and
-- UTC+0 (GMT) in winter, so we fire at BOTH 14:00 and 15:00 UTC and let
-- notify-booking-reminder gate on the real Europe/London hour
-- (at_hour_uk = 15):
--   summer: 14:00 UTC = 15:00 BST → sends; 15:00 UTC = 16:00 BST → skipped
--   winter: 14:00 UTC = 14:00 GMT → skipped; 15:00 UTC = 15:00 GMT → sends
SELECT cron.schedule(
  'daily-booking-reminder-1400-utc',
  '0 14 * * *',
  $$
    SELECT net.http_post(
      url := 'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/notify-booking-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body := '{"at_hour_uk": 15}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'daily-booking-reminder-1500-utc',
  '0 15 * * *',
  $$
    SELECT net.http_post(
      url := 'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/notify-booking-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body := '{"at_hour_uk": 15}'::jsonb
    );
  $$
);

-- Hourly SMS-fallback for WhatsApp reminders not delivered within ~1h.
-- Runs at :15 past each hour, so the 3pm WhatsApp send is chased from
-- ~4:15pm. The function itself is idempotent (one fallback per booking).
SELECT cron.schedule(
  'reminder-sms-fallback-hourly',
  '15 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/reminder-sms-fallback',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body := '{}'::jsonb
    );
  $$
);
