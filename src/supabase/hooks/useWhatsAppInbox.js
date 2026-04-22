// ============================================================
// src/supabase/hooks/useWhatsAppInbox.js
//
// Data hook for the staff WhatsApp inbox at /whatsapp.
// Mirrors the existing hook pattern from useBookings / useHumans:
//   - owns the fetch + subscribe lifecycle
//   - exposes read data + action callbacks
//   - delegates mutations to Edge Functions where appropriate
//
// What it owns:
//   - conversations list (with joined human name + pending draft indicator)
//   - the currently-selected conversation's messages and pending draft
//   - approve/edit/reject/takeover actions
//   - optimistic state so the UI feels snappy
//
// What it does NOT own:
//   - sending the actual WhatsApp message — that's whatsapp-send Edge Function
//   - template-based sending (reminders) — use whatsapp-send directly
//
// Realtime: subscribes to whatsapp_messages and whatsapp_drafts so the
// inbox refreshes when Meta sends something new OR the agent drops a
// fresh draft. Subscription is scoped by the authenticated session, so
// RLS keeps it honest.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../client.js";

const SEND_FUNCTION_PATH = "whatsapp-send";

// ── Fetchers ─────────────────────────────────────────────────
async function fetchConversationsList() {
  // We denormalise unread_count, last_customer_text, last_inbound_at
  // onto the conversation row specifically so this query is cheap.
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select(
      `
      id,
      phone_e164,
      state,
      human_id,
      last_inbound_at,
      last_outbound_at,
      last_customer_text,
      unread_count,
      auto_send_enabled,
      humans:human_id ( name, surname ),
      whatsapp_drafts ( id, state )
      `,
    )
    .order("last_inbound_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) throw error;

  // Fold "has a pending draft" into a boolean so the list item can
  // render a badge without keeping the draft array around.
  return (data ?? []).map((c) => ({
    ...c,
    has_pending_draft: Array.isArray(c.whatsapp_drafts) &&
      c.whatsapp_drafts.some((d) => d.state === "pending"),
  }));
}

async function fetchConversationDetail(conversationId) {
  const [messagesRes, draftRes] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select("id, direction, content, sent_at, status, meta_message_id")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: true })
      .limit(200),
    supabase
      .from("whatsapp_drafts")
      .select(
        "id, proposed_text, intent, confidence, state, created_at, tokens_input, tokens_output, model",
      )
      .eq("conversation_id", conversationId)
      .eq("state", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (messagesRes.error) throw messagesRes.error;
  // draftRes can return PGRST116 if maybeSingle found nothing — swallow
  if (draftRes.error && draftRes.error.code !== "PGRST116") throw draftRes.error;

  return {
    messages: messagesRes.data ?? [],
    draft: draftRes.data ?? null,
  };
}

// ── The hook ─────────────────────────────────────────────────
export function useWhatsAppInbox() {
  const [conversations, setConversations] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [actionInFlight, setActionInFlight] = useState(false);

  const selectedIdRef = useRef(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // ── List: initial load + realtime ──────────────────────────
  const refreshList = useCallback(async () => {
    try {
      const list = await fetchConversationsList();
      setConversations(list);
      setListError(null);
    } catch (err) {
      console.error("useWhatsAppInbox refreshList:", err);
      setListError(err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoadingList(false);
      return;
    }
    refreshList();

    const channel = supabase
      .channel("whatsapp-inbox-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations" },
        () => refreshList(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_drafts" },
        () => refreshList(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refreshList]);

  // ── Detail: load on selection + realtime ───────────────────
  const refreshDetail = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      const { messages: m, draft: d } = await fetchConversationDetail(conversationId);
      // Guard against race: user may have moved on.
      if (selectedIdRef.current !== conversationId) return;
      setMessages(m);
      setDraft(d);
      setDetailError(null);
    } catch (err) {
      console.error("useWhatsAppInbox refreshDetail:", err);
      setDetailError(err);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const selectConversation = useCallback(async (conversationId) => {
    setSelectedId(conversationId);
    setMessages([]);
    setDraft(null);
    setDetailError(null);

    if (!conversationId || !supabase) return;

    setLoadingDetail(true);
    // Mark as read via RPC (migration 029). Fire and forget; the UI
    // already shows unread=0 because the list will refresh from realtime.
    supabase
      .rpc("mark_whatsapp_conversation_read", { p_conversation_id: conversationId })
      .then(({ error }) => {
        if (error) console.warn("mark_whatsapp_conversation_read:", error.message);
      });

    await refreshDetail(conversationId);
  }, [refreshDetail]);

  // Realtime for the currently-selected conversation
  useEffect(() => {
    if (!supabase || !selectedId) return;
    const channel = supabase
      .channel(`whatsapp-inbox-detail-${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "*", schema: "public", table: "whatsapp_messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        () => refreshDetail(selectedId),
      )
      .on(
        "postgres_changes",
        {
          event: "*", schema: "public", table: "whatsapp_drafts",
          filter: `conversation_id=eq.${selectedId}`,
        },
        () => refreshDetail(selectedId),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedId, refreshDetail]);

  // ── Actions ────────────────────────────────────────────────
  const approveDraft = useCallback(async ({ editedText } = {}) => {
    if (!draft || actionInFlight) return { ok: false, reason: "no draft or action in flight" };
    setActionInFlight(true);
    try {
      // Invoke the whatsapp-send Edge Function with the user's JWT so
      // it can verify staff membership and return.
      const { data, error } = await supabase.functions.invoke(SEND_FUNCTION_PATH, {
        body: {
          mode: "draft",
          draft_id: draft.id,
          ...(editedText ? { edited_text: editedText } : {}),
        },
      });

      if (error) {
        // Surface Meta errors verbatim — staff can act on them.
        return { ok: false, reason: error.message ?? String(error), detail: data };
      }
      if (data?.error) {
        return { ok: false, reason: data.error, detail: data };
      }

      // Optimistic: clear the pending draft so the UI doesn't show the
      // approve buttons twice; the realtime refresh will confirm.
      setDraft(null);
      return { ok: true, result: data };
    } catch (err) {
      console.error("approveDraft:", err);
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [draft, actionInFlight]);

  // rejectDraft accepts an optional free-text reason so we can learn
  // WHY the draft was wrong. Reason is stored on the draft row itself
  // (see migration 030). Null reason is allowed — some rejects are
  // self-explanatory and forcing a reason adds friction that would
  // make staff click "approve" on mediocre drafts just to clear them.
  const rejectDraft = useCallback(async ({ reason } = {}) => {
    if (!draft || actionInFlight) return { ok: false };
    setActionInFlight(true);
    try {
      const trimmed = typeof reason === "string" ? reason.trim() : "";
      const { error } = await supabase
        .from("whatsapp_drafts")
        .update({
          state: "rejected",
          decided_at: new Date().toISOString(),
          // Cap at 500 chars — long enough for "tone too formal, we'd
          // say 'pop along' not 'visit our premises'", short enough to
          // scan a column of them later.
          rejected_reason: trimmed ? trimmed.slice(0, 500) : null,
        })
        .eq("id", draft.id)
        .eq("state", "pending");
      if (error) throw error;
      setDraft(null);
      return { ok: true };
    } catch (err) {
      console.error("rejectDraft:", err);
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [draft, actionInFlight]);

  const takeoverConversation = useCallback(async () => {
    if (!selectedId || actionInFlight) return { ok: false };
    setActionInFlight(true);
    try {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ state: "human_takeover" })
        .eq("id", selectedId);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      console.error("takeoverConversation:", err);
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight]);

  const releaseConversation = useCallback(async () => {
    if (!selectedId || actionInFlight) return { ok: false };
    setActionInFlight(true);
    try {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ state: "ai_handling" })
        .eq("id", selectedId);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      console.error("releaseConversation:", err);
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight]);

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  return {
    // list
    conversations,
    loadingList,
    listError,
    // detail
    selectedId,
    selectedConversation,
    messages,
    draft,
    loadingDetail,
    detailError,
    // actions
    selectConversation,
    approveDraft,
    rejectDraft,
    takeoverConversation,
    releaseConversation,
    actionInFlight,
    // manual refresh (rarely needed)
    refreshList,
  };
}
