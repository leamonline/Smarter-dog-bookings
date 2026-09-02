// ============================================================
// src/supabase/hooks/useTomorrowReminders.ts
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
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../client";
import { CHANNELS } from "../realtimeChannels";
import { registerResume } from "../refreshOnResume.js";
import { logger } from "../../lib/logger";
import { groupRemindersByCustomer } from "./groupRemindersByCustomer";
import type { Database } from "../database.types";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type DogRow = Database["public"]["Tables"]["dogs"]["Row"];
type NotificationLogRow = Database["public"]["Tables"]["notification_log"]["Row"];

/** The columns the reminders join from dogs for grouping. */
export type ReminderDogJoin = Pick<DogRow, "human_id" | "name">;

/** One booking row as refresh() selects it, with the dogs embed. */
export type ReminderBooking = Pick<
  BookingRow,
  | "id"
  | "slot"
  | "service"
  | "status"
  | "booking_date"
  | "dog_id"
  | "dog_name_snapshot"
  | "owner_name_snapshot"
  | "reminder_confirmed_at"
  | "reminder_confirmed_source"
> & { dogs: ReminderDogJoin | null };

/** A reminder log row keyed into sentMap. */
export type ReminderLog = Pick<
  NotificationLogRow,
  "booking_id" | "status" | "sent_at" | "channel"
>;

/** One customer-collapsed row the dashboard card renders. */
export interface TomorrowReminderRow {
  customerKey: string;
  customerName: string;
  dogNames: string[];
  dogNamesDisplay: string;
  bookingIds: string[];
  anchorBookingId: string;
  slots: string[];
  slot: string | null;
  multiSlot: boolean;
  reminderStatus: "sent" | "pending" | null;
  reminderSentAt: string | null;
  reminderChannel: string | null;
  confirmed: boolean;
  reminderConfirmedAt: string | null;
  reminderConfirmedBy: string | null;
}

interface TomorrowRemindersState {
  targetDate: string;
  rows: TomorrowReminderRow[];
  loading: boolean;
  error: unknown;
}

// Reminders always target the literal next day — staff send them the
// afternoon/evening before, whatever day of the week that lands on. A
// closed tomorrow simply shows "0 bookings". (Replaces the old
// getNextWorkingDay helper, whose Mon/Tue/Wed-only schedule was stale.)
function getTomorrowDateStr(from?: Date | null): string {
  // Anchor to UK time so a late-night session past midnight UTC still
  // shows the date the salon would call "tomorrow".
  const today = from ?? new Date();
  const ukDateStr = today.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const d = new Date(ukDateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

let state: TomorrowRemindersState = {
  targetDate: getTomorrowDateStr(),
  rows: [],
  loading: true,
  error: null,
};
let channel: RealtimeChannel | null = null;
const listeners = new Set<() => void>();

function setState(next: Partial<TomorrowRemindersState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

async function refresh(): Promise<void> {
  if (!supabase) {
    if (state.loading) setState({ loading: false });
    return;
  }
  // Recompute each refresh so a session left open across midnight rolls
  // to the new "tomorrow" rather than sticking on the old one.
  const targetDate = getTomorrowDateStr();
  setState({ error: null });
  try {
    // Embed dogs(human_id, name) so we can group by customer — bookings
    // has no human_id of its own. Plain embed (not !inner) so a booking
    // whose dog was deleted still appears (it falls back to the snapshot
    // name and an orphan key). Excludes Cancelled + Completed.
    const { data: bookings, error: bookingsErr } = await supabase
      .from("bookings")
      .select(
        "id, slot, service, status, booking_date, dog_id, dog_name_snapshot, owner_name_snapshot, reminder_confirmed_at, reminder_confirmed_source, dogs(human_id, name)",
      )
      .eq("booking_date", targetDate)
      .not("status", "in", "(Cancelled,Completed)")
      .order("slot", { ascending: true });
    if (bookingsErr) throw bookingsErr;

    const bookingIds = (bookings ?? []).map((b) => b.id);
    const sentMap = new Map<string, ReminderLog>();
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
        if (!log.booking_id) continue;
        const existing = sentMap.get(log.booking_id);
        if (!existing || log.status === "sent") {
          sentMap.set(log.booking_id, log);
        }
      }
    }

    setState({
      targetDate,
      rows: groupRemindersByCustomer(bookings ?? [], sentMap) as TomorrowReminderRow[],
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
    .channel(CHANNELS.dashboardTomorrowReminders)
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
  if (!channel || !supabase) return;
  supabase.removeChannel(channel);
  channel = null;
}

function subscribe(listener: () => void): () => void {
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

function getSnapshot(): TomorrowRemindersState {
  return state;
}

// Reconcile on resume so a reminder sent / ticked while the iPad slept
// shows up without a manual refresh. Guarded on listeners.
registerResume(() => {
  if (listeners.size > 0) refresh();
});

export interface UseTomorrowRemindersResult {
  targetDate: string;
  rows: TomorrowReminderRow[];
  sentCount: number;
  totalCount: number;
  loading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
}

export function useTomorrowReminders(): UseTomorrowRemindersResult {
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
