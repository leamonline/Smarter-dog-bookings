// Read-only data feed for the Needs Attention view: non-cancelled bookings
// from the last NEEDS_ATTENTION_LOOKBACK_DAYS previous days, classified by
// the pure engine (src/engine/needsAttention). Fetch-only — no realtime
// subscription and no writes, so opening the view can have no side effects;
// a manual refresh re-runs the same query. Deliberately independent of the
// calendar's week-scoped useBookings (same reasoning as useInboxDiaryData):
// this backlog spans many weeks, and reshaping the app-wide hook to an
// arbitrary range would risk the main calendar to serve one page.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { dbBookingsToArray } from "../supabase/transforms";
import { BOOKING_STATUS } from "../constants/salon";
import { londonDateStr } from "../engine/londonTime";
import {
  buildNeedsAttention,
  NEEDS_ATTENTION_LOOKBACK_DAYS,
  type NeedsAttentionSummary,
} from "../engine/needsAttention";
import { addDaysStr } from "./useUnpaidFortnight";
import { logger } from "../lib/logger";

export interface NeedsAttentionState {
  loading: boolean;
  /** false when offline/demo mode or the fetch failed — the view says so. */
  available: boolean;
  summary: NeedsAttentionSummary;
  /** The London "today" the sweep was anchored to (previous days only). */
  todayStr: string;
  refresh: () => void;
}

const EMPTY_SUMMARY: NeedsAttentionSummary = buildNeedsAttention([], "");

export function useNeedsAttention(): NeedsAttentionState {
  const [state, setState] = useState<{
    loading: boolean;
    available: boolean;
    summary: NeedsAttentionSummary;
    todayStr: string;
  }>({
    loading: true,
    available: false,
    summary: EMPTY_SUMMARY,
    todayStr: "",
  });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Anchor "previous days" to the salon's clock (Europe/London), computed
    // per fetch so a refresh after midnight rolls the window forward.
    const todayStr = londonDateStr(new Date());
    const client = supabase;
    if (!client) {
      setState({ loading: false, available: false, summary: EMPTY_SUMMARY, todayStr });
      return;
    }
    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, todayStr }));

    async function fetchBacklog(db: NonNullable<typeof supabase>) {
      const { data, error } = await db
        .from("bookings")
        .select("*")
        .gte("booking_date", addDaysStr(todayStr, -NEEDS_ATTENTION_LOOKBACK_DAYS))
        .lt("booking_date", todayStr)
        .neq("status", BOOKING_STATUS.CANCELLED)
        .order("booking_date", { ascending: false })
        .order("slot", { ascending: true })
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      if (error) {
        logger.error("useNeedsAttention: failed to fetch backlog", error, {
          tags: { hook: "useNeedsAttention", op: "fetchBacklog" },
        });
        setState({ loading: false, available: false, summary: EMPTY_SUMMARY, todayStr });
        return;
      }

      // Empty dogs/humans maps: rows carry their own *_snapshot name columns
      // (same map-free transform the inbox diary uses); the view re-resolves
      // live names through resolveBookingDisplay with the app's maps.
      const bookings = dbBookingsToArray(
        (data ?? []) as Parameters<typeof dbBookingsToArray>[0],
        {},
        {},
      );
      setState({
        loading: false,
        available: true,
        summary: buildNeedsAttention(bookings, todayStr),
        todayStr,
      });
    }

    fetchBacklog(client);
    return () => controller.abort();
  }, [refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { ...state, refresh };
}
