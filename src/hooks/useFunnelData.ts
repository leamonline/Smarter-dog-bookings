import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { computeFunnelStats, type FunnelEventRow, type FunnelStats } from "../engine/funnel";
import { logger } from "../lib/logger";

interface FunnelResult {
  loading: boolean;
  /** false offline / on error — the report shows an honest note. */
  available: boolean;
  stats: FunnelStats;
}

/**
 * Booking-wizard funnel data (improvement #4). Self-fetching over
 * booking_funnel_events (staff-read via RLS), windowed to the reports period.
 * Offline / sample mode has no telemetry, so `available` is false.
 */
export function useFunnelData(days: number): FunnelResult {
  const [result, setResult] = useState<FunnelResult>(() => ({
    loading: true,
    available: false,
    stats: computeFunnelStats([], days),
  }));

  useEffect(() => {
    if (!supabase) {
      setResult({ loading: false, available: false, stats: computeFunnelStats([], days) });
      return;
    }

    const controller = new AbortController();
    (async () => {
      setResult((r) => ({ ...r, loading: true }));
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("booking_funnel_events")
        .select("session_id, step, created_at")
        .gte("created_at", since.toISOString())
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      if (error) {
        logger.error("useFunnelData: failed to load funnel events", error);
        setResult({ loading: false, available: false, stats: computeFunnelStats([], days) });
        return;
      }
      setResult({
        loading: false,
        available: true,
        stats: computeFunnelStats((data || []) as FunnelEventRow[], days),
      });
    })();

    return () => controller.abort();
  }, [days]);

  return result;
}
