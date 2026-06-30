-- 20260630120000_booking_confirmation_channel.sql
--
-- Lets staff choose, per booking, whether a confirmation message is sent and
-- over which channel. Until now every booking INSERT unconditionally fired the
-- notify-booking-confirmed edge function, which always picked the customer's
-- best available channel (pickChannel: WhatsApp -> SMS -> email). Staff had no
-- way to decline a confirmation or force a specific method.
--
-- This adds a single column the edge function reads off row_to_json(NEW) (which
-- the notify_on_booking_insert trigger already ships), so neither the trigger
-- nor the create_customer_booking_group RPC needs to change.
--
--   'auto'     -> today's behaviour: best available channel per recipient
--   'whatsapp' -> force WhatsApp (only if reachable + not opted out)
--   'sms'      -> force SMS       (only if reachable + not opted out)
--   'email'    -> force email     (only if reachable + not opted out)
--   'none'     -> suppress the confirmation entirely
--
-- DEFAULT 'auto' keeps every existing row and every other insert path (the
-- customer self-service RPC, the AI agent, any future route) on the current
-- behaviour. Idempotent: safe to re-run.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS confirmation_channel text NOT NULL DEFAULT 'auto';

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_confirmation_channel_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_confirmation_channel_check
  CHECK (confirmation_channel IN ('auto', 'whatsapp', 'sms', 'email', 'none'));
