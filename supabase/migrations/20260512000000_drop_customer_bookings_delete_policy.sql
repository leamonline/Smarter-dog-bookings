-- ============================================================
-- Drop the customer DELETE policy on bookings.
--
-- Background:
--   Migration 20260330095231 introduced "customer_cancel_own_bookings"
--   FOR DELETE, allowing customers to physically delete their own
--   bookings. Migration 20260407212201 dropped + re-created it.
--   Migration 20260413135853 then added a separate
--   "customer_cancel_own_bookings_update" FOR UPDATE that captures
--   cancel_reason and fires the notify-booking-cancelled trigger
--   (which only runs on UPDATE, not DELETE).
--
--   The intent from 20260413135853 onward is "customers cancel via
--   UPDATE-to-Cancelled, never DELETE", but the original DELETE
--   policy was never retired. A customer hitting the API directly
--   could `.delete().eq('id', X)` their own future bookings,
--   bypassing the cancel-reason capture and the salon-side WhatsApp
--   notification.
--
--   This migration drops the DELETE policy. The UPDATE path remains
--   the only customer-driven cancellation channel.
--
--   We also defensively REVOKE DELETE on bookings from `authenticated`
--   so even if a future policy were re-added, the role-level grant
--   would still block it.
-- ============================================================

DROP POLICY IF EXISTS "customer_cancel_own_bookings" ON public.bookings;

-- Belt-and-braces: revoke the table privilege so no future RLS policy
-- alone can re-enable customer DELETEs without also re-granting this.
-- Staff DELETE still works because they use service_role / staff RLS.
REVOKE DELETE ON TABLE public.bookings FROM authenticated;
