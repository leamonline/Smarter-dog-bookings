-- Migration: fix_customer_phone_normalisation_no_plus
-- Date: 2026-05-11
--
-- PROBLEM: link_customer_to_human() reads auth.users.phone (set on OTP
-- verify), but Supabase Auth stores that value in E.164 WITHOUT the
-- leading "+" — e.g. "447540550564". The function's normalisation then
-- ran:
--   v_normalised := replace(v_phone, ' ', '');            -- "447540550564"
--   v_alt        := replace(v_normalised, '+44', '0');    -- unchanged, no "+44"
-- and looked for humans.phone in either form. Salon records are stored
-- as "+447540550564", so neither branch matched. The customer portal
-- then surfaced "We don't have your number on file yet" for users whose
-- humans row was unclaimed and addressable but stored with the "+".
--
-- FIX: Re-add the leading "+" if it's missing, before deriving the 07
-- alt form. Keeps the existing "+44 / 07" matching contract intact.

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
  customer_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_human      public.humans%rowtype;
  v_uid        uuid := (SELECT auth.uid());
  v_phone      text;
  v_normalised text;
  v_alt        text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  -- Source the phone from auth.users (set by the OTP verify flow), NOT
  -- from the caller — closes the row-takeover gap from issue #92.
  SELECT phone INTO v_phone FROM auth.users WHERE id = v_uid;

  IF v_phone IS NULL OR v_phone = '' THEN
    RAISE EXCEPTION 'no_verified_phone' USING errcode = '28000';
  END IF;

  -- auth.users.phone is E.164 minus the leading "+". Re-add it so the
  -- "+44 / 07" matching contract below works for the canonical form
  -- humans rows are stored in.
  v_normalised := replace(v_phone, ' ', '');
  IF v_normalised <> '' AND left(v_normalised, 1) <> '+' THEN
    v_normalised := '+' || v_normalised;
  END IF;
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
      v_human.customer_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_customer_to_human() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_customer_to_human() FROM anon;
REVOKE ALL ON FUNCTION public.link_customer_to_human() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.link_customer_to_human() TO authenticated;
