-- ============================================================
-- Lock get_open_days to authenticated only.
--
-- The original get_open_days migration (20260522120000) revoked
-- EXECUTE only from PUBLIC and granted it to authenticated. But
-- Supabase's default privileges auto-grant EXECUTE on every new
-- public function to anon + authenticated + service_role, and a
-- "revoke ... from public" does NOT remove those named-role grants.
-- So anon could still call get_open_days via
-- /rest/v1/rpc/get_open_days and read the salon's closure calendar
-- without signing in (flagged by the anon_security_definer_function_
-- executable advisor).
--
-- Low sensitivity (only (setting_date, is_open)), but there's no
-- reason for it to be anon-reachable — the booking wizard that uses
-- it is login-gated. Revoke anon explicitly (and re-assert the
-- authenticated grant) to match the locked-down customer RPCs
-- (update_customer_dog, add_customer_trusted_human, get_slot_occupancy).
-- ============================================================

revoke all on function public.get_open_days(date, date) from public;
revoke all on function public.get_open_days(date, date) from anon;
revoke all on function public.get_open_days(date, date) from authenticated;
grant execute on function public.get_open_days(date, date) to authenticated;
