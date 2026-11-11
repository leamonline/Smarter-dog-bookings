import { useCallback, useEffect, useState, useRef } from "react";
import { supabase } from "../client";
import { fetchConfirmationContact, fetchConfirmationSnapshot } from "../repositories/bookingConfirmationRepo";
import type { ConfirmationContact, ConfirmationSnapshot } from "../repositories/bookingConfirmationRepo";
import { confirmationOutcome } from "../../engine/bookingConfirmation";
import { useStaffMessaging } from "./useStaffMessaging";

export function useConfirmationContact(humanId: string | null, sampleContact: ConfirmationContact | null) {
  const [result, setResult] = useState<{ id: string | null; contact: ConfirmationContact | null; error: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!supabase || !humanId) return;
    let active = true;
    setResult(null);
    fetchConfirmationContact(supabase, humanId).then((contact) => {
      if (active) setResult({ id: humanId, contact, error: !contact });
    }).catch(() => {
      if (active) setResult({ id: humanId, contact: null, error: true });
    });
    return () => { active = false; };
  }, [humanId, revision]);
  return {
    contact: supabase ? result?.id === humanId ? result.contact : null : sampleContact,
    loading: Boolean(supabase && humanId && result?.id !== humanId),
    error: Boolean(supabase && result?.id === humanId && result?.error),
    refresh: () => setRevision((n) => n + 1),
  };
}

export function useBookingConfirmation(bookingIds: string[], humanIds: string[], enabled: boolean) {
  const messaging = useStaffMessaging();
  const [snapshot, setSnapshot] = useState<ConfirmationSnapshot>({ logs: [], deliveries: [] });
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false);
  const generation = useRef(0);
  const idsKey = bookingIds.join(",");
  const humansKey = humanIds.join(",");
  const refresh = useCallback(async () => {
    if (!supabase || !enabled || !idsKey) return null;
    const current = generation.current;
    try {
      const next = await fetchConfirmationSnapshot(supabase, idsKey.split(","));
      if (generation.current === current) { setSnapshot(next); setError(""); }
      return next;
    } catch {
      if (generation.current === current) setError("Couldn't check confirmation delivery. The booking is still saved.");
      return null;
    }
  }, [enabled, idsKey]);
  useEffect(() => {
    generation.current += 1;
    setSnapshot({ logs: [], deliveries: [] });
    setError("");
    if (!supabase || !enabled || !idsKey) return;
    void refresh();
    // Bounded, receipt-scoped polling also observes provider callbacks; no
    // broad realtime subscriptions or customer history reads are required.
    const interval = setInterval(() => { void refresh(); }, 5000);
    return () => { generation.current += 1; clearInterval(interval); };
  }, [refresh, enabled, idsKey]);

  const outcome = confirmationOutcome(snapshot, bookingIds, humanIds);
  const retry = async () => {
    if (retryingRef.current || !supabase || !enabled) return;
    retryingRef.current = true;
    setRetrying(true);
    try {
      // Reconcile immediately before recovery. Never act on a stale failure,
      // accepted send, missing log or uncertain provider outcome.
      const fresh = await refresh();
      if (!fresh) return;
      const current = confirmationOutcome(fresh, idsKey.split(","), humansKey ? humansKey.split(",") : []);
      if (!current.retryBookingIds.length) return;
      for (const id of current.retryBookingIds) {
        const result = await messaging.resendBookingNotification(id, "confirmed");
        const data = result.data as { ok?: boolean } | null;
        if (result.error || data?.ok !== true) throw new Error("retry not confirmed");
      }
      await refresh();
    } catch {
      setError("Couldn't confirm the retry. Check the message status before sending again.");
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
  };
  return { ...outcome, error, retrying, retry, refresh, sample: !supabase };
}
