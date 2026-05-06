-- 019_restrict_customer_self_update.sql
-- CRITICAL-3: Prevent customers from modifying critical columns
-- The customer_update_own_human policy allows customers to update ANY column,
-- including customer_user_id (account takeover) and phone (identity theft).

-- Create a trigger that blocks customers from modifying sensitive columns
CREATE OR REPLACE FUNCTION prevent_customer_critical_column_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If caller is NOT staff, block changes to critical columns
  IF NOT is_staff() THEN
    IF NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id THEN
      RAISE EXCEPTION 'Customers cannot modify customer_user_id';
    END IF;
    IF NEW.history_flag IS DISTINCT FROM OLD.history_flag THEN
      RAISE EXCEPTION 'Customers cannot modify history_flag';
    END IF;
    IF NEW.phone IS DISTINCT FROM OLD.phone THEN
      RAISE EXCEPTION 'Customers cannot modify phone number';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_customer_critical_update ON humans;

CREATE TRIGGER trg_prevent_customer_critical_update
  BEFORE UPDATE ON humans
  FOR EACH ROW
  EXECUTE FUNCTION prevent_customer_critical_column_update();
