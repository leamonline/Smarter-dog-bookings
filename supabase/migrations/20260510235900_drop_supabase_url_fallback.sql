-- Migration: drop_supabase_url_fallback
-- Date: 2026-05-10
--
-- PROBLEM: 20260507132400_dehardcode_notify_urls.sql introduced
-- get_supabase_url() with a hardcoded URL fallback (line 57) for the
-- rollout window so existing triggers wouldn't break before the Vault
-- secret was provisioned. With the secret now in place, that fallback
-- has become a footgun:
--
--   * If the project is ever moved to a new ref and the new Vault
--     secret isn't seeded, every trigger and the daily cron job will
--     silently keep posting to the OLD project URL — exactly what the
--     dehardcoding was meant to prevent.
--   * The hardcoded URL still lives in the migration file in source
--     control, so anyone reading the migration history learns the
--     prod project ref.
--
-- FIX: Replace get_supabase_url() with a version that raises an
-- exception if the Vault secret is missing — failing loudly instead
-- of silently using a stale URL.
--
-- PRE-REQUISITE: this migration aborts at apply time if the Vault
-- secret 'supabase_url' is not present. If you are applying after a
-- project move, run the SELECT vault.create_secret(...) call from
-- the header of 20260507132400_dehardcode_notify_urls.sql first.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
  ) THEN
    RAISE EXCEPTION
      'Vault secret "supabase_url" must be set before applying this migration. '
      'See the header of 20260507132400_dehardcode_notify_urls.sql for the '
      'SELECT vault.create_secret(...) call.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_supabase_url()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  url text;
BEGIN
  SELECT decrypted_secret INTO url
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_url'
  LIMIT 1;

  IF url IS NULL THEN
    RAISE EXCEPTION 'Vault secret "supabase_url" is not set';
  END IF;

  RETURN url;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_supabase_url() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_supabase_url() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_supabase_url() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_supabase_url() TO postgres;

COMMENT ON FUNCTION public.get_supabase_url() IS
  'Returns the Supabase project base URL (e.g. https://<ref>.supabase.co). '
  'Reads from Vault secret ''supabase_url''. Raises an exception if the '
  'secret is missing — DO NOT add a hardcoded fallback. '
  'Locked down — do NOT grant to anon/authenticated.';
