-- 040_webhook_secret_via_vault.sql
--
-- BACKGROUND: Migrations 013 (reminder cron), 020 (waitlist trigger), and
-- 039 (booking-status notification triggers) all authenticate to their
-- target edge functions with `current_setting('app.webhook_secret', true)`.
-- That GUC is set via `ALTER DATABASE postgres SET app.webhook_secret = ...`,
-- which on newer Supabase projects requires elevated privileges that the
-- normal `postgres` role does not have. As a result, the GUC was never set,
-- the triggers were sending `Authorization: Bearer ` (empty), and the edge
-- functions were rejecting every call with 401. notification_log shows zero
-- rows since migration 039 went in.
--
-- FIX: Move the webhook secret to Supabase Vault (encrypted at rest, one
-- supported way to provision secrets that Postgres triggers can read on
-- newer Supabase projects), introduce a SECURITY DEFINER helper that reads
-- it, and rewrite the four trigger functions + one cron job to use the
-- helper instead of the GUC.
--
-- Caller assumes the secret named 'webhook_secret' has already been created
-- in the Vault via `SELECT vault.create_secret('<value>', 'webhook_secret')`.
-- That value MUST match the WEBHOOK_SECRET edge-function env variable.
--
-- ⚠ WARNING: hardcoded Supabase project URL (nlzhllhkigmsvrzduefz). If the
-- project ref ever changes, every URL in this file must be updated. Same
-- pattern as migrations 013, 014, 020, 027, 039.

-- ── 1. Helper function ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_webhook_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, vault, pg_temp
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'webhook_secret'
  LIMIT 1;
$$;

-- Lock this down — anon/authenticated must never be able to read the
-- webhook secret via RPC. Only the trigger/cron caller (postgres role)
-- needs execute access.
REVOKE EXECUTE ON FUNCTION public.get_webhook_secret() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_webhook_secret() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_webhook_secret() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_webhook_secret() TO postgres;

COMMENT ON FUNCTION public.get_webhook_secret() IS
  'Returns the WEBHOOK_SECRET shared with the notify-* edge functions. '
  'Reads from Supabase Vault (mig 040). Locked down — do NOT grant to anon/authenticated.';

-- ── 2. Booking-confirmed trigger (was migration 039) ──────────────────────

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
      'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
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

-- ── 3. Booking-cancelled trigger (was migration 039) ──────────────────────

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
      'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
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

-- ── 4. Booking-ready trigger (was migration 039) ──────────────────────────

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
      'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
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

-- ── 5. Waitlist-joined trigger (was migration 020) ────────────────────────

CREATE OR REPLACE FUNCTION notify_waitlist_joined_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/notify-waitlist-joined',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
    ),
    body    := jsonb_build_object(
      'type',   'INSERT',
      'table',  'waitlist_entries',
      'record', row_to_json(NEW)
    )
  );
  RETURN NEW;
END;
$$;

-- ── 6. Daily reminder cron (was migration 013) ────────────────────────────
-- cron.schedule stores the literal SQL string, so we have to unschedule and
-- reschedule rather than ALTER. Keep the same job name + schedule.

SELECT cron.unschedule('daily-booking-reminder');

SELECT cron.schedule(
  'daily-booking-reminder',
  '0 18 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/notify-booking-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body    := '{}'::jsonb
    );
  $$
);
