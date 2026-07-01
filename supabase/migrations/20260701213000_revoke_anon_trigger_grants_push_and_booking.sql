-- Migration: revoke_anon_trigger_grants_push_and_booking
-- Date: 2026-07-01
--
-- AUDIT-2 from the 2026-07-01 read-only audit: the 2026-06-25 class fix
-- (20260625120000) enumerated the then-known offenders instead of installing
-- a durable convention, and the very next trigger-function migrations —
-- 20260625140000 (staff web push), 20260627150000 (booking creator),
-- 20260627160000 (booking completion) — shipped with no revoke block. So
-- Supabase's default EXECUTE grant stands again on six SECURITY DEFINER
-- trigger functions (live security-advisor WARNs, lint 0028):
--
--   notify_staff_booking_event(), notify_staff_inbound_message(),
--   notify_staff_signup_review(), notify_staff_waitlist_joined(),
--   on_booking_completed_change(), set_booking_creator()
--
-- Not practically exploitable — PostgREST refuses to call trigger-typed
-- functions ("trigger functions can only be called as triggers") — but it
-- is the exact hygiene class this project already decided to close.
--
-- set_booking_completed_at() (plain SECURITY INVOKER, so not advisor-
-- flagged) is included too: same migrations, same convention — no direct
-- caller should hold EXECUTE on any trigger function.
--
-- Trigger functions fire WITHOUT an EXECUTE privilege check, so these
-- revokes cannot break the triggers (same reasoning as 20260618143000 and
-- 20260625120000). service_role keeps its explicit default grant.
--
-- Idempotent: REVOKE is a no-op when the grant is already gone. Safe to
-- re-run.

revoke execute on function public.notify_staff_booking_event() from public, anon, authenticated;
revoke execute on function public.notify_staff_inbound_message() from public, anon, authenticated;
revoke execute on function public.notify_staff_signup_review() from public, anon, authenticated;
revoke execute on function public.notify_staff_waitlist_joined() from public, anon, authenticated;
revoke execute on function public.on_booking_completed_change() from public, anon, authenticated;
revoke execute on function public.set_booking_creator() from public, anon, authenticated;
revoke execute on function public.set_booking_completed_at() from public, anon, authenticated;
