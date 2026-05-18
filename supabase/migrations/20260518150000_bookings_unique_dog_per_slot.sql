-- ============================================================
-- Prevent the same dog being booked twice into the same slot.
--
-- The engine (src/engine/capacity.ts) returns "This dog is already
-- booked in this slot" for this case, but only the client enforces
-- it. A raw API call that skips the engine could insert a duplicate.
-- This partial unique index closes the gap at the DB layer.
--
-- Cancelled bookings are excluded — staff need to be able to cancel
-- a booking and rebook the same dog in the same slot. The constraint
-- only applies to active bookings.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS bookings_no_duplicate_dog_per_slot
  ON public.bookings (booking_date, slot, dog_id)
  WHERE status <> 'Cancelled';

COMMENT ON INDEX public.bookings_no_duplicate_dog_per_slot IS
  'Mirrors the engine''s "dog already booked in this slot" rule at the DB level. Partial index excludes Cancelled so a cancelled booking can be replaced.';
