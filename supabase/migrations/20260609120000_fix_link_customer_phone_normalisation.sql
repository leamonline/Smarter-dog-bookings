-- ============================================================
-- Fix link_customer_to_human phone matching
--
-- BUG: after the #92 fix (20260511000000) the function derives the
-- lookup phone from auth.users. GoTrue stores phone as digits WITHOUT
-- a leading '+' (e.g. '447540550564'), but humans rows are E.164 WITH
-- the '+' ('+447540550564') or in 0-national form ('07540550564').
-- The old normalisation — replace(phone,'+44','0') — does nothing to a
-- '44…' string that has no '+', so the lookup matched neither form and
-- returned empty. The customer then saw the "we don't have your number
-- on file" screen even though their humans row is on file (and, for an
-- already-linked account, already bound to their auth.uid()).
--
-- This broke first-time portal linking for the salon's normal phone
-- formats, and broke EVERY login for accounts already linked before #92
-- (the link RPC re-runs on every sign-in and looked the human up purely
-- by the mismatched phone).
--
-- FIX:
--   1. Find the human already linked to this auth.uid() FIRST — that's
--      format-independent, so a linked account is always recognised.
--   2. Only if not yet linked, match an UNCLAIMED humans row by phone,
--      building every UK format humans might hold (+44 / 44 / 0) from the
--      national significant number, then claim it.
--
-- Security is preserved/strengthened: the phone is still derived from
-- auth.users (never the caller, issue #92), and step 2 only ever claims
-- rows where customer_user_id IS NULL — it can never take over a human
-- already claimed by a different user.
-- ============================================================

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
  v_clean        text;
  v_national     text;
  v_candidates   text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  -- Source the phone + password state from auth.users for the calling
  -- auth.uid() — never from the caller (issue #92). Qualify the columns
  -- with the table alias: the RETURNS TABLE declares an OUT variable
  -- named `phone`, so an unqualified `phone` here is ambiguous and
  -- throws at runtime ("column reference phone is ambiguous").
  SELECT u.phone, (NULLIF(u.encrypted_password, '') IS NOT NULL)
  INTO   v_phone, v_has_password
  FROM   auth.users u
  WHERE  u.id = v_uid;

  -- 1. Already linked to this account? Look up by uid — independent of
  --    any phone-format drift between auth.users and humans.
  SELECT *
  INTO   v_human
  FROM   public.humans h
  WHERE  h.customer_user_id = v_uid
  LIMIT  1;

  -- 2. Not yet linked: match an UNCLAIMED humans row by phone and claim it.
  IF v_human.id IS NULL THEN
    IF v_phone IS NULL OR v_phone = '' THEN
      RAISE EXCEPTION 'no_verified_phone' USING errcode = '28000';
    END IF;

    -- Derive the national significant number, then enumerate every UK
    -- format a humans row might be stored in. auth.users gives us
    -- '447540550564'; humans typically holds '+447540550564' or
    -- '07540550564'.
    v_clean := regexp_replace(coalesce(v_phone, ''), '\D', '', 'g');
    v_national := CASE
      WHEN v_clean LIKE '44%' THEN substring(v_clean FROM 3)
      WHEN v_clean LIKE '0%'  THEN substring(v_clean FROM 2)
      ELSE v_clean
    END;
    v_candidates := ARRAY[
      '+44' || v_national,
      '44'  || v_national,
      '0'   || v_national,
      v_phone,
      v_clean
    ];

    SELECT *
    INTO   v_human
    FROM   public.humans h
    WHERE  h.phone = ANY(v_candidates)
      AND  h.customer_user_id IS NULL
    LIMIT  1;

    IF v_human.id IS NULL THEN
      RETURN;  -- no unclaimed humans row matches this verified phone
    END IF;

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
  'Post-sign-in link RPC. SECURITY DEFINER; finds the humans row already linked to the calling auth.uid(), else matches an unclaimed row by the auth.users phone (normalised across +44/44/0 UK forms) and claims it. Returns customer-safe fields plus has_password (live from auth.users.encrypted_password).';
