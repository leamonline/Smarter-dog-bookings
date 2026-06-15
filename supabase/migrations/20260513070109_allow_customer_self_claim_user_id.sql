-- ============================================================
-- BACKFILL — already applied on prod, was missing from source control.
--
-- Surfaced by the reverse-drift reconciliation on 2026-06-15: prod's
-- supabase_migrations.schema_migrations has version 20260513070109
-- (allow_customer_self_claim_user_id) with no matching local file. SQL below
-- is copied verbatim from prod's recorded statements so source matches the
-- live definition. CREATE OR REPLACE is idempotent; NOT meant to be
-- re-applied (it already is).
--
-- SECURITY NOTE: this LOOSENS prevent_customer_critical_column_update vs the
-- stricter 20260414163119_restrict_customer_self_update.sql — it permits the
-- customer self-claim transition (customer_user_id NULL -> auth.uid()) on
-- first login. The newer 20260609140000_join_the_pack_signup.sql flow uses a
-- pure INSERT and may no longer need this loosening; whether prod should be
-- tightened back is flagged for a separate security review. This file only
-- records the CURRENT live behaviour to eliminate the drift.
-- ============================================================

-- PROBLEM: prevent_customer_critical_column_update() blocks ANY change
-- to humans.customer_user_id by non-staff. This was meant to stop
-- customers from rewriting that column via the customer_update_own_human
-- RLS policy (account takeover). But it also blocks the legitimate
-- self-claim path inside link_customer_to_human() -- a SECURITY DEFINER
-- RPC whose entire purpose is to set customer_user_id = auth.uid() on
-- first login. The trigger runs with auth.uid() = the calling customer
-- (auth context survives SECURITY DEFINER), so is_staff() returns false
-- and the RAISE EXCEPTION fires. Net result: customer portal login has
-- been silently failing for every user with the message "We don't have
-- your number on file yet".
--
-- FIX: Allow exactly one transition for non-staff: OLD IS NULL AND
-- NEW = auth.uid(). This permits the self-claim while still blocking:
--   - reassigning someone else's claim (OLD IS NOT NULL)
--   - claiming a row for a different user (NEW <> auth.uid())
--   - unclaiming an owned row (NEW IS NULL <> auth.uid())

CREATE OR REPLACE FUNCTION public.prevent_customer_critical_column_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If caller is NOT staff, restrict changes to critical columns.
  IF NOT is_staff() THEN
    IF NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id THEN
      -- Allow exactly the legitimate self-claim: unclaimed → self.
      IF NOT (
        OLD.customer_user_id IS NULL
        AND NEW.customer_user_id = (SELECT auth.uid())
      ) THEN
        RAISE EXCEPTION 'Customers cannot modify customer_user_id';
      END IF;
    END IF;

    IF NEW.history_flag IS DISTINCT FROM OLD.history_flag THEN
      RAISE EXCEPTION 'Customers cannot modify history_flag';
    END IF;

    -- Allow customer phone changes ONLY if they match the expected
    -- normalisation rule (keep the existing behaviour in prod).
    IF NEW.phone IS DISTINCT FROM OLD.phone THEN
      IF NEW.phone
         <> ('+44' || substring(regexp_replace(OLD.phone, '\D', '', 'g') FROM 2))
      THEN
        RAISE EXCEPTION 'Customers can only modify phone number via normalization';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
