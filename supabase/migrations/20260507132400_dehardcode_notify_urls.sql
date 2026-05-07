-- Migration: dehardcode_notify_urls
-- Date: 2026-05-07
--
-- PROBLEM: Five trigger functions and one cron job embed the Supabase project
-- URL as a hardcoded literal string:
--
--   'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/<fn-name>'
--
-- This was called out with a ⚠ WARNING comment in migrations 039 and 040.
-- If the project ref ever changes (e.g. a project fork, migration to a new
-- org, or disaster recovery to a new project), every one of those URLs must
-- be found and replaced manually — an error-prone, easy-to-miss operation.
--
-- FIX: Introduce get_supabase_url() — a SECURITY DEFINER helper that reads
-- the project URL from Supabase Vault (same pattern as get_webhook_secret()
-- introduced in migration 040). Then rewrite all five trigger functions and
-- the cron job to call get_supabase_url() || '/functions/v1/<fn-name>'
-- instead of the literal string.
--
-- PRE-REQUISITE: Run this once in the Supabase SQL Editor to store the URL
-- in the Vault before applying this migration:
--
--   SELECT vault.create_secret(
--     'https://nlzhllhkigmsvrzduefz.supabase.co',
--     'supabase_url'
--   );
--
-- If the secret already exists (e.g. you are re-running after a project
-- move), update it instead:
--
--   UPDATE vault.secrets
--   SET secret = 'https://<new-ref>.supabase.co'
--   WHERE name = 'supabase_url';
--
-- The trigger functions will fall back to the hardcoded URL if the Vault
-- secret is missing, so existing behaviour is preserved during the rollout
-- window while you provision the secret.

-- ── 1. get_supabase_url() helper ─────────────────────────────────────────
--
-- Mirrors get_webhook_secret() from migration 040. Reads the project base
-- URL from Vault. Returns the hardcoded fallback if the secret is missing
-- so that triggers don't silently break before the secret is provisioned.

CREATE OR REPLACE FUNCTION public.get_supabase_url()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, vault, pg_temp
AS $$
  SELECT coalesce(
    (SELECT decrypted_secret
     FROM vault.decrypted_secrets
     WHERE name = 'supabase_url'
     LIMIT 1),
    'https://nlzhllhkigmsvrzduefz.supabase.co'  -- fallback; replace after project move
  );
$$;

-- Lock down exactly like get_webhook_secret() — only the postgres role
-- (used by trigger/cron callers) needs execute access.
REVOKE EXECUTE ON FUNCTION public.get_supabase_url() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_supabase_url() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_supabase_url() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_supabase_url() TO postgres;

COMMENT ON FUNCTION public.get_supabase_url() IS
  'Returns the Supabase project base URL (e.g. https://<ref>.supabase.co). '
  'Reads from Vault secret ''supabase_url'' (mig 20260507132400). '
  'Falls back to the hardcoded URL if the secret is not yet provisioned. '
  'Locked down — do NOT grant to anon/authenticated.';

-- ── 2. notify_on_booking_insert ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_on_booking_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := get_supabase_url() || '/functions/v1/notify-booking-confirmed',
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

-- ── 3. notify_on_booking_cancelled ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_on_booking_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := get_supabase_url() || '/functions/v1/notify-booking-cancelled',
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

-- ── 4. notify_on_booking_ready ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_on_booking_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := get_supabase_url() || '/functions/v1/notify-booking-ready',
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

-- ── 5. notify_waitlist_joined_trigger ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_waitlist_joined_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := get_supabase_url() || '/functions/v1/notify-waitlist-joined',
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

-- ── 6. Daily reminder cron job ────────────────────────────────────────────
-- cron.schedule stores the literal SQL string at schedule time, so we must
-- unschedule and reschedule to pick up the new get_supabase_url() call.
-- Keep the same job name and schedule as migration 040.

SELECT cron.unschedule('daily-booking-reminder');

SELECT cron.schedule(
  'daily-booking-reminder',
  '0 18 * * *',
  $$
    SELECT net.http_post(
      url     := public.get_supabase_url() || '/functions/v1/notify-booking-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(public.get_webhook_secret(), '')
      ),
      body    := '{}'::jsonb
    );
  $$
);
