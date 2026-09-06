import { useState, useEffect, useCallback } from "react";
import { customerSupabase as supabase } from "../customerClient";
import { logger } from "../../lib/logger";

interface GateHumanRecord {
  id?: string | null;
}

export type CustomerSignupStatus = "approved" | "onboarding" | "pending";

export interface CustomerSignupGateResult {
  status: CustomerSignupStatus;
  /**
   * "pending" only: the signup collided with an existing customer's name and
   * is waiting for staff to LINK it rather than approve a new record. Drives
   * the hold screen's copy; the status itself is the same.
   */
  claimsExisting: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

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
 * A third column, claims_human_id, is set when the submitted name matched a
 * customer already on the books; it does not change the status, only what
 * the "pending" screen says.
 *
 * Fails OPEN ("approved") on a read error so a transient glitch can't trap a
 * customer — the booking RPC still enforces approval server-side.
 */
export function useCustomerSignupGate(
  humanRecord: GateHumanRecord | null | undefined,
): CustomerSignupGateResult {
  const humanId = humanRecord?.id || null;
  const [status, setStatus] = useState<CustomerSignupStatus>("approved");
  const [claimsExisting, setClaimsExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const read = useCallback(async () => {
    if (!supabase || !humanId) {
      setStatus("approved");
      setClaimsExisting(false);
      setLoading(false);
      setLoadedId(humanId);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("humans")
        .select("approved_at, signup_submitted_at, claims_human_id")
        .eq("id", humanId)
        .single();
      if (error) throw error;
      if (data?.approved_at) {
        setStatus("approved");
        setClaimsExisting(false);
      } else if (data?.signup_submitted_at) {
        setStatus("pending");
        setClaimsExisting(Boolean(data.claims_human_id));
      } else {
        setStatus("onboarding");
        setClaimsExisting(false);
      }
    } catch (err) {
      logger.error("useCustomerSignupGate: read failed", err, {
        tags: { hook: "useCustomerSignupGate", op: "read" },
      });
      setStatus("approved"); // fail open — server RPC still gates booking
      setClaimsExisting(false);
    } finally {
      setLoading(false);
      setLoadedId(humanId);
    }
  }, [humanId]);

  useEffect(() => {
    read();
  }, [read]);

  const effectiveLoading = loading || humanId !== loadedId;
  return { status, claimsExisting, loading: effectiveLoading, refresh: read };
}
