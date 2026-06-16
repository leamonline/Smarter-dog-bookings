// ============================================================
// src/supabase/hooks/useDeliveryFailures.js
//
// Surfaces FAILED customer notifications (booking confirmation / reminder /
// ready / cancellation) so staff can spot an undeliverable message, fix the
// number, and resend.
//
// Module-level singleton + useSyncExternalStore + one ref-counted realtime
// channel — mirrors useTomorrowReminders. Every booking pill calls
// useBookingDeliveryFailure(id), and the dashboard card calls
// useDeliveryFailures(); a singleton shares one fetch + one subscription.
//
// Realtime: subscribes to notification_log so the badge clears the instant a
// resend succeeds (a newer 'sent' row supersedes the 'failed' one) or re-reds
// if the resend also fails. notification_log is already in the
// supabase_realtime publication (20260601120000).
// ============================================================

import { useSyncExternalStore, useCallback, useMemo } from "react";
import { supabase } from "../client.js";
import { registerResume } from "../refreshOnResume.js";
import { logger } from "../../lib/logger";

// Only look back so far — a months-old failed confirmation for a long-past
// appointment isn't actionable, and it keeps the supersession fetch small.
const LOOKBACK_DAYS = 120;

// Human-readable label per notification trigger_type.
const TRIGGER_LABEL = {
  confirmed: "Confirmation",
  reminder: "Reminder",
  ready: "Ready-for-collection",
  cancelled: "Cancellation",
};

export function triggerLabel(triggerType) {
  return TRIGGER_LABEL[triggerType] || triggerType;
}

let state = {
  // Map<booking_id, FailureInfo[]> — FailureInfo = { trigger_type, channel,
  // error_message, created_at, human_id }
  byBooking: new Map(),
  // Enriched flat list for the dashboard card (one entry per failed booking).
  failures: [],
  loading: true,
  error: null,
};
let channel = null;
const listeners = new Set();

// Under vitest the booking pill renders in many suites; opening a real
// realtime socket / hitting the network there is both noisy (undici WS errors)
// and wrong. Stay inert in tests — suites that exercise the badge mock this
// hook to inject failures. Matches the import.meta.env.MODE guard in lib/sentry.
const IS_TEST = import.meta.env?.MODE === "test";

function setState(next) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

async function refresh() {
  if (!supabase || IS_TEST) {
    if (state.loading) setState({ loading: false });
    return;
  }
  setState({ error: null });
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();

    // 1. Bookings that have at least one FAILED notification in the window.
    //    Failures are rare, so this returns a small set.
    const { data: failedRows, error: failedErr } = await supabase
      .from("notification_log")
      .select("booking_id")
      .eq("status", "failed")
      .gte("created_at", since);
    if (failedErr) throw failedErr;

    const failedBookingIds = [
      ...new Set((failedRows ?? []).map((r) => r.booking_id).filter(Boolean)),
    ];

    if (failedBookingIds.length === 0) {
      setState({ byBooking: new Map(), failures: [], loading: false });
      return;
    }

    // 2. ALL notification rows for those bookings, newest first, so we can
    //    apply the supersession rule: a failure only counts if it's still the
    //    latest row for its (booking, trigger, recipient) tuple. A later
    //    'sent'/'pending' row means staff already resent.
    const { data: allRows, error: allErr } = await supabase
      .from("notification_log")
      .select("booking_id, human_id, trigger_type, channel, status, error_message, created_at")
      .in("booking_id", failedBookingIds)
      .order("created_at", { ascending: false });
    if (allErr) throw allErr;

    const latestByTuple = new Map();
    for (const r of allRows ?? []) {
      const key = `${r.booking_id}|${r.trigger_type}|${r.human_id ?? ""}`;
      if (!latestByTuple.has(key)) latestByTuple.set(key, r); // first = newest
    }

    const byBooking = new Map();
    for (const r of latestByTuple.values()) {
      if (r.status !== "failed") continue;
      if (!byBooking.has(r.booking_id)) byBooking.set(r.booking_id, []);
      byBooking.get(r.booking_id).push({
        trigger_type: r.trigger_type,
        channel: r.channel,
        error_message: r.error_message,
        created_at: r.created_at,
        human_id: r.human_id,
      });
    }

    // 3. Enrich for the dashboard list: customer + dog + date per failed
    //    booking, straight off the booking snapshots (no humans join).
    const liveBookingIds = [...byBooking.keys()];
    let bookingMeta = new Map();
    if (liveBookingIds.length > 0) {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, booking_date, slot, dog_name_snapshot, owner_name_snapshot, status")
        .in("id", liveBookingIds);
      bookingMeta = new Map((bookings ?? []).map((b) => [b.id, b]));
    }

    const failures = liveBookingIds
      .map((bid) => {
        const infos = byBooking.get(bid) || [];
        const meta = bookingMeta.get(bid) || {};
        const newest = infos.reduce(
          (a, b) => (a && a.created_at > b.created_at ? a : b),
          null,
        );
        return {
          bookingId: bid,
          bookingDate: meta.booking_date || null,
          slot: meta.slot || null,
          customerName: meta.owner_name_snapshot || "Customer",
          dogName: meta.dog_name_snapshot || "",
          triggers: infos.map((i) => i.trigger_type),
          latestError: newest?.error_message || null,
          latestAt: newest?.created_at || null,
        };
      })
      .sort((a, b) => (b.latestAt || "").localeCompare(a.latestAt || ""));

    setState({ byBooking, failures, loading: false });
  } catch (err) {
    logger.error("useDeliveryFailures fetch failed", err, {
      tags: { hook: "useDeliveryFailures", op: "fetch" },
    });
    setState({ error: err, loading: false });
  }
}

function startChannel() {
  if (channel || !supabase || IS_TEST) return;
  channel = supabase
    .channel("dashboard-delivery-failures")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notification_log" },
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

registerResume(() => {
  if (listeners.size > 0) refresh();
});

// Full set — for the dashboard "delivery failures" card.
export function useDeliveryFailures() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const refresh_ = useCallback(() => refresh(), []);
  return {
    failures: snapshot.failures,
    count: snapshot.failures.length,
    loading: snapshot.loading,
    error: snapshot.error,
    refresh: refresh_,
  };
}

// Per-booking selector — for the badge on a booking pill / the detail card.
// Returns the FailureInfo[] for this booking, or null.
export function useBookingDeliveryFailure(bookingId) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => {
    if (!bookingId) return null;
    return snapshot.byBooking.get(bookingId) ?? null;
  }, [snapshot.byBooking, bookingId]);
}
