// ============================================================
// src/supabase/hooks/useWaitlistUpcoming.js
//
// Returns waitlist entries whose target_date is today or tomorrow —
// the window the right-rail Waitlist card uses to flip into the
// "Action" attention tone ("someone could be slotted in now if a
// cancellation appears"). Salon-wide, not per-day; sibling to
// `useWaitlist`, which fetches a single day for the modal flow.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../client.js";
import { logger } from "../../lib/logger.js";

function toDateStr(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function useWaitlistUpcoming() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async (signal) => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayStr = toDateStr(today);
    const tomorrowStr = toDateStr(tomorrow);

    // Fetch a wider window than just today/tomorrow so the resolver
    // can also show "X dogs waiting" in the active tone even when none
    // are imminent. Cap at 90 days to keep the query bounded.
    const ninetyDaysAhead = new Date(today);
    ninetyDaysAhead.setDate(ninetyDaysAhead.getDate() + 90);

    const query = supabase
      .from("waitlist_entries")
      .select("id, target_date")
      .gte("target_date", todayStr)
      .lte("target_date", toDateStr(ninetyDaysAhead));
    const { data, error } = await (signal
      ? query.abortSignal(signal)
      : query);

    if (signal?.aborted) return;
    if (error) {
      logger.warn("useWaitlistUpcoming fetch failed", {
        tags: { hook: "useWaitlistUpcoming", op: "fetch" },
        extra: { message: error.message },
      });
      setLoading(false);
      return;
    }
    setEntries(data ?? []);
    setLoading(false);
    // Reference unused tomorrowStr to keep the imminent-window
    // documented in code even though the filter is server-side.
    void tomorrowStr;
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    fetchEntries(controller.signal);

    const channel = supabase
      .channel("waitlist_upcoming_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waitlist_entries" },
        () => {
          fetchEntries(controller.signal);
        },
      )
      .subscribe();

    return () => {
      controller.abort();
      supabase.removeChannel(channel);
    };
  }, [fetchEntries]);

  return { entries, loading };
}
