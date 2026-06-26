// ============================================================
// src/supabase/hooks/usePendingSignupsCount.js
//
// Tiny hook for the AppToolbar "Humans" badge: how many self-signup
// customers are waiting for staff approval. A pending signup is a humans
// row with approved_at IS NULL, signup_submitted_at set, and not archived.
//
// Mirrors useWhatsAppUnread: a module-level store + a single ref-counted
// realtime channel + useSyncExternalStore, so mounting it in more than one
// place (toolbar header + mobile tab bar) shares one subscription rather
// than opening duplicate realtime slots.
//
// Staff RLS (staff_select_humans) lets a staff session count humans
// directly — no RPC needed. For a non-staff session RLS yields 0, which is
// the right default for a control that only appears in the staff app.
// ============================================================

import { useSyncExternalStore } from "react";
import { supabase } from "../client.js";
import { CHANNELS } from "../realtimeChannels";
import { registerResume } from "../refreshOnResume.js";
import { logger } from "../../lib/logger";

let state = { count: 0, loading: true };
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
  const { count, error } = await supabase
    .from("humans")
    .select("id", { count: "exact", head: true })
    .is("approved_at", null)
    .not("signup_submitted_at", "is", null)
    .is("archived_at", null);

  if (error) {
    logger.warn("usePendingSignupsCount refresh failed", {
      tags: { hook: "usePendingSignupsCount", op: "refresh" },
      extra: { message: error.message },
    });
    setState({ loading: false });
    return;
  }
  setState({ count: count ?? 0, loading: false });
}

function startChannel() {
  if (channel || !supabase) return;
  channel = supabase
    .channel(CHANNELS.pendingSignupsCount)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "humans" },
      () => refresh(),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "humans" },
      () => refresh(),
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "humans" },
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

// Reconcile on resume so the badge isn't stale after the iPad wakes.
registerResume(() => {
  if (listeners.size > 0) refresh();
});

export function usePendingSignupsCount() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
