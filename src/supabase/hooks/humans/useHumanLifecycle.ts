// useHumanLifecycle — the staff-gated, RPC-backed record lifecycle actions:
// merging duplicate humans and approving / rejecting "Join the Pack"
// self-signups. Extracted from useHumans (Debt #5). All three share the
// { ok: true } | { ok: false, error } result contract, guard for offline,
// and optimistically update the shared caches while realtime reconciles
// the canonical rows.
import { useCallback } from "react";
import { supabase } from "../../client.js";
import {
  approveCustomerSignup,
  rejectCustomerSignup,
  mergeHumans as mergeHumansRpc,
} from "../../rpc";
import { logger } from "../../../lib/logger";
import type { SetHumansMap } from "./helpers";
import type { Dispatch, SetStateAction } from "react";

export function useHumanLifecycle({
  setHumans,
  setHumansById,
  setTotalCount,
  setDirectoryHumans,
}: {
  setHumans: SetHumansMap;
  setHumansById: SetHumansMap;
  setTotalCount: Dispatch<SetStateAction<number>>;
  setDirectoryHumans: Dispatch<SetStateAction<any[]>>;
}) {
  /**
   * Merge the "loser" human into the "winner" via the merge_humans RPC,
   * which reassigns dogs / booking pickups / trusted contacts / waitlist /
   * conversations to the winner, backfills the winner's blank fields, and
   * deletes the loser — atomically server-side. We optimistically drop the
   * loser from the local maps; the winner's reassigned dogs and backfilled
   * fields arrive via the realtime subscriptions.
   */
  const mergeHumans = useCallback(
    async (
      winnerId: string,
      loserId: string,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!winnerId || !loserId) return { ok: false, error: "Missing human id" };
      if (winnerId === loserId)
        return { ok: false, error: "Cannot merge a record into itself" };
      if (!supabase)
        return { ok: false, error: "Merge needs a connection — you're offline." };

      const { error: err } = await mergeHumansRpc(supabase, {
        winnerId,
        loserId,
      });
      if (err) {
        return { ok: false, error: err.message || "Failed to merge records" };
      }

      // Drop the loser from the local maps so it vanishes from the directory
      // immediately; realtime refreshes the winner + reassigned dogs.
      setHumansById((prev) => {
        const next = { ...prev };
        delete next[loserId];
        return next;
      });
      setHumans((prev) => {
        const next = { ...prev };
        const entry = Object.entries(next).find(
          ([, h]: [string, any]) => h.id === loserId,
        );
        if (entry) delete next[entry[0]];
        return next;
      });
      setTotalCount((c) => Math.max(0, c - 1));
      return { ok: true };
    },
    [setHumans, setHumansById, setTotalCount],
  );

  /**
   * Approve a pending "Join the Pack" self-signup via the staff-gated
   * approve_customer_signup RPC (sets approved_at/approved_by + resolves the
   * signup_review to-do). On success we optimistically clear the pending
   * signal locally (approvedAt set) so the header badge / buttons disappear
   * straight away; the realtime UPDATE reconciles the canonical row. Returns
   * the same { ok } / { ok, error } shape as deleteHuman / mergeHumans.
   */
  const approveSignup = useCallback(
    async (humanId: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!humanId) return { ok: false, error: "Missing human id" };
      if (!supabase)
        return { ok: false, error: "Approving needs a connection — you're offline." };

      const { error: err } = await approveCustomerSignup(supabase, { humanId });
      if (err) {
        return { ok: false, error: err.message || "Failed to approve signup" };
      }

      // Send the "Welcome to the Pack" message. Best-effort: the approval has
      // already committed, so a messaging hiccup must not surface as a failure
      // (the welcome is also idempotent server-side and can be re-sent).
      try {
        const { error: fnErr } = await supabase.functions.invoke(
          "notify-customer-welcome",
          { body: { human_id: humanId } },
        );
        if (fnErr)
          logger.warn("notify-customer-welcome failed", {
            tags: { hook: "useHumans", op: "approveSignup.welcome" },
            extra: { error: fnErr },
          });
      } catch (err) {
        logger.warn("notify-customer-welcome threw", {
          tags: { hook: "useHumans", op: "approveSignup.welcome" },
          extra: { error: err },
        });
      }

      const approvedAt = new Date().toISOString();
      setHumansById((prev) => {
        const existing = prev[humanId];
        if (!existing) return prev;
        return { ...prev, [humanId]: { ...existing, approvedAt, approved_at: approvedAt } };
      });
      setHumans((prev) => {
        const next = { ...prev };
        const entry = Object.entries(next).find(
          ([, h]: [string, any]) => h.id === humanId,
        );
        if (entry) next[entry[0]] = { ...(entry[1] as any), approvedAt };
        return next;
      });
      return { ok: true };
    },
    [setHumans, setHumansById],
  );

  /**
   * Reject a pending self-signup via the staff-gated reject_customer_signup
   * RPC (archives the human with a reason + resolves the to-do). On success we
   * optimistically drop the row from the local maps — same as a delete — so it
   * leaves the directory immediately; realtime reconciles the rest.
   */
  const rejectSignup = useCallback(
    async (
      humanId: string,
      reason?: string | null,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!humanId) return { ok: false, error: "Missing human id" };
      if (!supabase)
        return { ok: false, error: "Rejecting needs a connection — you're offline." };

      const { error: err } = await rejectCustomerSignup(supabase, {
        humanId,
        reason: reason ?? null,
      });
      if (err) {
        return { ok: false, error: err.message || "Failed to reject signup" };
      }

      // Rejection archives the human; mirror the directory's archive behaviour
      // by dropping it from the active maps so it vanishes from the grid.
      setHumansById((prev) => {
        const next = { ...prev };
        delete next[humanId];
        return next;
      });
      setHumans((prev) => {
        const next = { ...prev };
        const entry = Object.entries(next).find(
          ([, h]: [string, any]) => h.id === humanId,
        );
        if (entry) delete next[entry[0]];
        return next;
      });
      setDirectoryHumans((prev) => prev.filter((h) => h.id !== humanId));
      setTotalCount((c) => Math.max(0, c - 1));
      return { ok: true };
    },
    [setHumans, setHumansById, setTotalCount, setDirectoryHumans],
  );

  return { mergeHumans, approveSignup, rejectSignup };
}
