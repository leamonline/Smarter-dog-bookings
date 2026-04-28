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
//   - the currently-selected conversation's messages, pending draft, and pending booking actions
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

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "../client.js";

const SEND_FUNCTION_PATH = "whatsapp-send";

// ── Pure helpers (exported for testing) ─────────────────────
// Filters the bookingActions list down to the actions attached to the
// current pending draft. An action is "attached" if its draft_id
// matches the draft's id AND it's still pending. Used by the inbox
// hook to gate the DraftPanel's Approve button on whether a booking
// proposal is hanging off the same draft.
export function filterAttachedActions(draft, bookingActions) {
  if (!draft) return [];
  if (!Array.isArray(bookingActions)) return [];
  return bookingActions.filter(
    (a) => a.draft_id === draft.id && a.state === "pending",
  );
}

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
      whatsapp_drafts ( id, state ),
      whatsapp_booking_actions ( id, state )
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
    has_pending_booking_action: Array.isArray(c.whatsapp_booking_actions) &&
      c.whatsapp_booking_actions.some((a) => a.state === "pending"),
  }));
}

async function fetchConversationDetail(conversationId) {
  const [messagesRes, draftRes, bookingActionsRes] = await Promise.all([
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
    supabase
      .from("whatsapp_booking_actions")
      .select("id, draft_id, action, payload, target_booking_id, state, rejection_reason, applied_booking_id, error_message, created_at")
      .eq("conversation_id", conversationId)
      .eq("state", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (messagesRes.error) throw messagesRes.error;
  // draftRes can return PGRST116 if maybeSingle found nothing — swallow
  if (draftRes.error && draftRes.error.code !== "PGRST116") throw draftRes.error;
  if (bookingActionsRes.error) throw bookingActionsRes.error;

  return {
    messages: messagesRes.data ?? [],
    draft: draftRes.data ?? null,
    bookingActions: bookingActionsRes.data ?? [],
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
  const [bookingActions, setBookingActions] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [actionInFlight, setActionInFlight] = useState(false);

  // Derived: actions attached to the currently-pending draft.
  // The DraftPanel uses this to switch from single Approve to the
  // Approve & Apply / Send reply only pair. See spec section
  // "Architecture" in 2026-04-28-two-approval-ux-coupling-design.md.
  const attachedActions = useMemo(
    () => filterAttachedActions(draft, bookingActions),
    [draft, bookingActions],
  );

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_booking_actions" },
        () => refreshList(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refreshList]);

  // ── Detail: load on selection + realtime ───────────────────
  const refreshDetail = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      const { messages: m, draft: d, bookingActions: a } = await fetchConversationDetail(conversationId);
      // Guard against race: user may have moved on.
      if (selectedIdRef.current !== conversationId) return;
      setMessages(m);
      setDraft(d);
      setBookingActions(a);
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
    setBookingActions([]);
    setDetailError(null);

    if (!conversationId || !supabase) return;

    // Optimistic: zero out the unread badge for this conversation
    // immediately. The RPC below + realtime echo will confirm, but
    // without this the list badge stays "2" for the round-trip and
    // looks broken. Only touch the one row — leave other counts alone.
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId && (c.unread_count ?? 0) > 0
          ? { ...c, unread_count: 0 }
          : c,
      ),
    );

    setLoadingDetail(true);
    // Mark as read via RPC (migration 029). Fire and forget; realtime
    // (migration 031) will reconcile any drift with the actual DB state.
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
      .on(
        "postgres_changes",
        {
          event: "*", schema: "public", table: "whatsapp_booking_actions",
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
      // Also flip the list-pane badge for this conversation so the
      // amber "draft pending" dot goes away at the same time as the
      // draft panel below the thread.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedIdRef.current ? { ...c, has_pending_draft: false } : c,
        ),
      );
      return { ok: true, result: data };
    } catch (err) {
      console.error("approveDraft:", err);
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [draft, actionInFlight]);

  // Approve the draft AND apply each attached booking_action in one go.
  // Order: apply each action sequentially (stop on first error), then
  // send the reply only if all applies succeeded. If apply fails, no
  // reply is sent and the error is surfaced. If apply succeeds and the
  // subsequent send fails, the booking is real and the error message
  // tells staff to send manually. See spec "Failure modes" table.
  //
  // Falls through to plain approveDraft when no actions are attached —
  // keeps the call site agnostic about whether to call this or that.
  const approveDraftAndApply = useCallback(async ({ editedText } = {}) => {
    if (!draft || actionInFlight) {
      return { ok: false, reason: "no draft or action in flight" };
    }
    if (attachedActions.length === 0) {
      return approveDraft({ editedText });
    }

    setActionInFlight(true);
    try {
      // 1. Apply each attached action sequentially. Stop on first error.
      const applied = [];
      for (const action of attachedActions) {
        const { data: bookingId, error: applyError } = await supabase.rpc(
          "apply_whatsapp_booking_action",
          { p_action_id: action.id },
        );
        if (applyError) {
          const dogLabel = action.payload?.dog_name ?? "booking";
          return {
            ok: false,
            reason: `Apply failed for ${dogLabel}: ${applyError.message}`,
            appliedSoFar: applied,
          };
        }
        applied.push({ actionId: action.id, bookingId });
      }

      // 2. Optimistic: clear applied actions from local state so the
      //    BookingActionPanel doesn't briefly show them as pending.
      setBookingActions((prev) =>
        prev.filter((a) => !applied.some((x) => x.actionId === a.id)),
      );

      // 3. Send the reply via the whatsapp-send Edge Function.
      const { data: sendData, error: sendError } = await supabase.functions
        .invoke(SEND_FUNCTION_PATH, {
          body: {
            mode: "draft",
            draft_id: draft.id,
            ...(editedText ? { edited_text: editedText } : {}),
          },
        });
      if (sendError || sendData?.error) {
        const reason = sendError?.message ?? sendData?.error ?? "Send failed";
        return {
          ok: false,
          reason: `${reason} (booking was applied — please send the reply manually)`,
          appliedSoFar: applied,
        };
      }

      // 4. Optimistic: clear the pending draft and flip both list-pane
      //    badges off (mirrors approveDraft's optimistic update).
      setDraft(null);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedIdRef.current
            ? { ...c, has_pending_draft: false, has_pending_booking_action: false }
            : c,
        ),
      );

      return { ok: true, applied, sendResult: sendData };
    } catch (err) {
      console.error("approveDraftAndApply:", err);
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [draft, attachedActions, actionInFlight, approveDraft]);

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
      // Same optimistic list-badge flip as approveDraft — amber dot off.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedIdRef.current ? { ...c, has_pending_draft: false } : c,
        ),
      );
      return { ok: true };
    } catch (err) {
      console.error("rejectDraft:", err);
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [draft, actionInFlight]);

  // Send a staff-typed manual reply. No AI draft involved — this is
  // the compose-box path. whatsapp-send (mode:"manual") handles the
  // 24h-window check, Meta call, and recording the outbound message
  // to whatsapp_messages. Returns { ok, reason?, result? } in the
  // same shape as approveDraft so the caller can render errors.
  const sendManualReply = useCallback(async ({ text } = {}) => {
    if (!selectedId || actionInFlight) {
      return { ok: false, reason: "no conversation selected or action in flight" };
    }
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return { ok: false, reason: "empty message" };

    setActionInFlight(true);
    try {
      const { data, error } = await supabase.functions.invoke(SEND_FUNCTION_PATH, {
        body: {
          mode: "manual",
          conversation_id: selectedId,
          text: trimmed,
        },
      });

      if (error) {
        return { ok: false, reason: error.message ?? String(error), detail: data };
      }
      if (data?.error) {
        return { ok: false, reason: data.error, detail: data };
      }

      // Optimistic: realtime subscription on whatsapp_messages will
      // fold the new row into the thread. Nothing to do here.
      return { ok: true, result: data };
    } catch (err) {
      console.error("sendManualReply:", err);
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight]);

  const applyBookingAction = useCallback(async (actionId) => {
    if (!actionId || actionInFlight) return { ok: false, reason: "no action or action in flight" };
    setActionInFlight(true);
    try {
      const { data, error } = await supabase.rpc("apply_whatsapp_booking_action", {
        p_action_id: actionId,
      });
      if (error) throw error;
      setBookingActions((prev) => {
        const next = prev.filter((action) => action.id !== actionId);
        setConversations((conversationsPrev) =>
          conversationsPrev.map((c) =>
            c.id === selectedIdRef.current
              ? { ...c, has_pending_booking_action: next.length > 0 }
              : c,
          ),
        );
        return next;
      });
      return { ok: true, bookingId: data };
    } catch (err) {
      console.error("applyBookingAction:", err);
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [actionInFlight]);

  const rejectBookingAction = useCallback(async (actionId, reason = "") => {
    if (!actionId || actionInFlight) return { ok: false, reason: "no action or action in flight" };
    setActionInFlight(true);
    try {
      const { error } = await supabase
        .from("whatsapp_booking_actions")
        .update({
          state: "rejected",
          rejection_reason: typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null,
          decided_at: new Date().toISOString(),
        })
        .eq("id", actionId)
        .eq("state", "pending");
      if (error) throw error;
      setBookingActions((prev) => {
        const next = prev.filter((action) => action.id !== actionId);
        setConversations((conversationsPrev) =>
          conversationsPrev.map((c) =>
            c.id === selectedIdRef.current
              ? { ...c, has_pending_booking_action: next.length > 0 }
              : c,
          ),
        );
        return next;
      });
      return { ok: true };
    } catch (err) {
      console.error("rejectBookingAction:", err);
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [actionInFlight]);

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

  // Per-conversation auto-send opt-in. The agent only auto-sends a
  // draft when ALL of the following are true:
  //   1. AI_AUTO_SEND_LOW_RISK env flag on the function is 'true'
  //   2. This row's auto_send_enabled is true (set here)
  //   3. The draft itself is low-risk + handoff-free + in the auto-send
  //      intent allowlist (computed by the agent at draft time)
  // Optimistic: flip the local list state immediately so the toggle
  // feels instant; realtime subscription will reconcile.
  const setAutoSendEnabled = useCallback(async (enabled) => {
    if (!selectedId || actionInFlight) return { ok: false };
    setActionInFlight(true);
    const next = !!enabled;
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, auto_send_enabled: next } : c)),
    );
    try {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ auto_send_enabled: next })
        .eq("id", selectedId);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      console.error("setAutoSendEnabled:", err);
      // Roll back the optimistic flip.
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, auto_send_enabled: !next } : c)),
      );
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
    bookingActions,
    attachedActions,
    loadingDetail,
    detailError,
    // actions
    selectConversation,
    approveDraft,
    approveDraftAndApply,
    rejectDraft,
    sendManualReply,
    applyBookingAction,
    rejectBookingAction,
    takeoverConversation,
    releaseConversation,
    setAutoSendEnabled,
    actionInFlight,
    // manual refresh (rarely needed)
    refreshList,
  };
}
