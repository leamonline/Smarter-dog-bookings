-- ============================================================
-- SECURITY containment — revoke EXECUTE on three SECURITY DEFINER functions
-- that were callable by roles they should never have been exposed to.
-- Found by the booking-integrity / RLS audit (2026-06-15). Applied to prod
-- via MCP at discovery time; this file records it so it doesn't re-drift.
--
-- Legitimate callers are unaffected: triggers run as the function owner
-- (definer), and the whatsapp-agent calls via service_role — neither uses
-- the anon/authenticated grants revoked here. REVOKE is idempotent and
-- reversible (re-GRANT) if an unexpected caller ever surfaces.
-- ============================================================

-- CRITICAL — account takeover. link_or_create_customer_human(phone,…) resolves
-- the target customer by a CALLER-SUPPLIED phone (never compared to the
-- caller's verified auth.users.phone) and binds any UNCLAIMED humans row to
-- the caller's auth.uid(). 812 of 819 customer records were unclaimed, so any
-- authenticated user could claim (take over) almost any customer by phone:
-- full PII + dogs + bookings. The app only ever calls the no-arg
-- link_customer_to_human() (derives the phone from auth.users), so this
-- variant has NO legitimate caller. It is prod-only drift.
-- TODO (permanent fix): DROP this function, or rewrite it to ignore the phone
-- argument and read auth.users.phone for the calling auth.uid().
do $revoke_prod_drift$
begin
  if to_regprocedure(
    'public.link_or_create_customer_human(text,text,text)'
  ) is not null then
    execute 'revoke execute on function public.link_or_create_customer_human(text,text,text) from authenticated, anon, public';
  end if;
end
$revoke_prod_drift$;

-- HIGH — anon/cross-customer PII leak. Returns a customer's full name + dog
-- name + breed by dog_id, bypassing RLS (SECURITY DEFINER). Internal helper
-- used only by the booking_events triggers (which run as definer), never a
-- customer-facing RPC.
REVOKE EXECUTE ON FUNCTION public.booking_event_party(public.bookings)
  FROM anon, authenticated, public;

-- HIGH — anon/cross-customer write. Flips reminder_confirmed_at on a
-- customer's bookings, bypassing RLS. Only legitimate caller is the
-- whatsapp-agent (service_role) when a customer taps the Confirm quick-reply.
REVOKE EXECUTE ON FUNCTION public.mark_reminder_confirmed(uuid)
  FROM anon, authenticated, public;
