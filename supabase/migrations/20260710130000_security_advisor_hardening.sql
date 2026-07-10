-- ============================================================
-- Security-advisor hardening (review Phase 4) — additions only.
--
-- Grounded in a fresh security-advisor run + grant/caller audit against
-- prod on 2026-07-10. Two facts shaped what this migration does NOT do:
--
--   1. `anon` already has EXECUTE on NONE of the flagged SECURITY DEFINER
--      functions — the June/July grant audits (20260615221408,
--      20260701213000 et al.) closed that class. Nothing to revoke there.
--
--   2. Staff users authenticate as the `authenticated` role (Supabase has
--      no separate staff DB role), so the staff-only RPCs the review
--      suggested revoking — approve_customer_signup, reject_customer_signup,
--      merge_humans, create_staff_booking_from_conversation,
--      dismiss_delivery_failure, mark_whatsapp_conversation_read,
--      revoke_calendar_feed_token — are all called BY the staff dashboard
--      as `authenticated` (see src/supabase/rpc.ts). Revoking EXECUTE from
--      authenticated would break the staff app outright. Each was verified
--      on prod to carry its internal is_staff()/owner gate; that internal
--      check IS the authorisation layer, by design. They keep their grant.
--
-- What remains, and what this migration does:
--   a. whatsapp_manage_sessions: RLS on, deliberately service-role-only,
--      but with zero policies the intent is invisible and the linter
--      flags it. Add an explicit RESTRICTIVE deny for client roles.
--   b. get_my_role(): SECURITY DEFINER, callable by authenticated, and
--      provably dead — no caller in src/, no edge-function caller, not
--      referenced by any RLS policy or any other function body (checked
--      in prod catalogs). The one flagged function that can safely lose
--      its client grants.
-- ============================================================

-- ---- a. whatsapp_manage_sessions: make "service-role only" explicit ----
--
-- The WhatsApp Flow endpoint reads/writes this table with the service-role
-- key, which BYPASSES RLS entirely — this policy changes nothing for it.
-- RESTRICTIVE + using(false) means client roles stay locked out even if a
-- permissive policy is ever added by mistake. Clears rls_enabled_no_policy.

drop policy if exists whatsapp_manage_sessions_service_role_only
  on public.whatsapp_manage_sessions;
create policy whatsapp_manage_sessions_service_role_only
  on public.whatsapp_manage_sessions
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.whatsapp_manage_sessions is
  'WhatsApp Flow manage-booking sessions. Service-role only by design: the Flow endpoint edge function is the sole reader/writer. The restrictive false policy documents (and enforces) that no client role ever gets row access.';

-- ---- b. get_my_role(): revoke client EXECUTE (dead function) ----
--
-- Reason for revoke: no caller in src/ or supabase/functions/, not used in
-- any pg_policy expression, not referenced from any other function body
-- (all verified against prod 2026-07-10). SECURITY DEFINER + callable by
-- every signed-in user = pointless exposed surface. service_role keeps its
-- own grant and postgres owns it, so nothing operational changes; trivially
-- reversible with a GRANT if a caller ever appears.

revoke execute on function public.get_my_role() from public, anon, authenticated;
