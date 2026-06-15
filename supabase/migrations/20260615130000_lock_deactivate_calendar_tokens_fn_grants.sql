-- ============================================================
-- Lock down deactivate_calendar_tokens_on_customer_unlink() grants
--
-- 20260521130000_deactivate_calendar_tokens_on_unlink.sql created this
-- SECURITY DEFINER trigger function in the public (API-exposed) schema.
-- New public functions auto-grant EXECUTE to PUBLIC (so anon + authenticated
-- inherit it), which the Supabase linter flags as an anon/authenticated-
-- executable SECURITY DEFINER RPC (anon_security_definer_function_executable).
--
-- It is a trigger function: only ever invoked by the
-- humans_deactivate_tokens_on_unlink trigger, never as a PostgREST RPC.
-- Trigger firing does not depend on these EXECUTE grants, so revoking them
-- from the API roles closes the exposure with no behavioural change.
-- Revokes are idempotent (no-op if the grant is already absent).
-- ============================================================

revoke execute on function public.deactivate_calendar_tokens_on_customer_unlink()
  from public, anon, authenticated;
