-- 020a_add_deposit_amount_to_bookings.sql
-- BACKFILL — applied to production on 2026-04-14 as version 20260414134227
-- under the name "add_deposit_amount_to_bookings". Added retroactively so
-- the repo has a complete record. Re-running requires IF NOT EXISTS guard
-- (original statement did not include it, so re-run would error).

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT NULL;
