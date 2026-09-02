// ============================================================
// src/supabase/hooks/useWhatsAppUnread.ts
//
// Tiny hook for the AppToolbar unread badge. Separate from
// useWhatsAppInbox deliberately — the full inbox hook fetches
// joined humans + draft flags + subscribes to three tables. The
// toolbar only needs one number, on every page. Running the heavy
// hook everywhere would waste realtime slots and render time.
//
// What it does:
//   - Fetches sum(unread_count) from whatsapp_conversations once
//   - Subscribes to whatsapp_conversations UPDATE/INSERT events and
//     refreshes when the count might have changed
//   - Returns { unread, loading }
//
// Why a module-level store:
//   The hook is mounted in more than one component at a time
//   (AppToolbar + WeekCalendarView). Calling supabase.channel() with
//   the same topic from two hook instances returns the already-
//   subscribed channel in supabase-js v2.10+, and the second .on()
//   then throws "cannot add postgres_changes callbacks ... after
//   subscribe()". A single shared channel + ref-counted listeners
//   sidesteps that and matches the original intent of avoiding
//   duplicate realtime slots.
//
// What it does NOT do:
//   - List conversations, load messages, or anything else the inbox
//     does. Use useWhatsAppInbox for that.
// ============================================================

import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../client";
import { CHANNELS } from "../realtimeChannels";
import { registerResume } from "../refreshOnResume.js";
import { logger } from "../../lib/logger";
import { e2eFixtureCount } from "./e2eFixtureCounts";

export interface WhatsAppUnreadState {
  unread: number;
  loading: boolean;
}

const e2eUnread = e2eFixtureCount(
  import.meta.env.VITE_E2E_WHATSAPP_UNREAD,
  import.meta.env.VITE_FORCE_OFFLINE === "1",
);
let state: WhatsAppUnreadState = {
  unread: e2eUnread,
  loading: true,
};
let channel: RealtimeChannel | null = null;
const listeners = new Set<() => void>();

function setState(next: Partial<WhatsAppUnreadState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

async function refresh(): Promise<void> {
  if (!supabase) {
    if (state.loading) setState({ loading: false });
    return;
  }
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("unread_count");

  if (error) {
    logger.warn("useWhatsAppUnread refresh failed", {
      tags: { hook: "useWhatsAppUnread", op: "refresh" },
      extra: { message: error.message },
    });
    setState({ loading: false });
    return;
  }
  const total = (data ?? []).reduce((s, r) => s + (r.unread_count || 0), 0);
  setState({ unread: total, loading: false });
}

function startChannel() {
  if (channel || !supabase) return;
  channel = supabase
    .channel(CHANNELS.whatsappToolbarUnread)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "whatsapp_conversations" },
      () => refresh(),
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "whatsapp_conversations" },
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

function getSnapshot(): WhatsAppUnreadState {
  return state;
}

// Reconcile the unread badge on resume so it isn't stale after the iPad
// wakes from sleep. Guarded on listeners.
registerResume(() => {
  if (listeners.size > 0) refresh();
});

export function useWhatsAppUnread(): WhatsAppUnreadState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
