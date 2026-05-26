-- 20260526120000_drop_booking_ready_trigger.sql
--
-- Disables the automatic "Ready for pick-up" notification.
--
-- Migration 20260505202745 wired an AFTER UPDATE trigger
-- (notify_booking_ready_trigger → notify-booking-ready) that messaged
-- the owner the instant a booking flipped to 'Ready for pick-up'.
--
-- Collection notices are now staff-driven: marking a booking Ready opens
-- an in-app prompt (CollectionNoticeModal) where staff choose to send a
-- WhatsApp "ready for collection" template to the owner and/or any
-- trusted contact, with a staff-entered ETA. That replaces the
-- unconditional auto-send, so we drop the trigger here.
--
-- The notify_on_booking_ready() function and the notify-booking-ready
-- edge function are intentionally left in place (harmless once
-- untriggered) so this change is trivially reversible — re-create the
-- trigger to restore the old behaviour.

DROP TRIGGER IF EXISTS notify_booking_ready_trigger ON bookings;
