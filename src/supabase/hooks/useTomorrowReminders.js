// ============================================================
// src/supabase/hooks/useTomorrowReminders.js
//
// Dashboard helper for the "Tomorrow's reminders" panel. Returns ONE
// row per customer on the next salon-open day (a customer with several
// dogs booked that day is collapsed into a single row and gets one
// combined reminder), the owner + dog names, the time slot(s), and
// whether a reminder has already been sent (via notification_log).
//
// Module-level singleton + useSyncExternalStore + one ref-counted
// realtime channel — the panel hook is mounted twice on the Bookings
// page (WeekCalendarView for the UtilityTabs badge AND the
// RightWorkflowSidebar that owns the card), so a singleton shares one
// fetch + one subscription instead of issuing the bookings +
// notification_log pair twice. Mirrors useWhatsAppSummary.
//
// Realtime: subscribes to notification_log + bookings so the tick state
// updates live when the cron fires reminders overnight, staff tick a
// row, or a booking changes. (notification_log was added to the
// supabase_realtime publication in 20260601120000.)
// ============================================================

import { useSyncExternalStore, useCallback, useMemo } from "react";
import { supabase } from "../client.js";
import { registerResume } from "../refreshOnResume.js";
import { getNextWorkingDay } from "../../utils/nextWorkingDay.js";
import { logger } from "../../lib/logger.js";
import { groupRemindersByCustomer } from "./groupRemindersByCustomer.js";

let state = {
  targetDate: getNextWorkingDay(),
  rows: [],
  loading: true,
  error: null,
};
let channel = null;
const listeners = new Set();

function setState(next) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

async function refresh() {
  if (!supabase) {
    if (state.loading) setState({ loading: false });
    return;
  }
  // Recompute each refresh so a session left open across midnight rolls
  // to the new "next working day" rather than sticking on the old one.
  const targetDate = getNextWorkingDay();
  setState({ error: null });
  try {
    // Embed dogs(human_id, name) so we can group by customer — bookings
    // has no human_id of its own. Plain embed (not !inner) so a booking
    // whose dog was deleted still appears (it falls back to the snapshot
    // name and an orphan key). Excludes Cancelled + Completed.
    const { data: bookings, error: bookingsErr } = await supabase
      .from("bookings")
      .select(
        "id, slot, service, status, booking_date, dog_id, dog_name_snapshot, owner_name_snapshot, reminder_confirmed_at, dogs(human_id, name)",
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
      // 'pending' row to indicate "in flight"; ignore failed ones.
      for (const log of logs ?? []) {
        const existing = sentMap.get(log.booking_id);
        if (!existing || log.status === "sent") {
          sentMap.set(log.booking_id, log);
        }
      }
    }

    setState({
      targetDate,
      rows: groupRemindersByCustomer(bookings ?? [], sentMap),
      loading: false,
    });
  } catch (err) {
    logger.error("useTomorrowReminders fetch failed", err, {
      tags: { hook: "useTomorrowReminders", op: "fetch" },
    });
    setState({ error: err, loading: false });
  }
}

function startChannel() {
  if (channel || !supabase) return;
  channel = supabase
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
}

function stopChannel() {
  if (!channel) return;
  supabase.removeChannel(channel);
  channel = null;
}

function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    startChannel();
    refresh();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopChannel();
  };
}

function getSnapshot() {
  return state;
}

// Reconcile on resume so a reminder sent / ticked while the iPad slept
// shows up without a manual refresh. Guarded on listeners.
registerResume(() => {
  if (listeners.size > 0) refresh();
});

export function useTomorrowReminders() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const refresh_ = useCallback(() => refresh(), []);
  const sentCount = useMemo(
    () => snapshot.rows.filter((r) => r.reminderStatus === "sent").length,
    [snapshot.rows],
  );
  return {
    targetDate: snapshot.targetDate,
    rows: snapshot.rows,
    sentCount,
    totalCount: snapshot.rows.length,
    loading: snapshot.loading,
    error: snapshot.error,
    refresh: refresh_,
  };
}
