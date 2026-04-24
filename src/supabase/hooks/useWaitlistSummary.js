// ============================================================
// src/supabase/hooks/useWaitlistSummary.js
//
// Sidebar card stat. Deliberately *not* scoped to a specific day —
// that would duplicate WaitlistPanel, which sits right next to the
// sidebar on desktop. Instead we give the at-a-glance numbers that
// WaitlistPanel can't: total pending across all upcoming days, plus
// a "this week" subtotal so a busy Monday doesn't hide a packed Sat.
//
// Returns:
//   {
//     totalUpcoming, // target_date >= today
//     thisWeek,      // target_date in [today, today+6]
//     loading,
//   }
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";
import { toDateStr } from "../transforms.js";

export function useWaitlistSummary() {
  const [summary, setSummary] = useState({ totalUpcoming: 0, thisWeek: 0 });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in6 = new Date(today);
    in6.setDate(in6.getDate() + 6);

    const todayStr = toDateStr(today);
    const weekEndStr = toDateStr(in6);

    // Two head-only count queries. Cheap. We count rows, not humans —
    // if a single human is on two dates, that's two waitlist asks and
    // worth counting twice for capacity planning.
    const [total, week] = await Promise.all([
      supabase
        .from("waitlist_entries")
        .select("id", { count: "exact", head: true })
        .gte("target_date", todayStr),
      supabase
        .from("waitlist_entries")
        .select("id", { count: "exact", head: true })
        .gte("target_date", todayStr)
        .lte("target_date", weekEndStr),
    ]);

    if (total.error) console.warn("useWaitlistSummary total:", total.error.message);
    if (week.error) console.warn("useWaitlistSummary week:", week.error.message);

    setSummary({
      totalUpcoming: total.count ?? 0,
      thisWeek: week.count ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    if (!supabase) return;

    const channel = supabase
      .channel("waitlist-dashboard-summary")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waitlist_entries" },
        () => refresh(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return { ...summary, loading };
}
