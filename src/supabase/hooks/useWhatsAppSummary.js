// ============================================================
// src/supabase/hooks/useWhatsAppSummary.js
//
// Dashboard-sidebar summary for the WhatsApp side of the app.
//
// We deliberately lead with "awaiting reply" rather than a flat
// 24-hour activity count. On a busy Monday morning the 24h number
// includes the whole weekend, which is noise — what the person
// looking at the dashboard actually needs to know is: how many
// customers am I late to respond to, and are there any AI drafts
// sitting in the review queue.
//
// Returns:
//   {
//     awaitingReply,   // # conversations whose most recent message is inbound
//                      // AND has not yet been replied to by us.
//                      // Proxied via unread_count > 0 (trigger-maintained).
//     draftsPending,   // # rows in whatsapp_drafts where state = 'pending'
//     conversationsToday, // # distinct conversations touched in last 24h
//     recentConversations, // last 5 conversations by last_inbound_at,
//                      // de-duped per person (one row per conversation):
//                      // [{ conversationId, humanId, displayName, lastText, lastAt }]
//     aiSummary,       // { text, awaitingCount, generatedAt, fromCache, loading, error }
//     loading,
//     refreshAiSummary, // manual refresh trigger for the AI summary line
//   }
//
// Realtime: subscribes to whatsapp_conversations + whatsapp_drafts so
// the dashboard updates without a refresh.
//
// Why a module-level store:
//   WhatsAppInboxCard is rendered in two places at once on the
//   Bookings page (UtilityTabs for tablets, RightWorkflowSidebar for
//   desktop — both mount, only one is visible per breakpoint via CSS).
//   Calling supabase.channel() with the same topic from two hook
//   instances returns the already-subscribed channel in supabase-js
//   v2.10+, and the second .on() then throws "cannot add
//   postgres_changes callbacks ... after subscribe()". A single
//   shared channel + ref-counted listeners sidesteps that — same
//   shape as useWhatsAppUnread.
// ============================================================

import { useSyncExternalStore, useCallback } from "react";
import { supabase } from "../client.js";
import { formatPhoneForDisplay } from "../../utils/phone.js";
import { logger } from "../../lib/logger.js";

const DAY_MS = 24 * 60 * 60 * 1000;

let state = {
  awaitingReply: 0,
  draftsPending: 0,
  conversationsToday: 0,
  recentConversations: [],
  aiSummary: {
    text: "",
    awaitingCount: 0,
    generatedAt: null,
    fromCache: false,
    loading: false,
    error: null,
  },
  loading: true,
};

let countsChannel = null;
let summaryChannel = null;
const listeners = new Set();

function setState(next) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function setAiSummary(next) {
  const nextAi = typeof next === "function" ? next(state.aiSummary) : next;
  state = { ...state, aiSummary: { ...state.aiSummary, ...nextAi } };
  for (const listener of listeners) listener();
}

async function refresh() {
  if (!supabase) {
    if (state.loading) setState({ loading: false });
    return;
  }

  // Three parallel queries — each tiny. Doing this client-side keeps
  // us from having to maintain a Postgres function just for a
  // dashboard widget. At Smarter Dog scale (tens of conversations)
  // this is fine; if it ever isn't, promote to an RPC.
  const sinceIso = new Date(Date.now() - DAY_MS).toISOString();

  const [convs, drafts, recentMsgs, recentConvsRes] = await Promise.all([
    // Conversations with unread_count > 0 is our proxy for
    // "awaiting reply". It's maintained by the AFTER INSERT trigger
    // (migration 029) and reset to 0 by mark_whatsapp_conversation_read.
    // Imperfect — a staff member could mark-read without replying —
    // but good enough for an at-a-glance number.
    supabase
      .from("whatsapp_conversations")
      .select("id", { count: "exact", head: true })
      .gt("unread_count", 0),

    // Drafts waiting for a human to approve/reject.
    supabase
      .from("whatsapp_drafts")
      .select("id", { count: "exact", head: true })
      .eq("state", "pending"),

    // Conversations touched in the last 24h (either direction).
    // We select conversation_id and de-dupe client-side so we don't
    // need a DISTINCT in the URL query.
    supabase
      .from("whatsapp_messages")
      .select("conversation_id")
      .gte("sent_at", sinceIso),

    // Last 5 conversations by most recent inbound activity. One row
    // per person — clicking from the dashboard deep-links into that
    // conversation's chat log.
    supabase
      .from("whatsapp_conversations")
      .select(
        "id, phone_e164, human_id, last_customer_text, last_inbound_at, humans:human_id(name, surname)",
      )
      .order("last_inbound_at", { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  if (convs.error) {
    logger.warn("useWhatsAppSummary convs failed", {
      tags: { hook: "useWhatsAppSummary", op: "fetch.convs" },
      extra: { message: convs.error.message },
    });
  }
  if (drafts.error) {
    logger.warn("useWhatsAppSummary drafts failed", {
      tags: { hook: "useWhatsAppSummary", op: "fetch.drafts" },
      extra: { message: drafts.error.message },
    });
  }
  if (recentMsgs.error) {
    logger.warn("useWhatsAppSummary recent failed", {
      tags: { hook: "useWhatsAppSummary", op: "fetch.recentMsgs" },
      extra: { message: recentMsgs.error.message },
    });
  }
  if (recentConvsRes.error) {
    logger.warn("useWhatsAppSummary recentConvs failed", {
      tags: { hook: "useWhatsAppSummary", op: "fetch.recentConvs" },
      extra: { message: recentConvsRes.error.message },
    });
  }

  const uniqueConvIds = new Set((recentMsgs.data ?? []).map((r) => r.conversation_id));

  const recentConversations = (recentConvsRes.data ?? []).map((c) => {
    const human = c.humans;
    const name = [human?.name, human?.surname].filter(Boolean).join(" ").trim();
    return {
      conversationId: c.id,
      humanId: c.human_id || null,
      displayName: name || formatPhoneForDisplay(c.phone_e164) || "Unknown contact",
      lastText: c.last_customer_text ?? "",
      lastAt: c.last_inbound_at,
    };
  });

  setState({
    awaitingReply: convs.count ?? 0,
    draftsPending: drafts.count ?? 0,
    conversationsToday: uniqueConvIds.size,
    recentConversations,
    loading: false,
  });
}

async function refreshAiSummary() {
  if (!supabase) return;
  setAiSummary({ loading: true, error: null });
  try {
    const { data, error } = await supabase.functions.invoke("dashboard-summary", {
      body: {},
    });
    if (error) {
      // Edge function might not be deployed yet on first install —
      // fail silently and let the card show the count without the
      // summary line. Surface the error in state for debugging.
      setAiSummary({
        loading: false,
        error: error.message ?? "Summary unavailable",
      });
      return;
    }
    setAiSummary({
      text: data?.summary ?? "",
      awaitingCount: data?.awaitingCount ?? 0,
      generatedAt: data?.generatedAt ?? null,
      fromCache: data?.fromCache === true,
      loading: false,
      error: null,
    });
  } catch (err) {
    setAiSummary({
      loading: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function startChannels() {
  if (!supabase) return;

  // Two channels with deliberately different cadences:
  //
  //   1. Counts (refresh) — runs on every conversation/draft change
  //      because awaiting/draft counts can change on read-receipts,
  //      draft approvals, etc. These are cheap COUNT() queries.
  //
  //   2. AI summary (refreshAiSummary) — runs ONLY when a new
  //      inbound customer message arrives. Read receipts, draft
  //      state flips, conversation updates etc. don't re-summarise
  //      because the underlying message content hasn't changed.
  //      Even though the server-side cache would no-op such calls,
  //      we don't want the "Summarising…" placeholder to flicker
  //      every time staff opens a thread and marks it read.
  if (!countsChannel) {
    countsChannel = supabase
      .channel("whatsapp-dashboard-counts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_conversations" },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_conversations" },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_drafts" },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_drafts" },
        () => refresh(),
      )
      .subscribe();
  }

  if (!summaryChannel) {
    summaryChannel = supabase
      .channel("whatsapp-dashboard-summary")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          if (payload?.new?.direction === "inbound") refreshAiSummary();
        },
      )
      .subscribe();
  }
}

function stopChannels() {
  if (countsChannel) {
    supabase.removeChannel(countsChannel);
    countsChannel = null;
  }
  if (summaryChannel) {
    supabase.removeChannel(summaryChannel);
    summaryChannel = null;
  }
}

function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    startChannels();
    refresh();
    refreshAiSummary();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopChannels();
  };
}

function getSnapshot() {
  return state;
}

export function useWhatsAppSummary() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // Stable callback so consumers can pass it to deps arrays without
  // re-triggering effects on every render. The underlying refreshAiSummary
  // is module-level, so the reference itself never changes.
  const triggerRefreshAiSummary = useCallback(() => refreshAiSummary(), []);
  return { ...snapshot, refreshAiSummary: triggerRefreshAiSummary };
}
