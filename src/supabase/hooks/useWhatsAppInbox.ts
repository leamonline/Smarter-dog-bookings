// ============================================================
// src/supabase/hooks/useWhatsAppInbox.ts
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
} from "./inbox/helpers";
import { useOutboundSender } from "./inbox/useOutboundSender";
import { useConversationLifecycle } from "./inbox/useConversationLifecycle";
import { useConversationNotes } from "./inbox/useConversationNotes";
import { useAIModeControls } from "./inbox/useAIModeControls";
import { useBookingActionDecisions } from "./inbox/useBookingActionDecisions";
import { useDraftActions } from "./inbox/useDraftActions";
import { markWhatsappConversationRead } from "../rpc";
import { registerResume } from "../refreshOnResume.js";
import type { InboxActionResult } from "./inbox/helpers";
import type { OutboundTemplate } from "./inbox/useOutboundSender";

import type {
  GenerateReplyResponse,
  InboxBookingAction,
  InboxConversation,
  InboxDraft,
  InboxMessage,
  SelectConversationOptions,
  UpdateNotesResponse,
} from "./inbox/inboxTypes";
import { fetchConversationDetail, fetchConversationsList, type Client } from "./inbox/inboxFetchers";

// The shapes and pure helpers moved to ./inbox/ (Debt 6); they stay exported
// from here so existing importers and tests are unchanged.
export type {
  ConversationListRow,
  ConversationDerivedFlags,
  FailedMessage,
  InboxBookingAction,
  InboxBookingActionSummary,
  InboxConversation,
  InboxDraft,
  InboxDraftSummary,
  InboxHuman,
  InboxHumanDog,
  InboxMessage,
  SelectConversationOptions,
} from "./inbox/inboxTypes";
import {
  filterAttachedActions,
  getSelectedConversationForSend,
  latestMessagesChronological,
  mergeFailedMessageFlags,
} from "./inbox/inboxListHelpers";
export {
  filterAttachedActions,
  getSelectedConversationForSend,
  latestMessagesChronological,
  mergeFailedMessageFlags,
};

const DETAIL_TIMEOUT_MS = 10_000;

// The sample fixtures are deliberately loose JS (allowJs infers their literal
// keys), so widen them once here to the shapes the hook holds in state.
const SAMPLE_CONVERSATIONS = SAMPLE_WHATSAPP_CONVERSATIONS as unknown as InboxConversation[];
const SAMPLE_MESSAGES = SAMPLE_WHATSAPP_MESSAGES as unknown as Record<string, InboxMessage[]>;
const SAMPLE_DRAFTS = SAMPLE_WHATSAPP_DRAFTS as unknown as Record<string, InboxDraft>;
const SAMPLE_DOG_NAMES = SAMPLE_WHATSAPP_DOG_NAMES as unknown as Record<string, Array<{ id: string; name: string }>>;


function requireClient(): Client {
  if (!supabase) throw new Error("Not connected");
  return supabase;
}

// ── The hook ─────────────────────────────────────────────────
export function useWhatsAppInbox({ includeBookingWorkspaceData = false }: { includeBookingWorkspaceData?: boolean } = {}) {
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  // `dogNames` is the array used by the template picker (it auto-fills the
  // first dog when staff picks a templated reply). `dogNamesById` is the
  // map BookingCreatedCard uses to resolve the dog name from a booking
  // action's `payload.dog_id` — without it the chip falls back to the
  // generic "this dog" placeholder even when we know the name.
  const [dogNames, setDogNames] = useState<string[]>([]);
  const [dogNamesById, setDogNamesById] = useState<Record<string, string>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<unknown>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [draft, setDraft] = useState<InboxDraft | null>(null);
  const [bookingActions, setBookingActions] = useState<InboxBookingAction[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<unknown>(null);

  const [actionInFlight, setActionInFlight] = useState(false);

  // Derived: actions attached to the currently-pending draft.
  // The DraftPanel uses this to withhold reply controls until staff
  // explicitly resolve every attached proposal in BookingActionPanel.
  const attachedActions = useMemo(
    () => filterAttachedActions(draft, bookingActions),
    [draft, bookingActions],
  );

  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // ── List: initial load + realtime ──────────────────────────
  const refreshList = useCallback(async (): Promise<InboxConversation[] | null> => {
    if (!supabase) {
      setLoadingList(false);
      return null;
    }
    try {
      const list = await fetchConversationsList(supabase, { includeBookingWorkspaceData });
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
  const listRefreshTimerRef = useRef<number | null>(null);
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
      setConversations(SAMPLE_CONVERSATIONS);
      setLoadingList(false);
      return;
    }
    const client = supabase;
    refreshList();

    const channel = client
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

    return () => { client.removeChannel(channel); };
  }, [refreshList, scheduleListRefresh]);

  // ── Detail: load on selection + realtime ───────────────────
  const refreshDetail = useCallback(async (conversationId: string | null | undefined) => {
    if (!conversationId) return;
    const client = requireClient();
    const controller = new AbortController();
    let timeoutId: number | undefined;
    try {
      // 10-second timeout so a stalled Supabase request can't leave
      // the thread spinner spinning forever (task 11 of the May 2026
      // review pass). The timeout fires a sentinel error that's
      // mapped to a friendly "Couldn't load — retry?" state below.
      const detail = await Promise.race([
        fetchConversationDetail(client, conversationId, controller.signal),
        new Promise<never>((_, reject) =>
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

  const selectConversation = useCallback(async (
    conversationId: string | null,
    options: SelectConversationOptions = {},
  ) => {
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
        const dogs = SAMPLE_DOG_NAMES[conversationId] ?? [];
        setMessages(SAMPLE_MESSAGES[conversationId] ?? []);
        setDraft(SAMPLE_DRAFTS[conversationId] ?? null);
        setDogNames(dogs.map((dog) => dog.name));
        setDogNamesById(Object.fromEntries(dogs.map((dog) => [dog.id, dog.name])));
      }
      setLoadingDetail(false);
      return;
    }

    const client = supabase;
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
      markWhatsappConversationRead(client, { conversationId }).then(
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
      const { data: dogsData } = await client
        .from("dogs")
        .select("id, name")
        .eq("human_id", humanId)
        .order("name");
      if (selectedIdRef.current !== conversationId) return;
      const rows = dogsData ?? [];
      setDogNames(rows.map((d) => d.name));
      const byId: Record<string, string> = {};
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
    const client = supabase;
    const channel = client
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

    return () => { client.removeChannel(channel); };
  }, [selectedId, refreshDetail]);


  // ── Generate reply on demand (Phase G) ─────────────────────
  // Calls the whatsapp-generate-reply edge function, which authenticates
  // staff via JWT then forwards to whatsapp-agent with force_draft=true.
  // Used by the "Generate reply" button on the inbox thread — under the
  // new default (Human only) the agent doesn't auto-draft, so staff
  // explicitly trigger it when they want help drafting.
  const generateReplyForConversation = useCallback(async (
    conversationId?: string | null,
  ): Promise<InboxActionResult<{ replyText: string }>> => {
    const id = conversationId ?? selectedId;
    if (!id) return { ok: false, reason: "no conversation selected" };
    if (!supabase) return { ok: false, reason: "Not connected" };
    const { data, error } = await supabase.functions.invoke<GenerateReplyResponse>("whatsapp-generate-reply", {
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
  const updateNotesFromConversation = useCallback(async (
    conversationId?: string | null,
  ): Promise<InboxActionResult<{ summary: string; updated: unknown }>> => {
    const id = conversationId ?? selectedId;
    if (!id) return { ok: false, reason: "no conversation selected" };
    if (!supabase) return { ok: false, reason: "Not connected" };
    const { data, error } = await supabase.functions.invoke<UpdateNotesResponse>("whatsapp-update-notes", {
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
    async (template: OutboundTemplate, paramValues: Record<string, string | undefined>): Promise<void> => {
      const selectedConversation = getSelectedConversationForSend(conversations, selectedId);

      const params = buildTemplateParams(template, paramValues);

      const { error } = await requireClient().functions.invoke(SEND_FUNCTION_PATH, {
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
