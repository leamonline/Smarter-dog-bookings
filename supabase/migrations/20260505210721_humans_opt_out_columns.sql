-- 041_humans_opt_out_columns.sql
--
-- Per-channel opt-out flags on humans. Required for PECR compliance —
-- once a customer says "stop sending me SMS" we need a place to record
-- that and a guarantee the notify-* edge functions honour it.
--
-- DESIGN NOTES
--
-- - Boolean columns rather than a separate opt_outs table because:
--   (a) we only ever check them in the same row lookup that already
--       fetches name/phone/email, no extra join, and
--   (b) volume is tiny (~hundreds of customers). A normalised table is
--       a future problem if we ever add per-message-type opt-outs.
--
-- - Default false (opted IN). PECR allows opt-in by default for
--   transactional messages to existing customers (the legitimate-interest
--   carve-out). Marketing messages would need opt-in DEFAULT true, but
--   we're transactional-only.
--
-- - opted_out_at and opted_out_reason on each channel so we can show
--   support staff WHY a customer is blocked from SMS. Without these,
--   debugging "why didn't they get a text" requires a paper trail
--   somewhere outside the app.
--
-- - The matching enforcement code lives in the notify-* edge functions.
--   This migration only sets up the data; the functions check it.

ALTER TABLE humans
  ADD COLUMN IF NOT EXISTS sms_opted_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opted_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_opted_out_reason TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_opted_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opted_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_opted_out_reason TEXT,
  ADD COLUMN IF NOT EXISTS email_opted_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_opted_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_opted_out_reason TEXT;

COMMENT ON COLUMN humans.sms_opted_out IS
  'TRUE if the customer has asked us not to send SMS. Set automatically by the inbound STOP webhook (Phase 2) or manually by staff via a future opt-out admin view. Honoured by all notify-* edge functions.';

COMMENT ON COLUMN humans.whatsapp_opted_out IS
  'TRUE if the customer has asked us not to send WhatsApp. Twilio also enforces this at their layer for any number that has texted STOP — this column is our defence in depth.';

COMMENT ON COLUMN humans.email_opted_out IS
  'TRUE if the customer has asked us not to send email. Honoured by all notify-* edge functions.';

-- Helper trigger: whenever an opt-out flag flips TRUE, stamp the timestamp
-- if it's not already set. Saves the staff person updating it from having
-- to remember to set both columns. They only set one, the trigger fills
-- the other in.

CREATE OR REPLACE FUNCTION public.stamp_opt_out_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sms_opted_out AND NOT OLD.sms_opted_out AND NEW.sms_opted_out_at IS NULL THEN
    NEW.sms_opted_out_at := now();
  END IF;
  IF NEW.whatsapp_opted_out AND NOT OLD.whatsapp_opted_out AND NEW.whatsapp_opted_out_at IS NULL THEN
    NEW.whatsapp_opted_out_at := now();
  END IF;
  IF NEW.email_opted_out AND NOT OLD.email_opted_out AND NEW.email_opted_out_at IS NULL THEN
    NEW.email_opted_out_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS humans_stamp_opt_out_timestamps ON humans;
CREATE TRIGGER humans_stamp_opt_out_timestamps
  BEFORE UPDATE ON humans
  FOR EACH ROW
  WHEN (
    OLD.sms_opted_out IS DISTINCT FROM NEW.sms_opted_out
    OR OLD.whatsapp_opted_out IS DISTINCT FROM NEW.whatsapp_opted_out
    OR OLD.email_opted_out IS DISTINCT FROM NEW.email_opted_out
  )
  EXECUTE FUNCTION public.stamp_opt_out_timestamps();
