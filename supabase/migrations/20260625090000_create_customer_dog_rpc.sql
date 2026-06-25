-- Migration: create_customer_dog_rpc
-- Date: 2026-06-25
--
-- Customer-self-service RPC to ADD a dog to a human they own. Mirrors
-- update_customer_dog (20260513180000): identity comes from auth.uid(), the
-- only attacker-controlled inputs are the dog fields + p_human_id, and
-- ownership of p_human_id is enforced before the INSERT. Closes the gap where
-- AddDogInline raw-INSERTed into dogs relying solely on the
-- customer_insert_own_dogs RLS policy.
--
-- Idempotent: create-or-replace + explicit grants. Safe to re-run.

CREATE OR REPLACE FUNCTION public.create_customer_dog(
  p_name     text,
  p_breed    text DEFAULT NULL,
  p_size     text DEFAULT NULL,
  p_human_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id       uuid,
  name     text,
  breed    text,
  size     text,
  human_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_my_id  uuid;
  v_dog    public.dogs%rowtype;
  v_name   text := nullif(trim(coalesce(p_name, '')), '');
  v_breed  text := nullif(trim(coalesce(p_breed, '')), '');
  v_size   text := nullif(trim(lower(coalesce(p_size, ''))), '');
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

  -- Ownership gate: the target human must be the caller (or a human the
  -- caller owns is out of scope — customers only add to their OWN row).
  IF p_human_id IS NULL OR p_human_id <> v_my_id THEN
    RAISE EXCEPTION 'not_your_human' USING errcode = '42501';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'name_required' USING errcode = '22023';
  END IF;

  IF v_size IS NOT NULL AND v_size NOT IN ('small', 'medium', 'large') THEN
    RAISE EXCEPTION 'invalid_size' USING errcode = '22023';
  END IF;

  INSERT INTO public.dogs (name, breed, size, human_id)
    VALUES (v_name, v_breed, v_size, v_my_id)
  RETURNING * INTO v_dog;

  RETURN QUERY
    SELECT v_dog.id, v_dog.name, v_dog.breed, v_dog.size, v_dog.human_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_dog(text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_dog(text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_customer_dog(text, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_dog(text, text, text, uuid) TO authenticated;
