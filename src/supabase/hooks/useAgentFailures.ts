// ============================================================
// src/supabase/hooks/useAgentFailures.ts
//
// Surfaces whatsapp_events rows the agent marked processing_status='failed'
// (it swallows post-validation throws into an HTTP 200, so the only signal is
// error_message here, not the edge logs). Staff-only SELECT RLS already exists
// on whatsapp_events, so this is read-only — no migration. Mirrors
// useDeliveryFailures: module singleton + useSyncExternalStore + one realtime
// channel.
// ============================================================
import { useSyncExternalStore, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../client";
import { CHANNELS } from "../realtimeChannels";
import { registerResume } from "../refreshOnResume.js";
import { logger } from "../../lib/logger";
import type { Database } from "../database.types";

type WhatsAppEventRow = Database["public"]["Tables"]["whatsapp_events"]["Row"];

/** The columns refresh() selects; the shaper accepts partial rows so tests can feed fixtures. */
export type AgentFailureSourceRow = Pick<
  WhatsAppEventRow,
  "id" | "phone_e164" | "processing_status" | "error_message" | "received_at" | "event_type"
>;

/** The card-shaped failure the dashboard renders. */
export interface AgentFailure {
  id: string;
  phone: string;
  error: string;
  at: string | null;
  eventType: string | null;
}

interface AgentFailuresState {
  failures: AgentFailure[];
  loading: boolean;
  error: unknown;
}

const LOOKBACK_DAYS = 7;
const IS_TEST = import.meta.env?.MODE === "test";

export function shapeAgentFailures(
  rows: ReadonlyArray<Partial<AgentFailureSourceRow> & { id: string }> | null | undefined,
): AgentFailure[] {
  // The failed-status filter is a no-op against refresh()'s query (which already
  // filters server-side) but is load-bearing for the unit test, which feeds in
  // mixed-status rows. Keep it — don't "tidy" it away.
  return (rows ?? [])
    .filter((r) => r.processing_status === "failed")
    .map((r) => ({
      id: r.id,
      phone: r.phone_e164 ?? "",
      error: r.error_message ?? "Unknown error",
      at: r.received_at ?? null,
      eventType: r.event_type ?? null,
    }))
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}

let state: AgentFailuresState = { failures: [], loading: true, error: null };
let channel: RealtimeChannel | null = null;
const listeners = new Set<() => void>();

function setState(next: Partial<AgentFailuresState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

async function refresh(): Promise<void> {
  if (!supabase || IS_TEST) {
    if (state.loading) setState({ loading: false });
    return;
  }
  setState({ error: null });
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
    const { data, error } = await supabase
      .from("whatsapp_events")
      .select("id, phone_e164, processing_status, error_message, received_at, event_type")
      .eq("processing_status", "failed")
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    setState({ failures: shapeAgentFailures(data), loading: false });
  } catch (err) {
    logger.error("useAgentFailures fetch failed", err, {
      tags: { hook: "useAgentFailures", op: "fetch" },
    });
    setState({ error: err, loading: false });
  }
}

function startChannel() {
  if (channel || !supabase || IS_TEST) return;
  channel = supabase
    .channel(CHANNELS.dashboardAgentFailures)
    .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_events" }, () => refresh())
    .subscribe();
}

function stopChannel() {
  if (!channel || !supabase) return;
  supabase.removeChannel(channel);
  channel = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) { startChannel(); refresh(); }
  return () => { listeners.delete(listener); if (listeners.size === 0) stopChannel(); };
}

function getSnapshot(): AgentFailuresState { return state; }

registerResume(() => { if (listeners.size > 0) refresh(); });

export interface UseAgentFailuresResult extends AgentFailuresState {
  count: number;
  refresh: () => Promise<void>;
}

export function useAgentFailures(): UseAgentFailuresResult {
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
