-- 017a_fix_calendar_token_search_path.sql
-- BACKFILL — applied to production on 2026-04-13 as version 20260413140454
-- under the name "fix_calendar_token_search_path". Added retroactively so
-- the repo has a complete record. Re-running is safe (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION get_or_create_calendar_feed_token(p_feed_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
  v_human_id uuid;
  v_staff_user_id uuid;
BEGIN
  IF p_feed_type = 'staff' THEN
    IF NOT is_staff() THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
    v_staff_user_id := auth.uid();

    SELECT token INTO v_token
    FROM calendar_feed_tokens
    WHERE staff_user_id = v_staff_user_id
      AND feed_type = 'staff'
      AND is_active = true
    LIMIT 1;

    IF v_token IS NULL THEN
      v_token := encode(gen_random_bytes(32), 'hex');
      INSERT INTO calendar_feed_tokens (staff_user_id, token, feed_type)
      VALUES (v_staff_user_id, v_token, 'staff');
    END IF;

  ELSIF p_feed_type = 'customer' THEN
    SELECT id INTO v_human_id
    FROM humans
    WHERE customer_user_id = auth.uid()
    LIMIT 1;

    IF v_human_id IS NULL THEN
      RAISE EXCEPTION 'No linked human record';
    END IF;

    SELECT token INTO v_token
    FROM calendar_feed_tokens
    WHERE human_id = v_human_id
      AND feed_type = 'customer'
      AND is_active = true
    LIMIT 1;

    IF v_token IS NULL THEN
      v_token := encode(gen_random_bytes(32), 'hex');
      INSERT INTO calendar_feed_tokens (human_id, token, feed_type)
      VALUES (v_human_id, v_token, 'customer');
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid feed_type: %', p_feed_type;
  END IF;

  RETURN v_token;
END;
$$;
