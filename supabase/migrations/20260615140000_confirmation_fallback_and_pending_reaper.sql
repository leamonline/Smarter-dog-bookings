-- ============================================================
-- Confirmation SMS-fallback + stuck-'pending' reaper.
--
--  1. Extend notification_log.trigger_type to allow 'confirmed_sms_fallback'
--     so the hourly reminder-sms-fallback job can also chase an undelivered
--     WhatsApp *booking confirmation* over SMS (it already chases reminders).
--  2. Add a reaper cron for notification_log rows stuck at status='pending'.
--
-- Idempotent; apply individually (migrations aren't auto-applied on deploy).
-- ============================================================

-- ── 1. Extend trigger_type CHECK ────────────────────────────
ALTER TABLE notification_log
  DROP CONSTRAINT IF EXISTS notification_log_trigger_type_check;

ALTER TABLE notification_log
  ADD CONSTRAINT notification_log_trigger_type_check
  CHECK (trigger_type IN (
    'confirmed', 'reminder', 'cancelled', 'waitlist_joined',
    'ready', 'welcome', 'reminder_sms_fallback', 'confirmed_sms_fallback'
  ));

-- ── 2. Stuck-'pending' reaper ───────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- A notification send claims idempotency by inserting a 'pending'
-- notification_log row, then sends, then updates the row to 'sent'/'failed'.
-- If the edge function is killed mid-flight (worker timeout, a provider hang)
-- the row sticks at 'pending' forever — which BOTH blocks any re-fire (the
-- partial unique index idx_notification_log_idempotent reserves the
-- (booking_id, trigger_type) slot) AND hides it from the SMS fallback (which
-- only chases sent/failed rows). Flip stale 'pending' rows to 'failed' so the
-- slot frees and the fallback can pick them up. 10 minutes is far beyond any
-- edge-function runtime, so a 'pending' row that old is a dead send.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notification-pending-reaper';
SELECT cron.schedule(
  'notification-pending-reaper',
  '*/15 * * * *',
  $$
    UPDATE notification_log
       SET status = 'failed',
           error_message = 'reaped: stuck pending >10min (send interrupted before finalise)'
     WHERE status = 'pending'
       AND created_at < now() - interval '10 minutes'
  $$
);
