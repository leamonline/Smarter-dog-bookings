-- 042_notification_log_idempotency.sql
--
-- Add partial unique indexes on notification_log so the database
-- physically refuses duplicate sends. This is the prerequisite for the
-- "insert pending → send → update" pattern in the notify-* edge functions.
--
-- WHY PARTIAL?  We only want the constraint to bite on rows that count
-- as "in flight" (pending) or "delivered" (sent). A failed row should be
-- retryable — the cron will see the booking again on its next sweep and
-- we want it to retry.
--
-- WHY THESE COLUMNS?  (booking_id, trigger_type). Each booking can have
-- one confirmed, one reminder, one cancelled, one ready, one
-- waitlist_joined. Different bookings are independent. A retry within
-- the same trigger_type should be blocked.
--
-- GROUP BOOKINGS: each booking row in a group has its own booking_id, so
-- the index naturally handles them — N rows for N bookings, no duplicates
-- per booking. The "winner" trigger (per the existing 2-second-wait dedup
-- pattern) ends up owning all N pending rows. Slot dedup remains in
-- application code; the index just enforces per-booking safety.

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_idempotent
  ON notification_log (booking_id, trigger_type)
  WHERE status IN ('pending', 'sent');

COMMENT ON INDEX idx_notification_log_idempotent IS
  'Partial unique index — at most one in-flight or delivered notification per booking per trigger_type. Failed rows are NOT in the WHERE so they can be retried (the cron sweeps on its next tick). Mig 042.';
