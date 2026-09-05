import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../client";
import { getSignupReview, saveSignupDogSize, type SignupReview } from "../../repositories/signupApprovalRepo";
import type { DogSize } from "../../../constants/salon";

export type ApprovalResult = { ok: true; welcomeStatus?: "accepted" | "unconfirmed" | "failed" | "previously-requested" } | { ok: false; error: string };
export type ApproveSignup = (humanId: string) => Promise<ApprovalResult>;

export function useSignupReview(humanId: string, approve: ApproveSignup, enabled: boolean) {
  const [review, setReview] = useState<SignupReview | null>(null);
  const [sizes, setSizes] = useState<Record<string, DogSize | "">>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [outcome, setOutcome] = useState<ApprovalResult | null>(null);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const reload = useCallback(async () => {
    const id = ++generation.current;
    setLoading(true); setError(null);
    try {
      if (!enabled || !supabase) throw new Error("Reconnect to review this signup.");
      const value = await getSignupReview(supabase, humanId);
      if (id !== generation.current) return;
      setReview(value);
      setSizes(Object.fromEntries(value.activeDogs.map(dog => [dog.id, dog.size || ""])));
      setNeedsReload(false); setSaved(false);
    } catch (err) {
      if (id === generation.current) { setError(err instanceof Error ? err.message : "Couldn't load the review."); setNeedsReload(true); }
    } finally { if (id === generation.current) setLoading(false); }
  }, [humanId, enabled]);
  useEffect(() => { void reload(); return invalidate; }, [reload, invalidate]);
  const dirty = !!review?.activeDogs.some(dog => (sizes[dog.id] || "") !== (dog.size || ""));
  const missing = review?.activeDogs.filter(dog => !sizes[dog.id]) || [];
  const chooseSize = (dogId: string, size: DogSize) => { setSizes(prev => ({ ...prev, [dogId]: size })); setSaved(false); };
  const save = async (andApprove: boolean) => {
    if (lock.current || !review || needsReload || !enabled || (andApprove && missing.length)) return;
    lock.current = true; setBusy(true); setError(null); setSaved(false);
    try {
      if (!supabase) throw new Error("Reconnect before saving.");
      // Re-read before writing so approval in another session cannot be treated
      // as a new successful review. The RPC still owns the final size check.
      const current = await getSignupReview(supabase, humanId);
      const changed = current.activeDogs.length !== review.activeDogs.length || review.activeDogs.some(dog => {
        const now = current.activeDogs.find(item => item.id === dog.id);
        return !now || now.size !== dog.size || now.breed !== dog.breed;
      });
      if (changed) throw new Error("The dogs' details have changed. Reload the review before saving.");
      for (const dog of review.activeDogs) {
        const size = sizes[dog.id];
        if (size && size !== dog.size) await saveSignupDogSize(supabase, humanId, dog, size);
      }
      if (andApprove) {
        const result = await approve(humanId);
        if (!result.ok) throw new Error(result.error.includes("signup_dog_size_unconfirmed")
          ? "A dog still needs its size confirmed. Reload the review to check the latest details."
          : "Couldn't confirm approval. Reload the review before trying again.");
        setOutcome(result);
      } else {
        await reload();
        setSaved(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this review. Reload before trying again.");
      setNeedsReload(true);
    } finally { lock.current = false; setBusy(false); }
  };
  return { review, sizes, chooseSize, loading, busy, error, needsReload, outcome, saved, dirty, missing, reload, save };
}
