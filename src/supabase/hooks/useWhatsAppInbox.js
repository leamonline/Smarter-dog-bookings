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
import { buildTemplateParams } from "../../constants/whatsappTemplates.js";
import { logger } from "../../lib/logger";
import {
  SEND_FUNCTION_PATH,
  parseSupabaseFunctionError,
} from "./inbox/helpers.js";
import { useOutboundSender } from "./inbox/useOutboundSender.js";
import { useConversationLifecycle } from "./inbox/useConversationLifecycle.js";
import { useAIModeControls } from "./inbox/useAIModeControls.js";
import { useBookingActionDecisions } from "./inbox/useBookingActionDecisions.js";
import { useDraftActions } from "./inbox/useDraftActions.js";
import { markWhatsappConversationRead } from "../rpc";


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
      channel,
      state,
      human_id,
      last_inbound_at,
      last_outbound_at,
      last_customer_text,
      unread_count,
      auto_send_enabled,
      autonomous_booking_enabled,
      lead_status,
      lead_payload,
      closed_at,
      closed_by,
      closure_reason,
      closure_suggested_at,
      closure_suggested_reason,
      humans:human_id ( name, surname ),
      whatsapp_drafts ( id, state, risk_level, handoff_required ),
      whatsapp_booking_actions ( id, state )
      `,
    )
    .order("last_inbound_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) throw error;

  // Fold "has a pending draft" into a boolean so the list item can
  // render a badge without keeping the draft array around.
  // Also surface a "needs_human_review" flag when any pending draft on
  // the conversation is high-risk or has handoff_required set, so the
  // list view can pin those to the top with a red marker.
  return (data ?? []).map((c) => {
    const pendingDrafts = Array.isArray(c.whatsapp_drafts)
      ? c.whatsapp_drafts.filter((d) => d.state === "pending")
      : [];
    return {
      ...c,
      has_pending_draft: pendingDrafts.length > 0,
      has_pending_booking_action: Array.isArray(c.whatsapp_booking_actions) &&
        c.whatsapp_booking_actions.some((a) => a.state === "pending"),
      needs_human_review: pendingDrafts.some(
        (d) => d.handoff_required === true || d.risk_level === "high",
      ),
    };
  });
}

async function fetchConversationDetail(conversationId) {
  const [messagesRes, draftRes, bookingActionsRes] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select("id, direction, content, sent_at, status, meta_message_id, channel, reaction_emoji, in_reply_to_meta_id")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: true })
      .limit(200),
    supabase
      .from("whatsapp_drafts")
      .select(
        "id, proposed_text, intent, confidence, state, created_at, tokens_input, tokens_output, model, risk_level, handoff_required, auto_send_eligible",
      )
      .eq("conversation_id", conversationId)
      .eq("state", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("whatsapp_booking_actions")
      .select("id, draft_id, action, payload, target_booking_id, state, rejection_reason, applied_booking_id, applied_at, error_message, created_at")
      .eq("conversation_id", conversationId)
      // Include applied + auto_applied so the thread can render inline
      // "Booking created" cards (task 5 of the May 2026 review pass).
      // BookingActionPanel pre-filters to state='pending' so it only
      // renders the queue waiting on staff approval.
      .in("state", ["pending", "applied", "auto_applied"])
      .order("created_at", { ascending: false })
      .limit(50),
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
  // `dogNames` is the array used by the template picker (it auto-fills the
  // first dog when staff picks a templated reply). `dogNamesById` is the
  // map BookingCreatedCard uses to resolve the dog name from a booking
  // action's `payload.dog_id` — without it the chip falls back to the
  // generic "this dog" placeholder even when we know the name.
  const [dogNames, setDogNames] = useState([]);
  const [dogNamesById, setDogNamesById] = useState({});
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
      logger.error("useWhatsAppInbox refreshList failed", err, {
        tags: { hook: "useWhatsAppInbox", op: "refreshList" },
      });
      setListError(err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Outbound (compose-new) sends — extracted into their own hook
  // because they don't share state with the rest of the inbox; only
  // refreshList() is shared, and they call it explicitly so the
  // newly-upserted conversation surfaces immediately.
  const { sendOutboundSMS, sendOutboundTemplate } = useOutboundSender({
    refreshList,
  });

  // Conversation state-transition callbacks (takeover / release /
  // resolve / reopen) — extracted because they're a coherent
  // semantic cluster operating on whatsapp_conversations and don't
  // need the rest of the inbox state.
  const {
    takeoverConversation,
    releaseConversation,
    resolveConversation,
    reopenConversation,
  } = useConversationLifecycle({
    selectedId,
    actionInFlight,
    setActionInFlight,
    conversations,
  });

  // AI-mode toggles (segmented control + per-conversation auto-send
  // and autonomous-booking flags). Optimistic updates with rollback
  // live in the dedicated hook so the InboxView never sees the
  // setConversations plumbing.
  const { setAutoSendEnabled, setAutonomousBookingEnabled, setAIMode } =
    useAIModeControls({
      selectedId,
      actionInFlight,
      setActionInFlight,
      conversations,
      setConversations,
    });

  // Apply / reject decisions on AI-attached booking proposals. The
  // RPC + UPDATE-row plumbing lives in the dedicated hook; this
  // monolith just forwards setters.
  const { applyBookingAction, rejectBookingAction } =
    useBookingActionDecisions({
      actionInFlight,
      setActionInFlight,
      setBookingActions,
      setConversations,
      selectedIdRef,
    });

  // Approve / reject / manual-reply actions on the thread's draft.
  // approveDraftAndApply also runs the booking-action RPC when the
  // draft has attached proposals.
  const { approveDraft, approveDraftAndApply, rejectDraft, sendManualReply } =
    useDraftActions({
      draft,
      attachedActions,
      actionInFlight,
      selectedId,
      setActionInFlight,
      setDraft,
      setBookingActions,
      setConversations,
      selectedIdRef,
    });

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
      // 10-second timeout so a stalled Supabase request can't leave
      // the thread spinner spinning forever (task 11 of the May 2026
      // review pass). The timeout fires a sentinel error that's
      // mapped to a friendly "Couldn't load — retry?" state below.
      const TIMEOUT_MS = 10_000;
      const detail = await Promise.race([
        fetchConversationDetail(conversationId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("conversation-detail-timeout")), TIMEOUT_MS),
        ),
      ]);
      // Guard against race: user may have moved on.
      if (selectedIdRef.current !== conversationId) return;
      setMessages(detail.messages);
      setDraft(detail.draft);
      setBookingActions(detail.bookingActions);
      setDetailError(null);
    } catch (err) {
      logger.error("useWhatsAppInbox refreshDetail failed", err, {
        tags: { hook: "useWhatsAppInbox", op: "refreshDetail" },
      });
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
    markWhatsappConversationRead(supabase, { conversationId }).then(
      ({ error }) => {
        if (error) {
          logger.warn("mark_whatsapp_conversation_read RPC error", {
            tags: { hook: "useWhatsAppInbox", op: "markRead" },
            extra: { message: error.message },
          });
        }
      },
    );

    await refreshDetail(conversationId);

    // Fetch dog names for template picker auto-fill + booking-action chip.
    const humanId = conversations.find((c) => c.id === conversationId)?.human_id;
    if (humanId) {
      const { data: dogsData } = await supabase
        .from("dogs")
        .select("id, name")
        .eq("human_id", humanId)
        .order("name");
      const rows = dogsData ?? [];
      setDogNames(rows.map((d) => d.name));
      const byId = {};
      for (const d of rows) {
        if (d?.id && d?.name) byId[d.id] = d.name;
      }
      setDogNamesById(byId);
    } else {
      setDogNames([]);
      setDogNamesById({});
    }
  }, [refreshDetail, conversations]);

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


  // ── Generate reply on demand (Phase G) ─────────────────────
  // Calls the whatsapp-generate-reply edge function, which authenticates
  // staff via JWT then forwards to whatsapp-agent with force_draft=true.
  // Used by the "Generate reply" button on the inbox thread — under the
  // new default (Human only) the agent doesn't auto-draft, so staff
  // explicitly trigger it when they want help drafting.
  const generateReplyForConversation = useCallback(async (conversationId) => {
    const id = conversationId ?? selectedId;
    if (!id) return { ok: false, reason: "no conversation selected" };
    const { error } = await supabase.functions.invoke("whatsapp-generate-reply", {
      body: { conversation_id: id },
    });
    if (error) {
      const detail = await parseSupabaseFunctionError(error, "Generate reply failed");
      return { ok: false, reason: detail };
    }
    // Realtime subscription on whatsapp_drafts will pick up the new
    // draft and refresh the thread automatically; no manual refetch.
    return { ok: true };
  }, [selectedId]);


  const sendTemplate = useCallback(
    async (template, paramValues) => {
      const conversation = conversations.find((c) => c.id === selectedId);
      if (!conversation) return;

      const params = buildTemplateParams(template, paramValues);

      const { error } = await supabase.functions.invoke(SEND_FUNCTION_PATH, {
        body: {
          mode: "template",
          to: conversation.phone_e164,
          template_name: template.name,
          language: template.language,
          params,
          conversation_id: conversation.id,
        },
      });

      if (error) {
        // FunctionsHttpError surfaces a generic "non-2xx" message and hides
        // the function's JSON body, which is where the actual reason lives
        // (Meta template errors, 24h-window rejections, etc). Read the body
        // via error.context (a Response) and prefer its `detail` field.
        let detail = error.message ?? "Template send failed";
        try {
          const body = await error.context?.json?.();
          if (body) {
            const parts = [body.error, body.detail].filter(Boolean);
            if (parts.length) detail = parts.join(": ");
          }
        } catch {
          /* fall back to the generic message */
        }
        throw new Error(detail);
      }

      // Refresh the thread so the sent message appears immediately.
      // The realtime subscription will also pick this up.
      await refreshDetail(selectedId);
    },
    [conversations, selectedId, refreshDetail],
  );

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
    setAutonomousBookingEnabled,
    setAIMode,
    resolveConversation,
    reopenConversation,
    sendTemplate,
    sendOutboundTemplate,
    sendOutboundSMS,
    generateReplyForConversation,
    dogNames,
    dogNamesById,
    actionInFlight,
    // manual refresh (rarely needed)
    refreshList,
  };
}
