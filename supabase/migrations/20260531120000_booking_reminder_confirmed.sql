-- ============================================================
-- Confirm-tick on bookings.
--
-- Adds reminder_confirmed_at to bookings: a single timestamptz that is
-- null until the customer taps the "Confirm" Quick Reply on their
-- WhatsApp reminder. Stamped by mark_reminder_confirmed() (below),
-- which the whatsapp-agent edge function calls when it sees an inbound
-- template-button reply with text="Confirm".
--
-- See docs/superpowers/specs/2026-05-31-confirm-tick-design.md.
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminder_confirmed_at timestamptz;

COMMENT ON COLUMN bookings.reminder_confirmed_at IS
  'Timestamp the customer tapped the Confirm Quick Reply on this booking''s WhatsApp reminder. Null until then. Never cleared (idempotent).';


-- mark_reminder_confirmed(p_human_id)
--   For the given customer (humans.id), stamp reminder_confirmed_at on
--   every active booking whose dog belongs to that customer AND has a
--   recent ('sent', within 36h) WhatsApp reminder log row. Idempotent:
--   bookings already stamped are skipped via the null guard. Returns
--   the affected booking ids so the caller can log how many fired.
--
--   SECURITY DEFINER so service-role callers (the edge function) hit
--   exactly the same code path the RLS-aware tests do. The function
--   does its own filtering on human_id; we are not exposing it to
--   anon/authenticated roles.
CREATE OR REPLACE FUNCTION mark_reminder_confirmed(p_human_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE bookings b
     SET reminder_confirmed_at = now()
    FROM dogs d
   WHERE b.dog_id = d.id
     AND d.human_id = p_human_id
     AND b.reminder_confirmed_at IS NULL
     AND b.status NOT IN ('Cancelled', 'Completed')
     AND EXISTS (
       SELECT 1
         FROM notification_log n
        WHERE n.booking_id    = b.id
          AND n.trigger_type  = 'reminder'
          AND n.channel       = 'whatsapp'
          AND n.status        = 'sent'
          AND n.sent_at       >= now() - INTERVAL '36 hours'
     )
  RETURNING b.id;
END;
$$;

REVOKE ALL ON FUNCTION mark_reminder_confirmed(uuid) FROM public;
GRANT EXECUTE ON FUNCTION mark_reminder_confirmed(uuid) TO service_role;
