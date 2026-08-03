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
import { supabase } from "../client";
import { CHANNELS } from "../realtimeChannels";
import { buildTemplateParams } from "../../constants/whatsappTemplates.js";
import {
  SAMPLE_WHATSAPP_CONVERSATIONS,
  SAMPLE_WHATSAPP_DOG_NAMES,
  SAMPLE_WHATSAPP_DRAFTS,
  SAMPLE_WHATSAPP_MESSAGES,
} from "../../data/sample.js";
import { logger } from "../../lib/logger";
import {
  SEND_FUNCTION_PATH,
  parseSupabaseFunctionError,
} from "./inbox/helpers.js";
import { useOutboundSender } from "./inbox/useOutboundSender.js";
import { useConversationLifecycle } from "./inbox/useConversationLifecycle.js";
import { useConversationNotes } from "./inbox/useConversationNotes.js";
import { useStaffBooking } from "./inbox/useStaffBooking.js";
import { useAIModeControls } from "./inbox/useAIModeControls.js";
import { useBookingActionDecisions } from "./inbox/useBookingActionDecisions.js";
import { useDraftActions } from "./inbox/useDraftActions.js";
import { markWhatsappConversationRead } from "../rpc";
import { registerResume } from "../refreshOnResume.js";

const DETAIL_TIMEOUT_MS = 10_000;


// ── Pure helpers (exported for testing) ─────────────────────
// Filters the bookingActions list down to the actions attached to the
// current pending draft. An action is "attached" if its draft_id
// matches the draft's id AND it's still pending. Used by the inbox
// hook to withhold DraftPanel reply controls while a booking proposal
// is hanging off the same draft.
export function filterAttachedActions(draft, bookingActions) {
  if (!draft) return [];
  if (!Array.isArray(bookingActions)) return [];
  return bookingActions.filter(
    (a) => a.draft_id === draft.id && a.state === "pending",
  );
}

export function latestMessagesChronological(rows) {
  return [...(rows ?? [])].reverse();
}

export function getSelectedConversationForSend(conversations, selectedId) {
  const conversation = conversations.find((c) => c.id === selectedId);
  if (!conversation) {
    throw new Error("Selected conversation is no longer available");
  }
  return conversation;
}

export function mergeFailedMessageFlags(conversations, failedMessages) {
  const latestByConversation = new Map();
  for (const message of failedMessages ?? []) {
    if (!message?.conversation_id) continue;
    const current = latestByConversation.get(message.conversation_id);
    if (!current || String(message.sent_at || "") > String(current.sent_at || "")) {
      latestByConversation.set(message.conversation_id, message);
    }
  }

  return (conversations ?? []).map((conversation) => {
    const latest = latestByConversation.get(conversation.id) ?? null;
    // Only flag the conversation while the failure is still the most
    // recent outbound. recordOutbound bumps last_outbound_at to each
    // send's timestamp, so a successful resend moves last_outbound_at
    // PAST the failed message — at which point the badge should clear.
    // A failure that is still the latest outbound has sent_at >=
    // last_outbound_at (they were stamped together at record time).
    const unresolved =
      !!latest &&
      String(latest.sent_at || "") >= String(conversation.last_outbound_at || "");
    return {
      ...conversation,
      has_failed_message: unresolved,
      latest_failed_message: unresolved ? latest : null,
    };
  });
}

// ── Fetchers ─────────────────────────────────────────────────
async function fetchConversationsList({ includeBookingWorkspaceData = false } = {}) {
  // We denormalise unread_count, last_customer_text, last_inbound_at
  // onto the conversation row specifically so this query is cheap.
  const humanSelection = includeBookingWorkspaceData
    ? "humans:human_id ( name, surname, dogs ( id, name, breed, size ) )"
    : "humans:human_id ( name, surname )";
  const draftSelection = includeBookingWorkspaceData
    ? "whatsapp_drafts ( id, state, intent, risk_level, handoff_required, created_at )"
    : "whatsapp_drafts ( id, state, risk_level, handoff_required )";
  const bookingActionSelection = includeBookingWorkspaceData
    ? "whatsapp_booking_actions ( id, state, action, payload, created_at )"
    : "whatsapp_booking_actions ( id, state )";
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
      last_message_text,
      last_message_direction,
      last_message_at,
      unread_count,
      auto_send_enabled,
      autonomous_booking_enabled,
      ${includeBookingWorkspaceData ? "agent_state," : ""}
      lead_status,
      lead_payload,
      closed_at,
      closed_by,
      closure_reason,
      closure_suggested_at,
      closure_suggested_reason,
      notes,
      ${humanSelection},
      ${draftSelection},
      ${bookingActionSelection}
      `,
    )
    // Sort by the same "last activity" value the row now displays
    // (last message in either direction), falling back to last_inbound_at
    // for any row not yet backfilled.
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("last_inbound_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) throw error;

  // Fold "has a pending draft" into a boolean so the list item can
  // render a badge without keeping the draft array around.
  // Also surface a "needs_human_review" flag when any pending draft on
  // the conversation is high-risk or has handoff_required set, so the
  // list view can pin those to the top with a red marker.
  const list = (data ?? []).map((c) => {
    const pendingDrafts = Array.isArray(c.whatsapp_drafts)
      ? c.whatsapp_drafts.filter((d) => d.state === "pending")
      : [];
    const pendingBookingActions = Array.isArray(c.whatsapp_booking_actions)
      ? c.whatsapp_booking_actions.filter((a) => a.state === "pending")
      : [];
    const newestFirst = (a, b) =>
      String(b?.created_at || "").localeCompare(String(a?.created_at || ""));
    return {
      ...c,
      has_pending_draft: pendingDrafts.length > 0,
      pending_draft: [...pendingDrafts].sort(newestFirst)[0] ?? null,
      has_pending_booking_action: pendingBookingActions.length > 0,
      pending_booking_action:
        [...pendingBookingActions].sort(newestFirst)[0] ?? null,
      needs_human_review: pendingDrafts.some(
        (d) => d.handoff_required === true || d.risk_level === "high",
      ),
    };
  });

  if (list.length === 0) return list;

  const { data: failedMessages, error: failedError } = await supabase
    .from("whatsapp_messages")
    .select("id, conversation_id, error_message, sent_at")
    .in("conversation_id", list.map((c) => c.id))
    .eq("direction", "outbound")
    .eq("status", "failed")
    .order("sent_at", { ascending: false })
    .limit(500);

  if (failedError) {
    logger.warn("useWhatsAppInbox failed-message lookup failed", {
      tags: { hook: "useWhatsAppInbox", op: "fetchFailedMessages" },
      extra: { message: failedError.message },
    });
    return mergeFailedMessageFlags(list, []);
  }

  return mergeFailedMessageFlags(list, failedMessages ?? []);
}

async function fetchConversationDetail(conversationId, signal) {
  const withSignal = (query) => signal ? query.abortSignal(signal) : query;
  const [messagesRes, draftRes, bookingActionsRes] = await Promise.all([
    withSignal(supabase
      .from("whatsapp_messages")
      .select("id, direction, content, sent_at, status, error_message, meta_message_id, channel, reaction_emoji, in_reply_to_meta_id, media_path, media_mime")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: false })
      .limit(200)),
    withSignal(supabase
      .from("whatsapp_drafts")
      .select(
        "id, proposed_text, intent, confidence, state, created_at, tokens_input, tokens_output, model, risk_level, handoff_required, auto_send_eligible",
      )
      .eq("conversation_id", conversationId)
      .eq("state", "pending")
      .order("created_at", { ascending: false })
      .limit(1))
      .maybeSingle(),
    withSignal(supabase
      .from("whatsapp_booking_actions")
      .select("id, draft_id, action, payload, target_booking_id, state, rejection_reason, applied_booking_id, applied_at, error_message, created_at")
      .eq("conversation_id", conversationId)
      // Include applied + auto_applied so the thread can render inline
      // "Booking created" cards (task 5 of the May 2026 review pass).
      // BookingActionPanel pre-filters to state='pending' so it only
      // renders the queue waiting on staff approval.
      .in("state", ["pending", "applied", "auto_applied"])
      .order("created_at", { ascending: false })
      .limit(50)),
  ]);

  if (messagesRes.error) throw messagesRes.error;
  // draftRes can return PGRST116 if maybeSingle found nothing — swallow
  if (draftRes.error && draftRes.error.code !== "PGRST116") throw draftRes.error;
  if (bookingActionsRes.error) throw bookingActionsRes.error;

  return {
    messages: latestMessagesChronological(messagesRes.data),
    draft: draftRes.data ?? null,
    bookingActions: bookingActionsRes.data ?? [],
  };
}

// ── The hook ─────────────────────────────────────────────────
export function useWhatsAppInbox({ includeBookingWorkspaceData = false } = {}) {
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
  // The DraftPanel uses this to withhold reply controls until staff
  // explicitly resolve every attached proposal in BookingActionPanel.
  const attachedActions = useMemo(
    () => filterAttachedActions(draft, bookingActions),
    [draft, bookingActions],
  );

  const selectedIdRef = useRef(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // ── List: initial load + realtime ──────────────────────────
  const refreshList = useCallback(async () => {
    if (!supabase) {
      setLoadingList(false);
      return null;
    }
    try {
      const list = await fetchConversationsList({ includeBookingWorkspaceData });
      setConversations(list);
      setListError(null);
      return list;
    } catch (err) {
      logger.error("useWhatsAppInbox refreshList failed", err, {
        tags: { hook: "useWhatsAppInbox", op: "refreshList" },
      });
      setListError(err);
      return null;
    } finally {
      setLoadingList(false);
    }
  }, [includeBookingWorkspaceData]);

  // Coalesce realtime list refreshes. A single inbound can fan out into
  // several postgres_changes events (conversation row + draft + booking
  // action, each on its own subscription), and the list query is the
  // expensive one (200 rows + a failed-message lookup). Without this,
  // every event fired its own full refetch. Trailing-debounce so a burst
  // collapses into one refresh; explicit actions still call refreshList
  // directly for immediacy.
  const listRefreshTimerRef = useRef(null);
  const scheduleListRefresh = useCallback(() => {
    if (listRefreshTimerRef.current) return;
    listRefreshTimerRef.current = window.setTimeout(() => {
      listRefreshTimerRef.current = null;
      refreshList();
    }, 400);
  }, [refreshList]);
  useEffect(
    () => () => {
      if (listRefreshTimerRef.current) {
        window.clearTimeout(listRefreshTimerRef.current);
        listRefreshTimerRef.current = null;
      }
    },
    [],
  );

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
    bulkResolveConversations,
    bulkReopenConversations,
  } = useConversationLifecycle({
    selectedId,
    actionInFlight,
    setActionInFlight,
    conversations,
  });

  const { updateConversationNotes } = useConversationNotes({
    selectedId,
    setConversations,
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
  // Attached booking proposals are resolved separately above so a
  // booking write and customer send cannot masquerade as one operation.
  const { approveDraft, rejectDraft, sendManualReply } =
    useDraftActions({
      draft,
      actionInFlight,
      selectedId,
      setActionInFlight,
      setDraft,
      setConversations,
      selectedIdRef,
    });

  useEffect(() => {
    if (!supabase) {
      // Offline/sample mode (VITE_FORCE_OFFLINE=1, or missing creds in dev):
      // serve the shared fixtures so the workspace renders populated for visual
      // review. No query runs and no realtime channel opens.
      setConversations(SAMPLE_WHATSAPP_CONVERSATIONS);
      setLoadingList(false);
      return;
    }
    refreshList();

    const channel = supabase
      .channel(CHANNELS.whatsappInboxList)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations" },
        () => scheduleListRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_drafts" },
        () => scheduleListRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_booking_actions" },
        () => scheduleListRefresh(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refreshList, scheduleListRefresh]);

  // ── Detail: load on selection + realtime ───────────────────
  const refreshDetail = useCallback(async (conversationId) => {
    if (!conversationId) return;
    const controller = new AbortController();
    let timeoutId;
    try {
      // 10-second timeout so a stalled Supabase request can't leave
      // the thread spinner spinning forever (task 11 of the May 2026
      // review pass). The timeout fires a sentinel error that's
      // mapped to a friendly "Couldn't load — retry?" state below.
      const detail = await Promise.race([
        fetchConversationDetail(conversationId, controller.signal),
        new Promise((_, reject) =>
          timeoutId = window.setTimeout(() => {
            controller.abort();
            reject(new Error("conversation-detail-timeout"));
          }, DETAIL_TIMEOUT_MS),
        ),
      ]);
      // Guard against race: user may have moved on.
      if (selectedIdRef.current !== conversationId) return;
      setMessages(detail.messages);
      setDraft(detail.draft);
      setBookingActions(detail.bookingActions);
      setDetailError(null);
    } catch (err) {
      if (selectedIdRef.current !== conversationId) return;
      logger.error("useWhatsAppInbox refreshDetail failed", err, {
        tags: { hook: "useWhatsAppInbox", op: "refreshDetail" },
      });
      setDetailError(err);
    } finally {
      window.clearTimeout(timeoutId);
      controller.abort();
      if (selectedIdRef.current === conversationId) setLoadingDetail(false);
    }
  }, []);

  // Staff "Book appointment" from the thread — needs refreshDetail +
  // refreshList (both defined above) so the new "Booking created" card
  // and list flags update straight away.
  const { createStaffBooking } = useStaffBooking({
    selectedId,
    actionInFlight,
    setActionInFlight,
    refreshDetail,
    refreshList,
  });

  const selectConversation = useCallback(async (conversationId, options = {}) => {
    const markRead = options.markRead !== false;
    setSelectedId(conversationId);
    setMessages([]);
    setDraft(null);
    setBookingActions([]);
    setDogNames([]);
    setDogNamesById({});
    setDetailError(null);

    if (!conversationId || !supabase) {
      if (conversationId && !supabase) {
        // Offline/sample mode — hydrate the thread from the shared fixtures.
        const dogs = SAMPLE_WHATSAPP_DOG_NAMES[conversationId] ?? [];
        setMessages(SAMPLE_WHATSAPP_MESSAGES[conversationId] ?? []);
        setDraft(SAMPLE_WHATSAPP_DRAFTS[conversationId] ?? null);
        setDogNames(dogs.map((dog) => dog.name));
        setDogNamesById(Object.fromEntries(dogs.map((dog) => [dog.id, dog.name])));
      }
      setLoadingDetail(false);
      return;
    }

    setLoadingDetail(true);
    if (markRead) {
      // Optimistic: zero out the unread badge for this conversation
      // immediately. The RPC below + realtime echo will confirm, but
      // without this the list badge stays "2" for the round-trip and
      // looks broken. Booking Desk passes markRead:false because its
      // read-only pilot must not change Inbox state merely by previewing.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId && (c.unread_count ?? 0) > 0
            ? { ...c, unread_count: 0 }
            : c,
        ),
      );

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
    }

    await refreshDetail(conversationId);
    if (selectedIdRef.current !== conversationId) return;

    // Fetch dog names for template picker auto-fill + booking-action chip.
    const humanId = conversations.find((c) => c.id === conversationId)?.human_id;
    if (humanId) {
      const { data: dogsData } = await supabase
        .from("dogs")
        .select("id, name")
        .eq("human_id", humanId)
        .order("name");
      if (selectedIdRef.current !== conversationId) return;
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

  useEffect(() => registerResume(() => {
    if (!supabase) return;
    refreshList();
    if (selectedIdRef.current) refreshDetail(selectedIdRef.current);
  }), [refreshList, refreshDetail]);

  // Realtime for the currently-selected conversation
  useEffect(() => {
    if (!supabase || !selectedId) return;
    const channel = supabase
      .channel(`${CHANNELS.whatsappInboxDetail}-${selectedId}`)
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
    const { data, error } = await supabase.functions.invoke("whatsapp-generate-reply", {
      body: { conversation_id: id },
    });
    if (error) {
      const detail = await parseSupabaseFunctionError(error, "Generate reply failed");
      return { ok: false, reason: detail };
    }
    // Suggest-only mode: the function returns the drafted reply text so
    // the inbox can type it into the compose box. Nothing is persisted
    // or sent. A 200 with ok:false carries a reason (e.g. AI turned off).
    if (data && data.ok === false) {
      return { ok: false, reason: data.reason ?? "Could not generate a reply." };
    }
    return { ok: true, replyText: data?.reply_text ?? "" };
  }, [selectedId]);

  // "Update notes" button: ask the AI to read the thread and append any
  // durable customer notes + dog grooming requests to their records.
  // Nothing is sent to the customer. Returns a human-readable summary of
  // what (if anything) changed.
  const updateNotesFromConversation = useCallback(async (conversationId) => {
    const id = conversationId ?? selectedId;
    if (!id) return { ok: false, reason: "no conversation selected" };
    const { data, error } = await supabase.functions.invoke("whatsapp-update-notes", {
      body: { conversation_id: id },
    });
    if (error) {
      const detail = await parseSupabaseFunctionError(error, "Update notes failed");
      return { ok: false, reason: detail };
    }
    if (data && data.ok === false) {
      return { ok: false, reason: data.reason ?? "Could not update notes." };
    }
    return {
      ok: true,
      summary: data?.summary ?? "Notes updated.",
      updated: data?.updated ?? null,
    };
  }, [selectedId]);


  const sendTemplate = useCallback(
    async (template, paramValues) => {
      const selectedConversation = getSelectedConversationForSend(conversations, selectedId);

      const params = buildTemplateParams(template, paramValues);

      const { error } = await supabase.functions.invoke(SEND_FUNCTION_PATH, {
        body: {
          mode: "template",
          to: selectedConversation.phone_e164,
          template_name: template.name,
          language: template.language,
          params,
          conversation_id: selectedConversation.id,
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
    bulkResolveConversations,
    bulkReopenConversations,
    updateConversationNotes,
    createStaffBooking,
    sendTemplate,
    sendOutboundTemplate,
    sendOutboundSMS,
    generateReplyForConversation,
    updateNotesFromConversation,
    dogNames,
    dogNamesById,
    actionInFlight,
    // manual refresh (rarely needed)
    refreshList,
  };
}
