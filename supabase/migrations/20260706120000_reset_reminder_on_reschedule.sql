-- ============================================================
-- Reset the day-before reminder when a booking is rescheduled to a new date
--
-- WHY
-- "Reminder sent" is NOT a flag on the booking row — it is derived from
-- notification_log rows keyed on booking_id (trigger_type='reminder',
-- status='sent'), and enforced idempotent by the partial unique index
-- idx_notification_log_idempotent (booking_id, trigger_type, human_id) WHERE
-- status IN ('pending','sent'). When a booking is rescheduled the app does a
-- plain UPDATE bookings SET booking_date=…; the booking_id is unchanged, so the
-- OLD date's reminder row survives. The nightly cron (notify-booking-reminder)
-- and the manual sender (reminder-send) then INSERT a fresh reminder, hit the
-- unique index (23505) and SKIP silently — so the NEW date never gets a
-- reminder, and the dashboard's "Tomorrow's reminders" panel shows it as
-- already sent. There is no reset anywhere today.
--
-- WHAT
-- A BEFORE UPDATE trigger on bookings that, ONLY when booking_date actually
-- changes, clears the stale reminder ledger for that booking so the next
-- nightly/manual send fires a fresh reminder for the new date:
--   1. DELETE the reminder-family notification_log rows for this booking
--      (trigger_type IN ('reminder','reminder_sms_fallback')). Deleting (rather
--      than flipping to status='failed') frees the idempotency index AND avoids
--      surfacing the move as a false delivery failure on the Delivery-Failures
--      dashboard (which reads status='failed'). The old-date reminder is moot
--      after a move, so losing that audit row is intentional.
--   2. Clear reminder_confirmed_at — the customer confirmed the OLD date; that
--      confirmation is stale after a move, so a fresh confirm can be captured.
--      (This deliberately overrides the "never cleared" note on that column
--      from 20260531120000, which predates same-day reschedule support.)
--
-- This lives in the DB — the single source of truth — so it covers EVERY
-- reschedule route (staff modal, the WhatsApp AI apply_whatsapp_booking_action
-- RPC, and any future path) exactly like the table-level booking gates. A
-- frontend- or edge-function-only fix would miss routes.
--
-- SECURITY DEFINER so the cross-table DELETE on notification_log always
-- succeeds regardless of who reschedules (a staff auth role or a SECURITY
-- DEFINER RPC), independent of notification_log's RLS. Only touches NEW for the
-- booking row; never raises, so it can't block a legitimate reschedule.
--
-- Additive + idempotent (create or replace + drop/create trigger). Touches no
-- existing rule, RLS policy, capacity maths or the status CHECK. Apply to prod
-- BY HAND before merging code that depends on it (per docs/migrations.md).
-- ============================================================

create or replace function public.reset_reminder_on_reschedule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.booking_date is distinct from old.booking_date then
    -- Free the idempotency index so the next cron/manual send fires afresh,
    -- and drop any stale failure for the old date at the same time.
    delete from public.notification_log
     where booking_id = old.id
       and trigger_type in ('reminder', 'reminder_sms_fallback');

    -- The "Confirm" tick was for the old date — clear it so the booking isn't
    -- shown as confirmed for a date the customer never confirmed.
    new.reminder_confirmed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_reminder_on_reschedule on public.bookings;
create trigger trg_reset_reminder_on_reschedule
  before update on public.bookings
  for each row
  when (old.booking_date is distinct from new.booking_date)
  execute function public.reset_reminder_on_reschedule();

-- Trigger functions fire regardless of EXECUTE privilege, so lock this down to
-- nobody per docs/migrations.md (Supabase default-grants EXECUTE to anon +
-- authenticated on new public functions).
revoke execute on function public.reset_reminder_on_reschedule() from public, anon, authenticated;
