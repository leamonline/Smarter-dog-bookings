-- 039_booking_status_notification_triggers.sql
--
-- Wires the dormant notify-booking-* edge functions to actual database
-- triggers, and adds the new notify-booking-ready function (status →
-- 'Ready for pick-up').
--
-- Three triggers:
--   1. AFTER INSERT on bookings           → notify-booking-confirmed
--   2. AFTER UPDATE (status → Cancelled)  → notify-booking-cancelled
--   3. AFTER UPDATE (status → Ready)      → notify-booking-ready
--
-- Each trigger function fires asynchronously via pg_net so the calling
-- transaction is never blocked by HTTP latency. Auth is the shared
-- WEBHOOK_SECRET, set via `current_setting('app.webhook_secret', true)`
-- (matches the existing pattern in 020_fix_waitlist_trigger_auth.sql).
--
-- ⚠ WARNING: hardcoded Supabase project URL (nlzhllhkigmsvrzduefz). If
-- the project ref ever changes, every URL in this file must be updated.
-- This matches the pattern already used by 013, 014, 020, 027.

-- ── 1. Extend notification_log trigger_type to include 'ready' ────────────
ALTER TABLE notification_log
  DROP CONSTRAINT IF EXISTS notification_log_trigger_type_check;

ALTER TABLE notification_log
  ADD CONSTRAINT notification_log_trigger_type_check
  CHECK (trigger_type IN ('confirmed', 'reminder', 'cancelled', 'waitlist_joined', 'ready'));

-- ── 2. Booking-confirmed trigger ──────────────────────────────────────────
-- Fires on every new booking. The edge function itself filters to
-- status='Not Arrived' and dedupes group bookings, so the trigger can
-- be unconditional.

CREATE OR REPLACE FUNCTION notify_on_booking_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/notify-booking-confirmed',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(current_setting('app.webhook_secret', true), '')
    ),
    body    := jsonb_build_object(
      'type',   'INSERT',
      'table',  'bookings',
      'record', row_to_json(NEW)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_booking_confirmed_trigger ON bookings;
CREATE TRIGGER notify_booking_confirmed_trigger
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_booking_insert();

-- ── 3. Booking-cancelled trigger ──────────────────────────────────────────
-- Cancellation in this app is an UPDATE that sets status='Cancelled',
-- not a DELETE (see migration 015 and src/components/customer/
-- CustomerDashboard.jsx). Trigger fires only on the transition into
-- 'Cancelled' so toggling other fields on an already-cancelled row
-- doesn't double-send.

CREATE OR REPLACE FUNCTION notify_on_booking_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/notify-booking-cancelled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(current_setting('app.webhook_secret', true), '')
    ),
    body    := jsonb_build_object(
      'type',       'UPDATE',
      'table',      'bookings',
      'record',     row_to_json(NEW),
      'old_record', row_to_json(OLD)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_booking_cancelled_trigger ON bookings;
CREATE TRIGGER notify_booking_cancelled_trigger
  AFTER UPDATE ON bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'Cancelled')
  EXECUTE FUNCTION notify_on_booking_cancelled();

-- ── 4. Booking-ready trigger ──────────────────────────────────────────────
-- Fires when a booking transitions into 'Ready for pick-up' so the
-- customer gets a notification their dog is ready to collect.

CREATE OR REPLACE FUNCTION notify_on_booking_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/notify-booking-ready',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(current_setting('app.webhook_secret', true), '')
    ),
    body    := jsonb_build_object(
      'type',       'UPDATE',
      'table',      'bookings',
      'record',     row_to_json(NEW),
      'old_record', row_to_json(OLD)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_booking_ready_trigger ON bookings;
CREATE TRIGGER notify_booking_ready_trigger
  AFTER UPDATE ON bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'Ready for pick-up')
  EXECUTE FUNCTION notify_on_booking_ready();
