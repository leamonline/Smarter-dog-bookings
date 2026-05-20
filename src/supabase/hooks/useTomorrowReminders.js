// ============================================================
// src/supabase/hooks/useTomorrowReminders.js
//
// Dashboard helper for the "Tomorrow's reminders" panel. Returns the
// bookings on the next salon-open day, the owner + dog names, the
// time slot, and whether a reminder has already been sent for that
// booking (via notification_log).
//
// Realtime: subscribes to notification_log inserts so the tick state
// updates live when:
//   - the cron job fires reminders overnight
//   - staff ticks a row from the dashboard
//   - any other process inserts a sent reminder row
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../client.js";
import { getNextWorkingDay } from "../../utils/nextWorkingDay.js";
import { logger } from "../../lib/logger.js";

export function useTomorrowReminders() {
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
      // Pull bookings + the snapshot columns Phase B added so we don't
      // need joins to humans/dogs. Excludes Cancelled (no point
      // reminding) and Completed (already happened).
      const { data: bookings, error: bookingsErr } = await supabase
        .from("bookings")
        .select(
          "id, slot, service, status, booking_date, dog_id, dog_name_snapshot, owner_name_snapshot",
        )
        .eq("booking_date", targetDate)
        .not("status", "in", "(Cancelled,Completed)")
        .order("slot", { ascending: true });
      if (bookingsErr) throw bookingsErr;

      const bookingIds = (bookings ?? []).map((b) => b.id);
      let sentMap = new Map();
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

      const result = (bookings ?? []).map((b) => {
        const dogName = b.dog_name_snapshot || "Unknown dog";
        const customerName = b.owner_name_snapshot || "Unknown customer";
        const reminder = sentMap.get(b.id);
        return {
          bookingId: b.id,
          slot: b.slot,
          service: b.service,
          status: b.status,
          dogName,
          customerName,
          reminderStatus: reminder?.status ?? null,
          reminderSentAt: reminder?.sent_at ?? null,
          reminderChannel: reminder?.channel ?? null,
        };
      });
      setRows(result);
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
    const channel = supabase
      .channel("dashboard-tomorrow-reminders")
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
  }, [refresh]);

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
