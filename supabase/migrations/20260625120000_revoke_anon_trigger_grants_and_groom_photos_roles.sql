-- Migration: revoke_anon_trigger_grants_and_groom_photos_roles
-- Date: 2026-06-25
--
-- Hygiene hardening from the 2026-06-25 live grant/policy audit. Two LOW items,
-- neither exploitable today:
--
-- 1) Two SECURITY DEFINER *trigger* functions still carried the default PUBLIC
--    EXECUTE grant (so anon could reach them via /rest/v1/rpc/, flagged by
--    advisor lint 0028): enforce_dog_not_pregnant() (the pregnancy-gate trigger,
--    20260623130000, which skipped the revoke its sibling triggers got) and
--    sync_whatsapp_conversation_last_message(). They are trigger functions, so
--    revoking EXECUTE does NOT stop the triggers firing — triggers fire without
--    an EXECUTE privilege check, exactly like validate_booking_capacity in
--    20260618143000. Revoke from public/anon/authenticated; service_role keeps
--    its grant (it bypasses RLS / runs the agent + flow edge functions).
--
-- 2) The four groom_photos RLS policies were scoped to role `public` instead of
--    `authenticated`. They already gate on (SELECT is_staff()), so anon is
--    denied regardless (is_staff() is false without an auth.uid()); this just
--    re-scopes them to `authenticated` for defence-in-depth. ALTER POLICY keeps
--    the existing USING / WITH CHECK expressions intact, so staff access is
--    unchanged and no customer policy exists to affect.
--
-- Idempotent: REVOKE is a no-op when the grant is already gone; ALTER POLICY
-- ... TO authenticated is a no-op when already scoped that way. Safe to re-run.

revoke execute on function public.enforce_dog_not_pregnant() from public, anon, authenticated;
revoke execute on function public.sync_whatsapp_conversation_last_message() from public, anon, authenticated;

alter policy staff_select_groom_photos on public.groom_photos to authenticated;
alter policy staff_insert_groom_photos on public.groom_photos to authenticated;
alter policy staff_update_groom_photos on public.groom_photos to authenticated;
alter policy staff_delete_groom_photos on public.groom_photos to authenticated;
