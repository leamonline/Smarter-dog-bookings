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
//     awaitingReply,   // # conversations where last inbound is newer than
//                      // last outbound (read/unread state is irrelevant).
//     draftsPending,   // # rows in whatsapp_drafts where state = 'pending'
//     conversationsToday, // # distinct conversations touched in last 24h
//     loading,
//   }
//
// Realtime: subscribes to conversations, drafts, and messages so all
// three summary numbers stay current without a refresh.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function useWhatsAppSummary() {
  const [summary, setSummary] = useState({
    awaitingReply: 0,
    draftsPending: 0,
    conversationsToday: 0,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Three parallel queries — each tiny. Doing this client-side keeps
    // us from having to maintain a Postgres function just for a
    // dashboard widget. At Smarter Dog scale (tens of conversations)
    // this is fine; if it ever isn't, promote to an RPC.
    const sinceIso = new Date(Date.now() - DAY_MS).toISOString();

    const [convs, drafts, recentMsgs] = await Promise.all([
      // Conversations whose latest inbound customer message has not
      // yet been followed by an outbound reply. This deliberately does
      // not use unread_count because opening a thread marks it read.
      supabase
        .from("whatsapp_conversations")
        .select("id, last_inbound_at, last_outbound_at")
        .not("last_inbound_at", "is", null),

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
    ]);

    if (convs.error) console.warn("useWhatsAppSummary convs:", convs.error.message);
    if (drafts.error) console.warn("useWhatsAppSummary drafts:", drafts.error.message);
    if (recentMsgs.error) console.warn("useWhatsAppSummary recent:", recentMsgs.error.message);

    const awaitingReply = (convs.data ?? []).filter((conversation) => {
      if (!conversation.last_inbound_at) return false;
      if (!conversation.last_outbound_at) return true;
      return new Date(conversation.last_inbound_at) > new Date(conversation.last_outbound_at);
    }).length;
    const uniqueConvIds = new Set((recentMsgs.data ?? []).map((r) => r.conversation_id));

    setSummary({
      awaitingReply,
      draftsPending: drafts.count ?? 0,
      conversationsToday: uniqueConvIds.size,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    if (!supabase) return;

    const channel = supabase
      .channel("whatsapp-dashboard-summary")
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        () => refresh(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return { ...summary, loading };
}
