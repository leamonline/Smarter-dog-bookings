import { measurementWindow } from "../engine/measurementWindow";
import { readMeasurementPages } from "../lib/readMeasurementPages";
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
      setResult({ loading: true, available: false, stats: computeDenialStats([], days) });
      try {
        const now = new Date();
        const window = measurementWindow(days, now);
        const client = supabase!;
        const rows = await readMeasurementPages<DenialRow & { id: string }>(
          (from, to) => client
            .from("booking_denials")
            .select("id, requested_date, slot, size, service, dog_count, reason_code, source, alternative_shown, alternative_taken, created_at", { count: "exact" })
            .gte("created_at", window.start)
            .lte("created_at", window.end)
            .order("created_at")
            .order("id")
            .range(from, to)
            .abortSignal(controller.signal),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResult({ loading: false, available: true, stats: computeDenialStats(rows, days, now) });
      } catch (error) {
        if (controller.signal.aborted) return;
        logger.error("useDenialsData: measurement source unavailable", error);
        setResult({ loading: false, available: false, stats: computeDenialStats([], days) });
      }
    })();

    return () => controller.abort();
  }, [days]);

  return result;
}
