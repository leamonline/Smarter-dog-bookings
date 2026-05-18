-- ============================================================
-- Patches for Supabase advisor warnings (security category).
--
-- 1) Functions without an explicit search_path can be tricked by a
--    caller who creates a same-named object in a different schema
--    earlier on the search path. Pin search_path on the two functions
--    the advisor flagged: validate_booking_capacity (BEFORE INSERT
--    trigger on bookings) and stamp_opt_out_timestamps (BEFORE UPDATE
--    trigger on humans).
--
-- 2) app_settings and customer_phone_lookup_attempts both have RLS
--    enabled but no policies — meaning anon and authenticated already
--    can't see anything, but the advisor wants an explicit policy.
--    Add deny-all policies (no client role gets a USING match); the
--    service role bypasses RLS as it always has, so internal jobs and
--    edge functions are unaffected.
--
-- Not in scope: enabling "leaked password protection" — that's an
-- Auth dashboard toggle (Auth > Providers > Email > Password
-- Security), not a SQL migration. Flip it in the Supabase UI to
-- close the auth_leaked_password_protection warning.
-- ============================================================

ALTER FUNCTION public.validate_booking_capacity() SET search_path = public, pg_temp;
ALTER FUNCTION public.stamp_opt_out_timestamps() SET search_path = public, pg_temp;

-- app_settings: only service_role gets a match. No anon/authenticated
-- access at all. (Equivalent to the pre-policy behaviour but made
-- explicit so the advisor stops flagging it.)
DROP POLICY IF EXISTS "service_role only" ON public.app_settings;
CREATE POLICY "service_role only" ON public.app_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role only" ON public.customer_phone_lookup_attempts;
CREATE POLICY "service_role only" ON public.customer_phone_lookup_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
