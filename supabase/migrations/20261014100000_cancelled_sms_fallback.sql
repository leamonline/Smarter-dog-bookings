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
-- Idempotent: constraint drop (by definition) and add, cron unschedule/schedule
-- by name.
--
-- The CHECK swap takes an ACCESS EXCLUSIVE lock on notification_log, which
-- every notify function writes to. If a long transaction already holds the
-- table, waiting for it would queue every notification write behind this
-- migration, so give up after five seconds instead; the apply fails cleanly
-- and can be run again. (Scoped to this file's transaction.)
set local lock_timeout = '5s';

-- ── 1. Extend trigger_type CHECK ────────────────────────────
-- Drop by definition, not only by name, exactly as 20260627170000 does:
-- production has carried a differently named trigger_type CHECK before, and a
-- leftover one would silently refuse 'cancelled_sms_fallback' (the fallback's
-- claim insert would fail and no SMS would go).
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'notification_log'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%trigger_type%'
  loop
    execute format('alter table public.notification_log drop constraint %I', r.conname);
  end loop;
end $$;

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
