-- ============================================================
-- Revoke EXECUTE on internal trigger/cron functions from anon + authenticated.
-- Flagged by Supabase advisor lints 0028/0029. These are NOT customer-facing
-- RPCs — 7 return `trigger` (fire only inside their AFTER/BEFORE triggers) and
-- suggest_conversation_closures is invoked by the daily pg_cron job. All run as
-- the definer/owner, so the anon/authenticated EXECUTE grants are pure
-- footgun + lint noise. Verified: zero .rpc() callers in the app.
-- (The remaining 0029 lints are the app's legitimate customer/staff RPCs,
-- which must stay callable and do their own internal authorization.)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.emit_booking_created_event()              FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.emit_booking_update_event()               FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_booking_capacity_event()              FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.reopen_on_new_inbound()                   FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_booking_snapshots()                   FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.supersede_drafts_on_conversation_close()  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.supersede_drafts_on_new_inbound()         FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.suggest_conversation_closures()           FROM anon, authenticated, public;
