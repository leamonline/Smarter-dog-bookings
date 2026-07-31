-- ============================================================
-- Close the trigger-function grant class for good
--
-- Postgres grants EXECUTE on every new function to PUBLIC, so a trigger
-- function that ships without an explicit revoke block is reachable by anon
-- and authenticated through /rest/v1/rpc/. docs/migrations.md has required an
-- explicit revoke block on every new function since the class was first fixed
-- in 20260625064550, but the booking-policy visit batch (20260726144000 ..
-- 20260726144013) shipped without one, and several older trigger functions
-- were only ever hardened directly against production — so a database rebuilt
-- from committed migrations alone came out LESS locked down than production.
--
-- This migration makes the committed history the whole truth: every trigger
-- function in `public` that still carries the default PUBLIC grant is revoked
-- from public, anon and authenticated.
--
-- Behaviour is unchanged. Triggers fire without an EXECUTE privilege check, so
-- revoking EXECUTE cannot stop a trigger — exactly as recorded for
-- validate_booking_capacity (20260618143000) and enforce_dog_not_pregnant
-- (20260625064550). Nothing needs to call a trigger function directly, so the
-- convention's "grant back only the roles that must call it" adds nothing here.
--
-- Deliberate grants are untouched. booking_policy_runtime() and
-- booking_policy_runtime_status() are NOT trigger functions: they are
-- customer-safe reads that 20260726144001 revokes and then intentionally
-- re-grants to anon, and they keep that grant.
--
-- Idempotent: REVOKE on an already-revoked privilege is a no-op, so this is
-- safe to re-run and is already a no-op for the functions production hardened
-- out of band.
-- ============================================================

-- ── booking-policy visit batch (20260726144000 .. 20260726144013) ────
revoke execute on function public.check_booking_change_request() from public, anon, authenticated;
revoke execute on function public.check_booking_contact_event() from public, anon, authenticated;
revoke execute on function public.check_booking_deposit_transfer() from public, anon, authenticated;
revoke execute on function public.check_booking_visit_axes() from public, anon, authenticated;
revoke execute on function public.check_booking_visit_consistency() from public, anon, authenticated;
revoke execute on function public.check_booking_visit_deposit_evidence() from public, anon, authenticated;
revoke execute on function public.check_booking_visit_lineage_edges() from public, anon, authenticated;
revoke execute on function public.check_customer_credit_reservation() from public, anon, authenticated;
revoke execute on function public.ensure_legacy_booking_visit() from public, anon, authenticated;
revoke execute on function public.guard_backfill_reconciliation_audit() from public, anon, authenticated;
revoke execute on function public.guard_booking_change_request_destination() from public, anon, authenticated;
revoke execute on function public.guard_booking_policy_ledger_rows() from public, anon, authenticated;
revoke execute on function public.guard_booking_policy_versions() from public, anon, authenticated;
revoke execute on function public.guard_booking_visit_linkage() from public, anon, authenticated;
revoke execute on function public.guard_booking_visit_terms_acknowledgement() from public, anon, authenticated;
revoke execute on function public.guard_booking_visit_terms_snapshot() from public, anon, authenticated;
revoke execute on function public.guard_immutable_booking_row() from public, anon, authenticated;
revoke execute on function public.reassign_legacy_booking_visit() from public, anon, authenticated;
revoke execute on function public.sync_legacy_booking_visit() from public, anon, authenticated;
revoke execute on function public.sync_visit_completion_from_child() from public, anon, authenticated;
revoke execute on function public.sync_visit_completion_on_confirmation() from public, anon, authenticated;

-- ── older trigger functions hardened only against production until now ──
revoke execute on function public.bump_conversation_unread() from public, anon, authenticated;
revoke execute on function public.fire_whatsapp_agent() from public, anon, authenticated;
revoke execute on function public.notify_on_booking_cancelled() from public, anon, authenticated;
revoke execute on function public.notify_on_booking_insert() from public, anon, authenticated;
revoke execute on function public.notify_on_booking_ready() from public, anon, authenticated;
revoke execute on function public.notify_waitlist_joined_trigger() from public, anon, authenticated;
revoke execute on function public.prevent_customer_critical_column_update() from public, anon, authenticated;
revoke execute on function public.stamp_opt_out_timestamps() from public, anon, authenticated;
revoke execute on function public.sync_whatsapp_conversation_last_outbound() from public, anon, authenticated;
revoke execute on function public.update_modified_column() from public, anon, authenticated;
