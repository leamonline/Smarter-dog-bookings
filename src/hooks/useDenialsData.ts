import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { computeDenialStats, type DenialRow, type DenialStats } from "../engine/denials";
import { logger } from "../lib/logger";

interface DenialsResult {
  loading: boolean;
  /** false offline / on error — the report shows an honest note instead of £0s. */
  available: boolean;
  stats: DenialStats;
}

/**
 * Capacity-prevented-demand data (report 2F). Self-fetching over booking_denials
 * (staff-read via RLS), windowed to the reports period. Offline / sample mode
 * has no denial log, so `available` is false and the card degrades gracefully.
 */
export function useDenialsData(days: number): DenialsResult {
  const [result, setResult] = useState<DenialsResult>(() => ({
    loading: true,
    available: false,
    stats: computeDenialStats([], days),
  }));

  useEffect(() => {
    if (!supabase) {
      setResult({ loading: false, available: false, stats: computeDenialStats([], days) });
      return;
    }

    const controller = new AbortController();
    (async () => {
      setResult((r) => ({ ...r, loading: true }));
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("booking_denials")
        .select("requested_date, slot, size, service, dog_count, reason_code, source, alternative_shown, alternative_taken, created_at")
        .gte("created_at", since.toISOString())
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      if (error) {
        logger.error("useDenialsData: failed to load booking denials", error);
        setResult({ loading: false, available: false, stats: computeDenialStats([], days) });
        return;
      }
      setResult({
        loading: false,
        available: true,
        stats: computeDenialStats((data || []) as DenialRow[], days),
      });
    })();

    return () => controller.abort();
  }, [days]);

  return result;
}
