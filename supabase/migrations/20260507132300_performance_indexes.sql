-- Migration: performance_indexes
-- Date: 2026-05-07
--
-- Adds two missing indexes that were never created alongside the columns/
-- constraints they support:
--
--   1. bookings(status)          — the reports view filters/groups on status
--                                  heavily; also speeds the status-update
--                                  notification triggers.
--
--   2. humans(customer_user_id)  — partial index (WHERE NOT NULL) for the
--                                  customer portal: link_customer_to_human()
--                                  and RLS policies both join on this column.
--                                  Partial keeps the index small because the
--                                  vast majority of humans rows are staff-owned
--                                  records with no linked customer account.
--
-- Both use IF NOT EXISTS so this is safe to re-run on any environment.

BEGIN;

-- ── 1. Booking status index ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS bookings_status_idx
  ON public.bookings (status);

COMMENT ON INDEX public.bookings_status_idx IS
  'Speeds report queries and status-update notification triggers that '
  'filter on bookings.status. Added 2026-05-07.';

-- ── 2. Customer user-id partial index ────────────────────────────────────
CREATE INDEX IF NOT EXISTS humans_customer_user_id_idx
  ON public.humans (customer_user_id)
  WHERE customer_user_id IS NOT NULL;

COMMENT ON INDEX public.humans_customer_user_id_idx IS
  'Partial index for customer portal lookups via customer_user_id. '
  'Partial (WHERE NOT NULL) keeps the index small since most humans rows '
  'are staff-managed with no linked customer account. Added 2026-05-07.';

COMMIT;
