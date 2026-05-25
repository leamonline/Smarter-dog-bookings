// ============================================================
// src/supabase/hooks/useTomorrowReminders.js
//
// Dashboard helper for the "Tomorrow's reminders" panel. Returns ONE
// row per customer on the next salon-open day (a customer with several
// dogs booked that day is collapsed into a single row and gets one
// combined reminder), the owner + dog names, the time slot(s), and
// whether a reminder has already been sent (via notification_log).
//
// Realtime: subscribes to notification_log inserts so the tick state
// updates live when:
//   - the cron job fires reminders overnight
//   - staff ticks a row from the dashboard
//   - any other process inserts a sent reminder row
// ============================================================

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { supabase } from "../client.js";
import { getNextWorkingDay } from "../../utils/nextWorkingDay.js";
import { logger } from "../../lib/logger.js";
import { groupRemindersByCustomer } from "./groupRemindersByCustomer.js";

export function useTomorrowReminders() {
  const instanceId = useId();
  const targetDate = useMemo(() => getNextWorkingDay(), []);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      // Embed dogs(human_id, name) so we can group by customer — bookings
      // has no human_id of its own. Plain embed (not !inner) so a booking
      // whose dog was deleted still appears (it falls back to the snapshot
      // name and an orphan key). Snapshot columns stay as the fallback.
      // Excludes Cancelled (no point reminding) and Completed (already
      // happened).
      const { data: bookings, error: bookingsErr } = await supabase
        .from("bookings")
        .select(
          "id, slot, service, status, booking_date, dog_id, dog_name_snapshot, owner_name_snapshot, dogs(human_id, name)",
        )
        .eq("booking_date", targetDate)
        .not("status", "in", "(Cancelled,Completed)")
        .order("slot", { ascending: true });
      if (bookingsErr) throw bookingsErr;

      const bookingIds = (bookings ?? []).map((b) => b.id);
      const sentMap = new Map();
      if (bookingIds.length > 0) {
        const { data: logs, error: logsErr } = await supabase
          .from("notification_log")
          .select("booking_id, status, sent_at, channel")
          .in("booking_id", bookingIds)
          .eq("trigger_type", "reminder");
        if (logsErr) throw logsErr;
        // Prefer the most recent 'sent' row per booking; fall back to a
        // 'pending' row to indicate "in flight"; ignore failed ones for
        // the tick (so a previous failure doesn't pre-tick a row).
        for (const log of logs ?? []) {
          const existing = sentMap.get(log.booking_id);
          if (!existing || log.status === "sent") {
            sentMap.set(log.booking_id, log);
          }
        }
      }

      // Collapse to one row per customer (keyed on human_id).
      setRows(groupRemindersByCustomer(bookings ?? [], sentMap));
    } catch (err) {
      logger.error("useTomorrowReminders fetch failed", err, {
        tags: { hook: "useTomorrowReminders", op: "fetch" },
      });
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    if (!supabase) return;
    refresh();
    // Per-instance channel name — Supabase reuses channels by name, so a
    // shared name across mounts (e.g. sidebar + card simultaneously, or
    // React strict-mode remount racing async cleanup) causes the second
    // mount to call `.on()` on an already-subscribed channel and throw.
    const channel = supabase
      .channel(`dashboard-tomorrow-reminders:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notification_log" },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh, instanceId]);

  const sentCount = rows.filter((r) => r.reminderStatus === "sent").length;
  const totalCount = rows.length;

  return {
    targetDate,
    rows,
    sentCount,
    totalCount,
    loading,
    error,
    refresh,
  };
}
