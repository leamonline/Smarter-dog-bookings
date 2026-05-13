-- Migration: add_customer_trusted_human_rpc
-- Date: 2026-05-13
--
-- Customer-self-service RPC to add a trusted human (someone allowed
-- to drop off / pick up their dog).
--
-- The existing RLS on `humans` and `human_trusted_contacts` is
-- staff-only for INSERT, so the customer portal previously could only
-- direct people to "message the salon". This SECURITY DEFINER function
-- gives the portal a safe path:
--   * Identifies the caller's own humans row from auth.uid()
--   * Validates phone (UK mobile, normalised to +44 form)
--   * Re-uses an existing humans row if the phone already matches
--     (07 or +44 form), otherwise creates a minimal new row with
--     name/surname/phone only
--   * Inserts the link, idempotent on the (human_id, trusted_id) PK
--   * Rejects self-trust via the table CHECK constraint (surfaced
--     with a clearer error before the constraint would fire)
--
-- Returns the trusted human's customer-safe fields so the UI can
-- append without a refetch.

CREATE OR REPLACE FUNCTION public.add_customer_trusted_human(
  p_name text,
  p_surname text,
  p_phone text,
  p_relationship text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  surname text,
  phone text,
  relationship text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := (SELECT auth.uid());
  v_my_id        uuid;
  v_trusted      public.humans%rowtype;
  v_phone_clean  text;
  v_normalised   text;
  v_alt          text;
  v_rel          text := nullif(trim(coalesce(p_relationship, '')), '');
  v_name         text := nullif(trim(coalesce(p_name, '')), '');
  v_surname      text := nullif(trim(coalesce(p_surname, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  -- Caller's own humans row (must already be linked via login)
  SELECT h.id INTO v_my_id
  FROM public.humans h
  WHERE h.customer_user_id = v_uid
  LIMIT 1;

  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'no_linked_human' USING errcode = '28000';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'name_required' USING errcode = '22023';
  END IF;

  -- Normalise phone: strip whitespace, then accept either "07..." or
  -- "+44..." UK mobile shapes. Store in +44 form to match the rest of
  -- the salon's records.
  v_phone_clean := regexp_replace(coalesce(p_phone, ''), '\s', '', 'g');
  IF v_phone_clean = '' THEN
    RAISE EXCEPTION 'phone_required' USING errcode = '22023';
  END IF;

  IF v_phone_clean ~ '^07\d{9}$' THEN
    v_normalised := '+44' || substring(v_phone_clean FROM 2);
  ELSIF v_phone_clean ~ '^\+447\d{9}$' THEN
    v_normalised := v_phone_clean;
  ELSE
    RAISE EXCEPTION 'phone_invalid' USING errcode = '22023';
  END IF;
  v_alt := replace(v_normalised, '+44', '0');

  -- Re-use existing humans row by phone (either canonical form),
  -- otherwise create a minimal one. INSERT bypasses the staff-only
  -- INSERT RLS policy because the function runs as its owner.
  SELECT * INTO v_trusted
  FROM public.humans h
  WHERE h.phone = v_normalised OR h.phone = v_alt
  LIMIT 1;

  IF v_trusted.id IS NULL THEN
    INSERT INTO public.humans (name, surname, phone)
    VALUES (v_name, v_surname, v_normalised)
    RETURNING * INTO v_trusted;
  END IF;

  -- CHECK constraint rejects self-trust; surface a clearer error.
  IF v_trusted.id = v_my_id THEN
    RAISE EXCEPTION 'cannot_trust_self' USING errcode = '23514';
  END IF;

  INSERT INTO public.human_trusted_contacts (human_id, trusted_id, relationship)
  VALUES (v_my_id, v_trusted.id, v_rel)
  ON CONFLICT (human_id, trusted_id) DO UPDATE
    SET relationship = COALESCE(EXCLUDED.relationship, public.human_trusted_contacts.relationship);

  RETURN QUERY
    SELECT v_trusted.id,
           v_trusted.name,
           v_trusted.surname,
           v_trusted.phone,
           coalesce(v_rel, '');
END;
$$;

REVOKE ALL ON FUNCTION public.add_customer_trusted_human(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_customer_trusted_human(text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.add_customer_trusted_human(text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_customer_trusted_human(text, text, text, text) TO authenticated;
