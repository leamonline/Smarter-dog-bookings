-- 012b_add_chain_id_to_bookings.sql
-- BACKFILL — applied to production on 2026-04-07 as version 20260407212201
-- under the name "add_chain_id_to_bookings". Added retroactively so the repo
-- has a complete record of schema history. Re-running is safe (IF NOT EXISTS).

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS chain_id UUID DEFAULT NULL;
COMMENT ON COLUMN bookings.chain_id IS 'Groups bookings created together via chain booking. Nullable, no FK.';
