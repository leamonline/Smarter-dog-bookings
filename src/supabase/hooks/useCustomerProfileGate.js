import { useState, useEffect, useCallback } from "react";
import { customerSupabase as supabase } from "../customerClient.js";

/**
 * Decides whether a logged-in customer has a complete-enough profile to use
 * the portal: a first name, a surname, an address, and a recorded agreement
 * to Smarter Dog's policies.
 *
 * Reads the customer's OWN humans row (RLS policy customer_select_own_human
 * allows this) rather than trusting the login RPC's snapshot, so the gate is
 * driven by the live source of truth. The matching server-side check lives in
 * create_customer_booking_group(), so booking can't be done with an
 * incomplete profile even via a direct API call.
 *
 * Returns { complete, loading, refresh }. `refresh()` re-reads the row so the
 * gate clears the instant the onboarding screen saves.
 *
 * Fails OPEN on a read error (treats the profile as complete and logs): a
 * transient read failure shouldn't trap a customer behind a gate they can't
 * get past — and the booking RPC still enforces the requirement server-side.
 */
export function useCustomerProfileGate(humanRecord) {
  const humanId = humanRecord?.id || null;
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  // The humanId we last have a result for. While this lags the current
  // humanId, we're between records — report loading so the caller never
  // flashes the dashboard for the frame before the read effect fires.
  const [loadedId, setLoadedId] = useState(null);

  const read = useCallback(async () => {
    if (!supabase || !humanId) {
      // No linked record to gate — the caller's own !humanRecord branch
      // handles that case; don't block here.
      setComplete(true);
      setLoading(false);
      setLoadedId(humanId);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("humans")
        .select("name, surname, address, policies_accepted_at")
        .eq("id", humanId)
        .single();
      if (error) throw error;
      const isComplete = Boolean(
        data?.name?.trim() &&
          data?.surname?.trim() &&
          data?.address?.trim() &&
          data?.policies_accepted_at,
      );
      setComplete(isComplete);
    } catch (err) {
      console.error("useCustomerProfileGate: profile read failed:", err);
      setComplete(true); // fail open — server RPC still gates booking
    } finally {
      setLoading(false);
      setLoadedId(humanId);
    }
  }, [humanId]);

  useEffect(() => {
    read();
  }, [read]);

  // Treat "haven't read the current record yet" as loading.
  const effectiveLoading = loading || humanId !== loadedId;

  return { complete, loading: effectiveLoading, refresh: read };
}
