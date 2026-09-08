import { measurementWindow } from "../engine/measurementWindow";
import { readMeasurementPages } from "../lib/readMeasurementPages";
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
      setResult({ loading: true, available: false, stats: computeFunnelStats([], days) });
      try {
        const now = new Date();
        const window = measurementWindow(days, now);
        const client = supabase!;
        const rows = await readMeasurementPages<FunnelEventRow & { id: string }>(
          (from, to) => client
            .from("booking_funnel_events")
            .select("id, session_id, step, created_at", { count: "exact" })
            .gte("created_at", window.start)
            .lte("created_at", window.end)
            .order("created_at")
            .order("id")
            .range(from, to)
            .abortSignal(controller.signal),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResult({ loading: false, available: true, stats: computeFunnelStats(rows, days, now) });
      } catch (error) {
        if (controller.signal.aborted) return;
        logger.error("useFunnelData: measurement source unavailable", error);
        setResult({ loading: false, available: false, stats: computeFunnelStats([], days) });
      }
    })();

    return () => controller.abort();
  }, [days]);

  return result;
}
