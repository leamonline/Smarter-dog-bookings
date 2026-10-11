// ============================================================
// src/supabase/hooks/useDeliveryFailures.ts
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
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../client";
import { CHANNELS } from "../realtimeChannels";
import { registerResume } from "../refreshOnResume.js";
import { logger } from "../../lib/logger";
import type { Database } from "../database.types";
import { META_UNDELIVERABLE, metaFailureSummary } from "../../../supabase/functions/_shared/deliveryStatus";

type NotificationLogRow = Database["public"]["Tables"]["notification_log"]["Row"];
type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type DismissalRow = Database["public"]["Tables"]["notification_dismissals"]["Row"];

/** The columns refresh() selects from notification_log for the supersession pass. */
type NotificationLogSelect = Pick<
  NotificationLogRow,
  | "booking_id"
  | "human_id"
  | "trigger_type"
  | "channel"
  | "status"
  | "error_message"
  | "created_at"
  | "provider_message_id"
>;

/** Per-trigger failure the booking pill / detail card renders. */
export type FailureInfo = Pick<
  NotificationLogRow,
  "trigger_type" | "channel" | "error_message" | "created_at" | "human_id"
>;

type BookingMeta = Pick<
  BookingRow,
  "id" | "booking_date" | "slot" | "dog_name_snapshot" | "owner_name_snapshot" | "status"
>;

/** One dashboard-card row per booking that still has a live failed notification. */
export interface DeliveryFailure {
  bookingId: string;
  bookingDate: string | null;
  slot: string | null;
  customerName: string;
  dogName: string;
  triggers: string[];
  latestError: string | null;
  latestAt: string | null;
}

interface DeliveryFailuresState {
  byBooking: Map<string, FailureInfo[]>;
  /** Customers whose most recent WhatsApp sends ALL failed — see unreachableHumanIds. */
  unreachableHumans: Set<string>;
  failures: DeliveryFailure[];
  loading: boolean;
  error: unknown;
}

// Only look back so far — a months-old failed confirmation for a long-past
// appointment isn't actionable, and it keeps the supersession fetch small.
const LOOKBACK_DAYS = 120;

// Human-readable label per notification trigger_type.
const TRIGGER_LABEL: Record<string, string> = {
  confirmed: "Confirmation",
  reminder: "Reminder",
  ready: "Ready-for-collection",
  cancelled: "Cancellation",
};

export function triggerLabel(triggerType: string): string {
  return TRIGGER_LABEL[baseTrigger(triggerType)] || triggerType;
}

/**
 * The notification a row is ABOUT, for labels only. The SMS safety net logs
 * its resend of a failed WhatsApp confirmation or reminder as
 * `confirmed_sms_fallback` / `reminder_sms_fallback`. It does NOT clear the
 * WhatsApp failure: an SMS row reading 'sent' only means the provider took the
 * request, and delivery is never inferred from an attempted provider call
 * (AGENTS.md). There is no SMS delivery receipt to reconcile against.
 */
export function baseTrigger(triggerType: string): string {
  return triggerType.replace(/_sms_fallback$/, "");
}

/** How many most-recent WhatsApp sends must ALL have been undeliverable to call a number unreachable. */
export const UNREACHABLE_AFTER = 3;

/**
 * Apply Meta's verdict to log rows. notification_log says 'sent' the moment
 * Meta accepts a message; Meta's later "failed" lands on the whatsapp_messages
 * row with the same id. The webhook also copies it onto the log, but it can
 * lose the race with the notify function that is still writing the id onto a
 * pending row, and rows from before that change were never copied at all. So
 * the read side reconciles: any WhatsApp row whose provider message Meta
 * failed is treated as failed, with Meta's reason. Pure; returns new rows.
 */
export function applyMetaVerdicts<T extends Pick<NotificationLogRow, "channel" | "status" | "error_message" | "provider_message_id">>(
  rows: readonly T[],
  failedByMetaId: ReadonlyMap<string, string>,
): T[] {
  if (failedByMetaId.size === 0) return [...rows];
  return rows.map((r) => {
    if (r.channel !== "whatsapp" || r.status !== "sent" || !r.provider_message_id) return r;
    const reason = failedByMetaId.get(r.provider_message_id);
    return reason === undefined ? r : { ...r, status: "failed", error_message: reason };
  });
}

/** Meta's raw error JSON on a whatsapp_messages row, as one readable line. */
export function metaVerdictReason(rawError: string | null | undefined): string {
  try {
    const parsed = rawError ? JSON.parse(rawError) : null;
    return metaFailureSummary(Array.isArray(parsed) ? parsed : null);
  } catch {
    return metaFailureSummary(null);
  }
}

/**
 * The supersession pass. Given every notification row for a set of bookings,
 * NEWEST FIRST, keep a failure only while it is still the latest row for its
 * exact (booking, trigger, recipient). A later 'sent' or 'pending' row for the
 * same trigger means staff resent it. An SMS fallback is a different trigger,
 * so it never clears the WhatsApp failure (see baseTrigger).
 */
export function liveFailuresByBooking(rowsNewestFirst: readonly NotificationLogSelect[]): Map<string, FailureInfo[]> {
  const latestByTuple = new Map<string, NotificationLogSelect>();
  for (const r of rowsNewestFirst) {
    const key = `${r.booking_id}|${r.trigger_type}|${r.human_id ?? ""}`;
    if (!latestByTuple.has(key)) latestByTuple.set(key, r); // first = newest
  }

  const byBooking = new Map<string, FailureInfo[]>();
  for (const r of latestByTuple.values()) {
    if (r.status !== "failed") continue;
    if (!r.booking_id) continue;
    let infos = byBooking.get(r.booking_id);
    if (!infos) {
      infos = [];
      byBooking.set(r.booking_id, infos);
    }
    infos.push({
      trigger_type: r.trigger_type,
      channel: r.channel,
      error_message: r.error_message,
      created_at: r.created_at,
      human_id: r.human_id,
    });
  }
  return byBooking;
}

const UNDELIVERABLE_RE = new RegExp(`\\b${META_UNDELIVERABLE}\\b`);

/**
 * Customers whose last UNREACHABLE_AFTER WhatsApp sends were ALL reported by
 * Meta as undeliverable (131026), which almost always means the number isn't
 * on WhatsApp. Any other failure — a provider outage, a credentials or
 * template problem — says nothing about the number, so it ends the streak
 * rather than counting towards it. One provider message covering several dogs
 * is logged once per booking under the same provider id; it counts once.
 * Rows must be WhatsApp sends, NEWEST FIRST.
 */
export function unreachableHumanIds(
  whatsappRowsNewestFirst: readonly Pick<NotificationLogRow, "human_id" | "status" | "error_message" | "provider_message_id">[],
  threshold: number = UNREACHABLE_AFTER,
): Set<string> {
  const recent = new Map<string, { sends: boolean[]; seenIds: Set<string> }>();
  for (const r of whatsappRowsNewestFirst) {
    if (!r.human_id) continue;
    let entry = recent.get(r.human_id);
    if (!entry) {
      entry = { sends: [], seenIds: new Set() };
      recent.set(r.human_id, entry);
    }
    if (entry.sends.length >= threshold) continue;
    if (r.provider_message_id) {
      if (entry.seenIds.has(r.provider_message_id)) continue;
      entry.seenIds.add(r.provider_message_id);
    }
    entry.sends.push(r.status === "failed" && UNDELIVERABLE_RE.test(r.error_message ?? ""));
  }
  const out = new Set<string>();
  for (const [humanId, { sends }] of recent) {
    if (sends.length === threshold && sends.every(Boolean)) out.add(humanId);
  }
  return out;
}

// Dashboard-only dismissal filter. A booking is hidden when it has a
// dismissal whose timestamp is >= the booking's most recent failure
// (latestAt). A newer failure (latestAt > dismissed_at) re-surfaces it.
// ISO timestamps (both UTC) compare correctly as strings.
export function applyDismissals<T extends { bookingId: string; latestAt?: string | null }>(
  failures: T[],
  dismissals: Map<string, string> | null | undefined,
): T[] {
  if (!dismissals || dismissals.size === 0) return failures;
  return failures.filter((f) => {
    const dismissedAt = dismissals.get(f.bookingId);
    if (!dismissedAt) return true;   // not dismissed
    if (!f.latestAt) return true;    // can't compare → keep
    return f.latestAt > dismissedAt; // keep only if it failed again after the dismissal
  });
}

let state: DeliveryFailuresState = {
  // Map<booking_id, FailureInfo[]> — FailureInfo = { trigger_type, channel,
  // error_message, created_at, human_id }
  byBooking: new Map(),
  unreachableHumans: new Set(),
  // Enriched flat list for the dashboard card (one entry per failed booking).
  failures: [],
  loading: true,
  error: null,
};
let channel: RealtimeChannel | null = null;
const listeners = new Set<() => void>();

// Under vitest the booking pill renders in many suites; opening a real
// realtime socket / hitting the network there is both noisy (undici WS errors)
// and wrong. Stay inert in tests — suites that exercise the badge mock this
// hook to inject failures. Matches the import.meta.env.MODE guard in lib/sentry.
const IS_TEST = import.meta.env?.MODE === "test";

function setState(next: Partial<DeliveryFailuresState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

async function refresh(): Promise<void> {
  if (!supabase || IS_TEST) {
    if (state.loading) setState({ loading: false });
    return;
  }
  setState({ error: null });
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();

    // 0. Messages Meta itself reported as failed (see applyMetaVerdicts).
    //    Rare — a few dozen over the whole window — so this stays small.
    const { data: metaFailed, error: metaErr } = await supabase
      .from("whatsapp_messages")
      .select("meta_message_id, error_message")
      .eq("direction", "outbound")
      .eq("status", "failed")
      .gte("sent_at", since);
    if (metaErr) throw metaErr;
    const failedByMetaId = new Map<string, string>();
    for (const m of metaFailed ?? []) {
      if (m.meta_message_id) failedByMetaId.set(m.meta_message_id, metaVerdictReason(m.error_message));
    }

    // 1. Bookings with at least one FAILED notification in the window: failed
    //    in the log itself, or logged 'sent' for a message Meta then failed.
    const { data: failedRows, error: failedErr } = await supabase
      .from("notification_log")
      .select("booking_id")
      .eq("status", "failed")
      .gte("created_at", since);
    if (failedErr) throw failedErr;

    let metaFailedRows: { booking_id: string | null }[] = [];
    if (failedByMetaId.size > 0) {
      const { data, error } = await supabase
        .from("notification_log")
        .select("booking_id")
        .eq("channel", "whatsapp")
        .in("provider_message_id", [...failedByMetaId.keys()]);
      if (error) throw error;
      metaFailedRows = data ?? [];
    }

    const failedBookingIds = [
      ...new Set(
        [...(failedRows ?? []), ...metaFailedRows]
          .map((r) => r.booking_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (failedBookingIds.length === 0) {
      setState({ byBooking: new Map(), unreachableHumans: new Set(), failures: [], loading: false });
      return;
    }

    // 2. ALL notification rows for those bookings, newest first, so we can
    //    apply the supersession rule: a failure only counts if it's still the
    //    latest row for its (booking, trigger, recipient) tuple. A later
    //    'sent'/'pending' row means staff already resent.
    const { data: allRows, error: allErr } = await supabase
      .from("notification_log")
      .select("booking_id, human_id, trigger_type, channel, status, error_message, created_at, provider_message_id")
      .in("booking_id", failedBookingIds)
      .order("created_at", { ascending: false });
    if (allErr) throw allErr;

    const byBooking = liveFailuresByBooking(applyMetaVerdicts(allRows ?? [], failedByMetaId));

    // 2b. Is any of these customers simply unreachable on WhatsApp? Only the
    //     customers with a live failure can be, so this stays a small query.
    const failedHumanIds = [
      ...new Set(
        [...byBooking.values()]
          .flat()
          .map((f) => f.human_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    let unreachableHumans = new Set<string>();
    if (failedHumanIds.length > 0) {
      const { data: waRows, error: waErr } = await supabase
        .from("notification_log")
        .select("human_id, channel, status, error_message, provider_message_id")
        .eq("channel", "whatsapp")
        .in("human_id", failedHumanIds)
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      // Advisory only: if this read fails the per-booking badges still show.
      if (!waErr) unreachableHumans = unreachableHumanIds(applyMetaVerdicts(waRows ?? [], failedByMetaId));
    }

    // 3. Enrich for the dashboard list: customer + dog + date per failed
    //    booking, straight off the booking snapshots (no humans join).
    const liveBookingIds = [...byBooking.keys()];
    let bookingMeta = new Map<string, BookingMeta>();
    if (liveBookingIds.length > 0) {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, booking_date, slot, dog_name_snapshot, owner_name_snapshot, status")
        .in("id", liveBookingIds);
      bookingMeta = new Map((bookings ?? []).map((b) => [b.id, b]));
    }

    const failures: DeliveryFailure[] = liveBookingIds
      .map((bid) => {
        const infos = byBooking.get(bid) || [];
        const meta = bookingMeta.get(bid);
        const newest = infos.reduce<FailureInfo | null>(
          (a, b) => (a && (a.created_at || "") > (b.created_at || "") ? a : b),
          null,
        );
        return {
          bookingId: bid,
          bookingDate: meta?.booking_date || null,
          slot: meta?.slot || null,
          customerName: meta?.owner_name_snapshot || "Customer",
          dogName: meta?.dog_name_snapshot || "",
          triggers: infos.map((i) => i.trigger_type),
          latestError: newest?.error_message || null,
          latestAt: newest?.created_at || null,
        };
      })
      .sort((a, b) => (b.latestAt || "").localeCompare(a.latestAt || ""));

    // Dashboard-only: hide failures the staff have dismissed (unless they
    // failed again since). Missing table/RLS (e.g. migration not yet applied)
    // degrades to "no dismissals" so the card still renders.
    let dismissals = new Map<string, string>();
    if (liveBookingIds.length > 0) {
      const { data: dRows, error: dErr } = await supabase
        .from("notification_dismissals")
        .select("booking_id, dismissed_at")
        .in("booking_id", liveBookingIds);
      if (!dErr) {
        dismissals = new Map(
          (dRows ?? []).map((d: Pick<DismissalRow, "booking_id" | "dismissed_at">) => [
            d.booking_id,
            d.dismissed_at,
          ]),
        );
      }
    }

    setState({
      byBooking,
      unreachableHumans,
      failures: applyDismissals(failures, dismissals),
      loading: false,
    });
  } catch (err) {
    logger.error("useDeliveryFailures fetch failed", err, {
      tags: { hook: "useDeliveryFailures", op: "fetch" },
    });
    setState({ error: err, loading: false });
  }
}

// Dismiss a booking's failure from the dashboard card. Optimistically drops
// it from the local list, then persists via the SECURITY DEFINER RPC (DB
// clock + is_staff()). On error, refresh() restores the true state. Inert in
// tests / offline, matching the rest of this module.
async function dismiss(bookingId: string): Promise<void> {
  if (!bookingId || !supabase || IS_TEST) return;
  setState({ failures: state.failures.filter((f) => f.bookingId !== bookingId) });
  const { error } = await supabase.rpc("dismiss_delivery_failure", {
    p_booking_id: bookingId,
  });
  if (error) {
    logger.error("useDeliveryFailures dismiss failed", error, {
      tags: { hook: "useDeliveryFailures", op: "dismiss" },
    });
    refresh();
  }
}

function startChannel() {
  if (channel || !supabase || IS_TEST) return;
  channel = supabase
    .channel(CHANNELS.dashboardDeliveryFailures)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notification_log" },
      () => refresh(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notification_dismissals" },
      () => refresh(),
    )
    // Meta's "failed" verdict lands here first; only failures matter, so
    // ordinary delivered/read receipts don't trigger a refetch.
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "whatsapp_messages", filter: "status=eq.failed" },
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

function getSnapshot(): DeliveryFailuresState {
  return state;
}

registerResume(() => {
  if (listeners.size > 0) refresh();
});

export interface UseDeliveryFailuresResult {
  failures: DeliveryFailure[];
  count: number;
  loading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
  dismiss: (bookingId: string) => Promise<void>;
}

// Full set — for the dashboard "delivery failures" card.
export function useDeliveryFailures(): UseDeliveryFailuresResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const refresh_ = useCallback(() => refresh(), []);
  const dismiss_ = useCallback((bookingId: string) => dismiss(bookingId), []);
  return {
    failures: snapshot.failures,
    count: snapshot.failures.length,
    loading: snapshot.loading,
    error: snapshot.error,
    refresh: refresh_,
    dismiss: dismiss_,
  };
}

// Per-booking selector — for the badge on a booking pill / the detail card.
// Returns the FailureInfo[] for this booking, or null.
export function useBookingDeliveryFailure(
  bookingId: string | null | undefined,
): FailureInfo[] | null {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => {
    if (!bookingId) return null;
    return snapshot.byBooking.get(bookingId) ?? null;
  }, [snapshot.byBooking, bookingId]);
}

/**
 * Customers whose last few WhatsApp sends were all undeliverable, so messages
 * to them are not arriving at all. For the Today card, where it changes the
 * advice from "a reminder didn't land" to "this number may not be on WhatsApp".
 */
export function useUnreachableHumans(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).unreachableHumans;
}
