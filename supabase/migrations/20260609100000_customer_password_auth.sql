-- ============================================================
-- Customer password auth
--
-- Adds phone + password sign-in for the customer portal, with the
-- existing SMS OTP kept as the first-login / forgot-password path.
--
-- This migration is purely additive on the DB side: it teaches two
-- existing-style functions to report whether an account has a
-- password set. The password itself lives in auth.users
-- (encrypted_password) and is set client-side via
-- supabase.auth.updateUser({ password }) — never stored here.
--
-- "Has a password?" is derived LIVE from auth.users.encrypted_password
-- so it can never drift from reality (no flag column to keep in sync).
--
-- IMPORTANT: the predicate is NULLIF(encrypted_password, '') IS NOT NULL,
-- not a bare IS NOT NULL. GoTrue can store an empty string (not NULL)
-- for users who have never set a password; a bare NULL check would
-- read every OTP-only customer as "has password" and strand them in
-- the password path with a password they never created.
--
--   1. Extends link_customer_to_human() with a has_password column
--      (read off auth.users for the calling auth.uid()). Drives the
--      post-auth "you must set a password" gate.
--   2. Adds customer_phone_login_state(p_phone) — the pre-auth lookup
--      that tells the login page whether to ask for a password
--      (returning) or text a code (first-time). Service-role only,
--      called via the rate-limited customer-phone-on-file Edge Fn.
-- ============================================================

-- ── 1. link_customer_to_human(): add has_password ────────────
-- Return type changes, so DROP + CREATE (CREATE OR REPLACE cannot
-- alter a function's return type). DROP IF EXISTS keeps it idempotent.
-- Body is unchanged from 20260511000000 except for sourcing
-- encrypted_password alongside phone and returning has_password.
DROP FUNCTION IF EXISTS public.link_customer_to_human(text);
DROP FUNCTION IF EXISTS public.link_customer_to_human();

CREATE FUNCTION public.link_customer_to_human()
RETURNS TABLE (
  id uuid,
  name text,
  surname text,
  phone text,
  sms boolean,
  whatsapp boolean,
  email text,
  fb text,
  insta text,
  tiktok text,
  address text,
  customer_user_id uuid,
  has_password boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_human        public.humans%rowtype;
  v_uid          uuid := (SELECT auth.uid());
  v_phone        text;
  v_has_password boolean;
  v_normalised   text;
  v_alt          text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  -- Source the phone from auth.users (set by the OTP verify flow), NOT
  -- from the caller — this is what closes the row-takeover gap (#92).
  -- Read the password state in the same row read.
  SELECT phone, (NULLIF(encrypted_password, '') IS NOT NULL)
  INTO   v_phone, v_has_password
  FROM   auth.users
  WHERE  id = v_uid;

  IF v_phone IS NULL OR v_phone = '' THEN
    RAISE EXCEPTION 'no_verified_phone' USING errcode = '28000';
  END IF;

  -- Keep the +44 / 07 normalisation contract for matching legacy humans rows.
  v_normalised := replace(v_phone, ' ', '');
  v_alt := replace(v_normalised, '+44', '0');

  SELECT *
  INTO   v_human
  FROM   public.humans h
  WHERE  h.phone = v_normalised
     OR  h.phone = v_alt
  LIMIT  1;

  IF v_human.id IS NULL THEN
    RETURN;
  END IF;

  IF v_human.customer_user_id IS NOT NULL
     AND v_human.customer_user_id IS DISTINCT FROM v_uid THEN
    RETURN;
  END IF;

  IF v_human.customer_user_id IS NULL THEN
    UPDATE public.humans h
    SET    customer_user_id = v_uid
    WHERE  h.id = v_human.id
    RETURNING h.* INTO v_human;
  END IF;

  RETURN QUERY
    SELECT
      v_human.id,
      v_human.name,
      v_human.surname,
      v_human.phone,
      v_human.sms,
      v_human.whatsapp,
      v_human.email,
      v_human.fb,
      v_human.insta,
      v_human.tiktok,
      v_human.address,
      v_human.customer_user_id,
      v_has_password;
END;
$$;

REVOKE ALL ON FUNCTION public.link_customer_to_human() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_customer_to_human() FROM anon;
REVOKE ALL ON FUNCTION public.link_customer_to_human() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.link_customer_to_human() TO authenticated;

COMMENT ON FUNCTION public.link_customer_to_human() IS
  'Post-OTP link RPC. SECURITY DEFINER; derives the phone from auth.users for the calling auth.uid(), matches/links the humans row, and returns customer-safe fields plus has_password (whether the auth account has a password set, derived live from auth.users.encrypted_password).';

-- ── 2. customer_phone_login_state(p_phone) ───────────────────
-- Pre-auth lookup for the phone-first login page: is this number on
-- file, and does its account already have a password? Drives whether
-- the page shows a password field (returning) or texts a code
-- (first-time). Same +44/07 normalisation as customer_phone_on_file.
--
-- has_password is false when the phone is unknown OR on file but never
-- linked to an auth account (customer_user_id IS NULL) — i.e. a
-- first-time customer who has never logged in.
--
-- Privacy: like customer_phone_on_file this leaks, per number, whether
-- it is a customer; it additionally leaks whether that customer has set
-- a password. Same accepted trade-off for a single small salon — kept
-- behind the rate-limited Edge Function (service_role only) and never
-- echoed in user-facing error copy.
CREATE OR REPLACE FUNCTION public.customer_phone_login_state(p_phone text)
RETURNS TABLE (on_file boolean, has_password boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH normalised AS (
    SELECT replace(coalesce(p_phone, ''), ' ', '') AS v_norm
  ),
  matched AS (
    SELECT h.customer_user_id
    FROM   humans h, normalised n
    WHERE  h.phone = n.v_norm
       OR  h.phone = replace(n.v_norm, '+44', '0')
    LIMIT  1
  )
  SELECT
    EXISTS (SELECT 1 FROM matched) AS on_file,
    coalesce(
      (
        SELECT NULLIF(u.encrypted_password, '') IS NOT NULL
        FROM   auth.users u
        JOIN   matched m ON m.customer_user_id = u.id
      ),
      false
    ) AS has_password;
$$;

REVOKE ALL ON FUNCTION public.customer_phone_login_state(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_phone_login_state(text) FROM anon;
REVOKE ALL ON FUNCTION public.customer_phone_login_state(text) FROM authenticated;
-- service_role retains EXECUTE by default (same as customer_phone_on_file)
-- and is the only caller, via the customer-phone-on-file Edge Function.

COMMENT ON FUNCTION public.customer_phone_login_state(text) IS
  'Pre-auth lookup used by the phone-first customer login page: returns { on_file, has_password } for a phone number so the page can decide whether to ask for a password or text an OTP. Service-role only — called through the rate-limited customer-phone-on-file Edge Function.';
