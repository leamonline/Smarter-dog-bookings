import { useState, useEffect, useCallback } from "react";
import { customerSupabase as supabase } from "../customerClient.js";

/**
 * Decides where a linked customer sits in the "Join the Pack" self-signup
 * lifecycle, by reading their OWN humans row (RLS customer_select_own_human).
 *
 * The truth lives in two columns:
 *   • approved_at         — DEFAULT now() for every staff-created / existing
 *                           customer, so they read as "approved" and never
 *                           see any of this. Only the self-signup shell row
 *                           (create_pending_customer) has it NULL.
 *   • signup_submitted_at — set by submit_customer_signup when the customer
 *                           finishes the onboarding questions.
 *
 * status:
 *   "approved"   → not a pending self-signup (normal flow / dashboard)
 *   "onboarding" → pending shell, questions not yet submitted
 *   "pending"    → submitted, awaiting staff approval
 *
 * Fails OPEN ("approved") on a read error so a transient glitch can't trap a
 * customer — the booking RPC still enforces approval server-side.
 */
export function useCustomerSignupGate(humanRecord) {
  const humanId = humanRecord?.id || null;
  const [status, setStatus] = useState("approved");
  const [loading, setLoading] = useState(true);
  const [loadedId, setLoadedId] = useState(null);

  const read = useCallback(async () => {
    if (!supabase || !humanId) {
      setStatus("approved");
      setLoading(false);
      setLoadedId(humanId);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("humans")
        .select("approved_at, signup_submitted_at")
        .eq("id", humanId)
        .single();
      if (error) throw error;
      if (data?.approved_at) {
        setStatus("approved");
      } else if (data?.signup_submitted_at) {
        setStatus("pending");
      } else {
        setStatus("onboarding");
      }
    } catch (err) {
      console.error("useCustomerSignupGate: read failed:", err);
      setStatus("approved"); // fail open — server RPC still gates booking
    } finally {
      setLoading(false);
      setLoadedId(humanId);
    }
  }, [humanId]);

  useEffect(() => {
    read();
  }, [read]);

  const effectiveLoading = loading || humanId !== loadedId;
  return { status, loading: effectiveLoading, refresh: read };
}
