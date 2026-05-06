-- Fix Codex Security scan findings from 2026-05-06:
-- - staff_profiles self-insert allowed authenticated users to mint staff access
-- - link_customer_to_human was executable too broadly and returned full humans rows

-- 1. Staff profile creation is service-role/admin only.
-- Existing staff can still update their own non-role fields through the later
-- combined_update_staff_profiles policy; new staff rows must be created by a
-- service-role controlled admin path.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.staff_profiles;
DROP POLICY IF EXISTS owner_insert_staff_profiles ON public.staff_profiles;
REVOKE INSERT ON TABLE public.staff_profiles FROM anon, authenticated;

-- 2. Recreate the customer linking RPC with an explicit auth guard, null-safe
-- ownership check, narrow return shape, and explicit execute grants.
DROP FUNCTION IF EXISTS public.link_customer_to_human(text);

CREATE FUNCTION public.link_customer_to_human(p_phone text)
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
  v_human     public.humans%rowtype;
  v_normalised text;
  v_alt        text;
  v_uid        uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  -- Keep the original +44/07 behaviour for the customer portal contract.
  v_normalised := replace(coalesce(p_phone, ''), ' ', '');
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

REVOKE ALL ON FUNCTION public.link_customer_to_human(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_customer_to_human(text) FROM anon;
REVOKE ALL ON FUNCTION public.link_customer_to_human(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.link_customer_to_human(text) TO authenticated;
