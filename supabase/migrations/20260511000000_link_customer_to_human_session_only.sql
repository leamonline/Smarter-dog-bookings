-- Migration: link_customer_to_human_session_only
-- Date: 2026-05-11
-- Issue: #92
--
-- PROBLEM: link_customer_to_human(p_phone text) trusts the caller-supplied
-- phone argument. Although the customer portal passes the user's
-- auth-verified phone (session.user.phone), the RPC is GRANT EXECUTE TO
-- authenticated and can be invoked directly via supabase.rpc(...) by any
-- signed-in user from a browser console with an arbitrary phone number.
--
-- For any unclaimed humans row matching that phone (which is most of the
-- salon's records — only a handful of customers have linked via the
-- portal so far), the RPC sets customer_user_id = auth.uid() and returns
-- the row. The attacker is now mapped to the victim's record and gets
-- ongoing access to their bookings, dogs, and contact details via
-- subsequent customer-portal queries.
--
-- The May 6 codex security fix (mig 20260506220411) added an auth guard,
-- narrowed the return shape, and locked down grants — but did not
-- address this row-takeover path because the input phone was still
-- attacker-controlled.
--
-- FIX: Drop the p_phone parameter entirely and derive the lookup phone
-- from auth.users for the calling auth.uid(). Removes the
-- attacker-controlled input. The customer portal call site is updated
-- to drop the argument in the same change.

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
  -- from the caller. This is the change that closes the row-takeover gap.
  SELECT phone INTO v_phone FROM auth.users WHERE id = v_uid;

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
      v_human.customer_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_customer_to_human() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_customer_to_human() FROM anon;
REVOKE ALL ON FUNCTION public.link_customer_to_human() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.link_customer_to_human() TO authenticated;
