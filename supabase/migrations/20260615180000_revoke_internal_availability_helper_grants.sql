-- ============================================================
-- Revoke EXECUTE on internal capacity/availability helpers from anon +
-- authenticated (Supabase advisor 0028/0029). These are NOT customer-facing:
-- get_seats_used / has_large_dog / large_dog_can_fit_on_day are called only
-- inside other SECURITY DEFINER functions (the capacity trigger,
-- get_slot_occupancy, create_customer_booking_group) which run as the
-- definer; get_small_medium_availability / get_large_dog_day_availability are
-- called only by the whatsapp-agent + whatsapp-flow-endpoint edge functions,
-- both using the service_role key. service_role keeps EXECUTE, so every real
-- caller is unaffected. Verified: zero frontend (.rpc) callers.
--
-- (get_slot_occupancy + get_open_days are NOT revoked — the staff/customer UI
-- calls those directly as authenticated, so they remain expected 0029 lints.)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.get_seats_used(date, text, uuid)              FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_large_dog(date, text, uuid)               FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.large_dog_can_fit_on_day(date)                FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_small_medium_availability(date, date)     FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_large_dog_day_availability(date, date)    FROM anon, authenticated, public;
