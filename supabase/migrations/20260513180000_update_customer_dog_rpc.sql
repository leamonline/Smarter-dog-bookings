-- Migration: update_customer_dog_rpc
-- Date: 2026-05-13
--
-- Customer-self-service RPC to edit basic details on a dog they own.
--
-- RLS on `dogs` keeps UPDATE staff-only so the salon stays in
-- control of alerts, custom_price, groom_notes, and the human_id
-- ownership column. This SECURITY DEFINER function gives the
-- customer portal a safe, narrow path: only name / breed / size /
-- dob can be changed, and only on a row the caller owns.
--
-- Identity is sourced from auth.uid() so the dog id is the only
-- attacker-controlled input -- ownership is enforced against the
-- caller's humans row before the UPDATE runs.

CREATE OR REPLACE FUNCTION public.update_customer_dog(
  p_dog_id uuid,
  p_name   text,
  p_breed  text DEFAULT NULL,
  p_size   text DEFAULT NULL,
  p_dob    text DEFAULT NULL
)
RETURNS TABLE (
  id        uuid,
  name      text,
  breed     text,
  size      text,
  dob       text,
  human_id  uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_my_id   uuid;
  v_dog     public.dogs%rowtype;
  v_name    text := nullif(trim(coalesce(p_name, '')), '');
  v_breed   text := nullif(trim(coalesce(p_breed, '')), '');
  v_size    text := nullif(trim(lower(coalesce(p_size, ''))), '');
  v_dob     text := nullif(trim(coalesce(p_dob, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  SELECT h.id INTO v_my_id
  FROM public.humans h
  WHERE h.customer_user_id = v_uid
  LIMIT 1;

  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'no_linked_human' USING errcode = '28000';
  END IF;

  -- Ownership gate: dog must belong to the caller.
  SELECT * INTO v_dog
  FROM public.dogs d
  WHERE d.id = p_dog_id AND d.human_id = v_my_id
  LIMIT 1;

  IF v_dog.id IS NULL THEN
    RAISE EXCEPTION 'dog_not_found' USING errcode = '42704';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'name_required' USING errcode = '22023';
  END IF;

  IF v_size IS NOT NULL AND v_size NOT IN ('small', 'medium', 'large') THEN
    RAISE EXCEPTION 'invalid_size' USING errcode = '22023';
  END IF;

  UPDATE public.dogs d
  SET    name  = v_name,
         breed = v_breed,
         size  = v_size,
         dob   = v_dob
  WHERE  d.id = p_dog_id
  RETURNING d.* INTO v_dog;

  RETURN QUERY
    SELECT v_dog.id, v_dog.name, v_dog.breed, v_dog.size, v_dog.dob, v_dog.human_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_customer_dog(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_customer_dog(uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.update_customer_dog(uuid, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_dog(uuid, text, text, text, text) TO authenticated;
