-- Expand bookings.status to the full five-step lifecycle plus "Cancelled".
--
-- 20260506153101_fix_security_notifications_status.sql tightened the CHECK to
-- only ('Booked', 'Checked in', 'Ready for pick-up', 'Cancelled') as part of a
-- security pass that normalised away the older 'Not Arrived'/'No-show' values.
-- That left two intermediate states from the canonical progression unsupported
-- ("In bath" and "Completed"), even though the UI offers them via
-- BOOKING_STATUSES in src/constants/salon.ts. Setting either on the booking
-- detail modal raises bookings_status_check.
--
-- Booked → Checked in → In bath → Ready for pick-up → Completed
-- with Cancelled reachable from any prior state via the detail modal.

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (
    status IN (
      'Booked',
      'Checked in',
      'In bath',
      'Ready for pick-up',
      'Completed',
      'Cancelled'
    )
  )
  NOT VALID;

ALTER TABLE public.bookings
  VALIDATE CONSTRAINT bookings_status_check;
