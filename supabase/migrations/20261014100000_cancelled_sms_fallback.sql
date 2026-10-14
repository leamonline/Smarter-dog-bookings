-- Cancellation notices join the SMS safety net (#989, audit C3 step one).
--
-- notify-booking-cancelled sends over Twilio WhatsApp, which answers 2xx when
-- it QUEUES a message, and this project has no status callback for that
-- channel. The function now leaves such a row at status='pending' instead of
-- 'sent' (AGENTS.md: delivery is never inferred from an attempted provider
-- call). The existing notification-pending-reaper flips it to 'failed' after
-- ten minutes and reminder-sms-fallback then texts the same wording, claiming
-- a 'cancelled_sms_fallback' row exactly as it does for reminders and
-- confirmations.
--
-- Two database changes make that possible:
--
--  1. notification_log.trigger_type allows 'cancelled_sms_fallback'. Every
--     value currently permitted is preserved (the list is the one from
--     20260627170000_day_closure_broadcast).
--  2. The reaper keeps an error_message the sending function already wrote.
--     The function records why the row is pending ("Twilio accepted … no
--     delivery receipt"); the reaper's own "send interrupted" text would have
--     replaced it with something untrue. Rows with no message still get the
--     reaper's text, so a genuinely interrupted send reads as before.
--
-- Idempotent: constraint drop/add, cron unschedule/schedule by name.

-- ── 1. Extend trigger_type CHECK ────────────────────────────
alter table public.notification_log
  drop constraint if exists notification_log_trigger_type_check;

alter table public.notification_log
  add constraint notification_log_trigger_type_check
  check (trigger_type in (
    'confirmed', 'reminder', 'cancelled', 'waitlist_joined', 'ready', 'welcome',
    'reminder_sms_fallback', 'confirmed_sms_fallback', 'cancelled_sms_fallback',
    'staff_message', 'staff_new_booking', 'staff_cancellation', 'staff_reschedule',
    'staff_new_client', 'staff_waitlist',
    'day_closure'
  ));

-- ── 2. Reaper preserves a message the sender wrote ──────────
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'notification-pending-reaper';
select cron.schedule(
  'notification-pending-reaper',
  '*/15 * * * *',
  $$
    update public.notification_log
       set status = 'failed',
           error_message = coalesce(
             error_message,
             'reaped: stuck pending >10min (send interrupted before finalise)'
           )
     where status = 'pending'
       and created_at < now() - interval '10 minutes'
  $$
);
