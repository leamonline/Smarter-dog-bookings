// ============================================================
// src/components/views/inbox/InboxView.jsx
//
// The staff customer-comms cockpit (WhatsApp today; SMS / others later).
// Two-pane layout on desktop (list + detail), stacked on mobile.
// Uses the useWhatsAppInbox hook for all data/actions.
//
// Feature set:
//   - Conversations list with unread badges, pending-draft indicator
//   - Thread view showing the full message history
//   - Pending AI draft panel with Approve / Edit & Send / Reject
//   - Pending AI booking-action panel with Apply / Reject
//   - Compose box for free-form staff replies — always visible when a
//     conversation is selected, disabled outside the 24h window
//   - "Take over" toggle — switches the conversation to human_takeover
//     so the AI stops drafting for it
//   - Auto-refreshes via realtime subscriptions in the hook
//
//   - Template picker for messages outside the 24h window
//
// Sub-components live alongside this file under views/inbox/. This
// file is intentionally short — it orchestrates, the children do
// the work.
// ============================================================

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useWhatsAppInbox } from "../../../supabase/hooks/useWhatsAppInbox.js";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { LoadingSpinner } from "../../ui/LoadingSpinner.jsx";
import {
  displayName,
  isAwaitingReply,
} from "./helpers.js";
import { formatPhoneForDisplay } from "../../../utils/phone.js";
import { InboxFilterChip } from "./InboxFilterChip.jsx";
import { ThreadSkeleton } from "../../ui/Skeleton.jsx";
import { ConversationListItem } from "./conversation-list/ConversationListItem.jsx";
import { MarkCompleteButton } from "./MarkCompleteButton.jsx";
import { ComposeNewModal } from "./compose-new/ComposeNewModal.jsx";
import { MessageBubble } from "./thread/MessageBubble.jsx";
import { BookingCreatedCard } from "./thread/BookingCreatedCard.jsx";
import { DraftPanel } from "./thread/DraftPanel.jsx";
import { BookingActionPanel } from "./thread/BookingActionPanel.jsx";
import { ComposePanel } from "./thread/ComposePanel.jsx";
import { CustomerContextPanel } from "./customer-context/CustomerContextPanel.jsx";
import { SlideOverPanel } from "./customer-context/SlideOverPanel.jsx";
import { useCustomerContext } from "./hooks/useCustomerContext.js";
import { useInboxMessageSearch } from "./hooks/useInboxMessageSearch.js";
import { useFillViewportHeight } from "./hooks/useFillViewportHeight.js";
import { BookAppointmentModal } from "./customer-context/BookAppointmentModal.jsx";

export function InboxView({ onOpenHuman, onOpenDog } = {}) {
  const {
    conversations,
    loadingList,
    listError,
    selectedId,
    selectedConversation,
    messages,
    draft,
    bookingActions,
    attachedActions,
    loadingDetail,
    detailError,
    selectConversation,
    approveDraft,
    approveDraftAndApply,
    rejectDraft,
    sendManualReply,
    applyBookingAction,
    rejectBookingAction,
    resolveConversation,
    reopenConversation,
    createStaffBooking,
    sendTemplate,
    sendOutboundTemplate,
    sendOutboundSMS,
    generateReplyForConversation,
    updateNotesFromConversation,
    dogNames,
    dogNamesById,
    actionInFlight,
    refreshList,
  } = useWhatsAppInbox();
  const toast = useToast();

  // Wrap the hook actions with success toasts so screen-reader users
  // hear confirmation (errors stay inline in the panels — they need
  // the surrounding context to make sense). Toasts go through the
  // aria-live region inside ToastProvider so they're announced
  // without stealing focus.
  const handleApproveDraft = useCallback(async (opts) => {
    const res = await approveDraft(opts);
    if (res?.ok) toast.show("Reply sent.", "success");
    return res;
  }, [approveDraft, toast]);

  const handleApproveAndApply = useCallback(async (opts) => {
    const res = await approveDraftAndApply(opts);
    if (res?.ok) toast.show("Reply sent and booking added to the diary.", "success");
    return res;
  }, [approveDraftAndApply, toast]);

  const handleRejectDraft = useCallback(async (opts) => {
    const res = await rejectDraft(opts);
    if (res?.ok) toast.show("Draft rejected.", "info");
    return res;
  }, [rejectDraft, toast]);

  const handleSendManualReply = useCallback(async (opts) => {
    const res = await sendManualReply(opts);
    if (res?.ok) toast.show("Reply sent.", "success");
    return res;
  }, [sendManualReply, toast]);

  const handleApplyBookingAction = useCallback(async (actionId, editedPayload) => {
    const res = await applyBookingAction(actionId, editedPayload);
    if (res?.ok) toast.show("Booking added to the diary.", "success");
    return res;
  }, [applyBookingAction, toast]);

  const handleRejectBookingAction = useCallback(async (actionId, reason) => {
    const res = await rejectBookingAction(actionId, reason);
    if (res?.ok) toast.show("Booking proposal rejected.", "info");
    return res;
  }, [rejectBookingAction, toast]);

  // Resolve / reopen with an undo toast. The undo button only appears
  // for the resolve path because reopen is already cheap (and on the
  // exact same button) — clicking Mark complete again returns the
  // conversation to the active queue if it was reopened in error.
  const handleResolveConversation = useCallback(async () => {
    const targetId = selectedId;
    const res = await resolveConversation();
    if (res?.ok) {
      toast.show("Conversation closed.", "success", () => reopenConversation(targetId));
    } else if (res?.reason) {
      toast.show(`Could not close: ${res.reason}`, "error");
    }
    return res;
  }, [resolveConversation, reopenConversation, selectedId, toast]);

  const handleReopenConversation = useCallback(async () => {
    const res = await reopenConversation();
    if (res?.ok) toast.show("Conversation reopened.", "info");
    else if (res?.reason) toast.show(`Could not reopen: ${res.reason}`, "error");
    return res;
  }, [reopenConversation, toast]);

  // Generate-reply (AI on demand) lives inside the compose row. It asks
  // the AI for a suggested reply and ComposePanel types the returned text
  // into the box — nothing is sent. The handler is hoisted here and
  // passed down; it returns the result so ComposePanel can read replyText.
  const handleGenerateReply = useCallback(async () => {
    const res = await generateReplyForConversation(selectedId);
    if (res?.ok && res.replyText) {
      toast.show("Suggested reply added to the box — review and send when you're ready.", "info");
    } else if (res?.ok) {
      toast.show("The AI didn't return a suggestion. Please try again.", "info");
    } else if (res?.reason) {
      toast.show(`Could not generate: ${res.reason}`, "error");
    }
    return res;
  }, [generateReplyForConversation, selectedId, toast]);

  // Book-appointment modal — staff quick-booking from the customer
  // panel. createStaffBooking applies it through the same guarded path as
  // an AI proposal, so on success the thread shows a "Booking created"
  // card; we just surface the outcome as a toast.
  const [bookOpen, setBookOpen] = useState(false);
  const handleBookAppointment = useCallback(async (payload) => {
    const res = await createStaffBooking(payload);
    if (res?.ok) toast.show("Booking added to the diary.", "success");
    else if (res?.reason) toast.show(`Could not book: ${res.reason}`, "error");
    return res;
  }, [createStaffBooking, toast]);

  // Compose-new modal — outbound entry point. Opens from the header
  // button; after a successful send, close the modal and select the
  // freshly-upserted conversation so staff land straight in the thread.
  const [composeOpen, setComposeOpen] = useState(false);
  const handleComposeSent = useCallback(async (payload) => {
    const res = await sendOutboundTemplate(payload);
    if (res?.ok) {
      setComposeOpen(false);
      const phoneDigits = (payload.phoneE164 ?? "").replace(/\D/g, "");
      const refreshedConversations = res.conversations ?? conversations;
      const match = refreshedConversations.find(
        (c) =>
          (c.phone_e164 ?? "").replace(/\D/g, "") === phoneDigits &&
          (c.channel ?? "whatsapp") === "whatsapp",
      );
      if (match) {
        toast.show("Template sent — opening the thread.", "success");
        selectConversation(match.id);
      } else {
        toast.show("Template sent. The thread will appear in the inbox shortly.", "success");
      }
    } else if (res?.reason) {
      toast.show(`Could not send: ${res.reason}`, "error");
    }
    return res;
  }, [sendOutboundTemplate, conversations, selectConversation, toast]);

  const handleComposeSMSSent = useCallback(async (payload) => {
    const res = await sendOutboundSMS(payload);
    if (res?.ok) {
      setComposeOpen(false);
      const phoneDigits = (payload.phoneE164 ?? "").replace(/\D/g, "");
      const refreshedConversations = res.conversations ?? conversations;
      const match = refreshedConversations.find(
        (c) =>
          (c.phone_e164 ?? "").replace(/\D/g, "") === phoneDigits &&
          c.channel === "sms",
      );
      if (match) {
        toast.show("SMS sent — opening the thread.", "success");
        selectConversation(match.id);
      } else {
        toast.show("SMS sent. The thread will appear in the inbox shortly.", "success");
      }
    } else if (res?.reason) {
      toast.show(`Could not send SMS: ${res.reason}`, "error");
    }
    return res;
  }, [sendOutboundSMS, conversations, selectConversation, toast]);

  // Customer-context panel: docked third column at xl, slide-over below xl.
  // Track openness separately so the slide-over can close without
  // resetting the docked view. The docked column is purely CSS — it
  // shows whenever a conversation is selected.
  const [contextOpen, setContextOpen] = useState(false);
  // Close the slide-over AND the book-appointment modal when switching
  // conversations, so a half-open panel (or a booking form still holding
  // the previous customer's dog) doesn't follow staff to the new thread.
  useEffect(() => {
    setContextOpen(false);
    setBookOpen(false);
  }, [selectedId]);
  const customerContext = useCustomerContext(selectedConversation?.human_id ?? null);

  // "Update notes" — AI reads the thread and appends durable customer
  // notes + dog grooming requests to their records (nothing is sent).
  // On success, refresh the panel so new dog groom-notes show straight
  // away. Returns the result so the panel button can manage its busy
  // state.
  const handleUpdateNotes = useCallback(async () => {
    const res = await updateNotesFromConversation(selectedId);
    if (res?.ok) {
      toast.show(res.summary ?? "Notes updated.", "success");
      customerContext.refetch?.();
    } else if (res?.reason) {
      toast.show(`Could not update notes: ${res.reason}`, "error");
    }
    return res;
  }, [updateNotesFromConversation, selectedId, toast, customerContext]);

  // List filter: one of "all" | "awaiting_reply" | "failed_sends" |
  // "unread" | "drafts" | "done".
  // "all" is the default and shows every ACTIVE conversation (closed
  // conversations only appear under the "done" chip). The other active
  // modes pre-filter to a specific subset so staff can triage in
  // focused sweeps. Clicking the active chip clears the filter (back
  // to "all"). "done" is its own filter — clicking it again returns
  // to "all" (active queue).
  const [listFilter, setListFilter] = useState("all");

  // Free-text search across the FULL message history (not just the
  // last-message preview). A non-empty query overrides the active
  // filter and searches the whole inbox — see searchResults below.
  const [searchQuery, setSearchQuery] = useState("");
  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;
  const { messageMatchIds, searching: searchingMessages } =
    useInboxMessageSearch(searchQuery);

  // Split the active (open) and closed piles once so each counter
  // doesn't re-walk the list.
  const activeConversations = useMemo(
    () => conversations.filter((c) => !c.closed_at),
    [conversations],
  );
  const closedConversations = useMemo(
    () => conversations.filter((c) => !!c.closed_at),
    [conversations],
  );

  // Counts are computed over ACTIVE only (except Done, which is the
  // closed-pile count). A conversation that's closed shouldn't bump
  // the Unread or Needs review chips — closing it is what dropped it
  // off the queue.
  const unreadCount = useMemo(
    () => activeConversations.filter((c) => (c.unread_count || 0) > 0).length,
    [activeConversations],
  );
  const awaitingReplyCount = useMemo(
    () => activeConversations.filter((c) => isAwaitingReply(c)).length,
    [activeConversations],
  );
  const failedSendCount = useMemo(
    () => activeConversations.filter((c) => c.has_failed_message).length,
    [activeConversations],
  );
  const draftsCount = useMemo(
    () => activeConversations.filter((c) => c.has_pending_draft).length,
    [activeConversations],
  );
  const doneCount = closedConversations.length;

  const filteredConversations = useMemo(() => {
    switch (listFilter) {
      case "awaiting_reply":
        return activeConversations.filter((c) => isAwaitingReply(c));
      case "failed_sends":
        return activeConversations.filter((c) => c.has_failed_message);
      case "unread":
        return activeConversations.filter((c) => (c.unread_count || 0) > 0);
      case "drafts":
        return activeConversations.filter((c) => c.has_pending_draft);
      case "done":
        return closedConversations;
      case "all":
      default:
        return activeConversations;
    }
  }, [activeConversations, closedConversations, listFilter]);

  // Search results override the active filter. We match the whole inbox
  // (active + closed) on the customer name, phone, last-message preview
  // and conversation note (instant, client-side), OR on full message
  // content via messageMatchIds from the debounced server query. Order
  // follows the list's existing recency sort.
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = trimmedQuery.toLowerCase();
    return conversations.filter((c) => {
      if (messageMatchIds.has(c.id)) return true;
      const name = displayName(c).toLowerCase();
      const phone = (c.phone_e164 || "").toLowerCase();
      const preview = (c.last_customer_text || "").toLowerCase();
      const note = (c.notes || "").toLowerCase();
      return (
        name.includes(q) ||
        phone.includes(q) ||
        preview.includes(q) ||
        note.includes(q)
      );
    });
  }, [conversations, isSearching, trimmedQuery, messageMatchIds]);

  const displayedConversations = isSearching ? searchResults : filteredConversations;

  const toggleFilter = useCallback((next) => {
    setListFilter((prev) => (prev === next ? "all" : next));
  }, []);

  const FILTER_LABELS = {
    all: "active conversations",
    awaiting_reply: "awaiting reply",
    failed_sends: "failed sends",
    unread: "unread",
    drafts: "pending drafts",
    done: "closed conversations",
  };

  // Deep-link: open ?conversation=<id> on first load (and whenever
  // the URL changes externally, e.g. dashboard rows that navigate to
  // a specific chat). Wait until the list has loaded so we know the
  // id is real before selecting — otherwise selectConversation runs
  // a fetch for a non-existent conversation and the list-pane shows
  // an empty selection.
  const [searchParams, setSearchParams] = useSearchParams();
  const targetConversationId = searchParams.get("conversation");
  useEffect(() => {
    if (!targetConversationId) return;
    if (loadingList) return;
    if (selectedId === targetConversationId) return;
    const exists = conversations.some((c) => c.id === targetConversationId);
    if (!exists) return;
    selectConversation(targetConversationId);
    // Clear the param so navigating back into /inbox manually
    // doesn't keep snapping back to this conversation.
    const next = new URLSearchParams(searchParams);
    next.delete("conversation");
    setSearchParams(next, { replace: true });
  }, [targetConversationId, loadingList, conversations, selectedId, selectConversation, searchParams, setSearchParams]);

  // Deep-link by human: ?human=<id> opens that human's existing thread.
  // Callers like the human profile's "Send message" only know the human
  // id, not the conversation id, so resolve human_id → conversation here
  // (mirrors the ?conversation= effect). If the human has no thread yet we
  // just land on the inbox. Wait for the list so the lookup is reliable.
  const targetHumanId = searchParams.get("human");
  useEffect(() => {
    if (!targetHumanId) return;
    if (loadingList) return;
    const conv = conversations.find((c) => c.human_id === targetHumanId);
    if (conv && selectedId !== conv.id) {
      selectConversation(conv.id);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("human");
    setSearchParams(next, { replace: true });
  }, [targetHumanId, loadingList, conversations, selectedId, selectConversation, searchParams, setSearchParams]);

  // Mobile: show detail when a conversation is selected
  const showDetailOnMobile = !!selectedId;

  // Fill from the shell's real top edge to the viewport bottom rather
  // than guessing the top chrome with a magic number — robust to the
  // toolbar wrapping or a banner appearing. The h-[calc(...)] class
  // stays as the first-paint fallback until the hook measures.
  const rootRef = useRef(null);
  const fillHeight = useFillViewportHeight(rootRef);

  // Thread auto-scroll. Opening a conversation always lands on the newest
  // message; new messages within the SAME conversation only scroll down
  // when staff are already near the bottom, so reading back through
  // history isn't yanked away when a reply or realtime message arrives.
  const threadScrollRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const lastScrolledConvRef = useRef(null);

  const handleThreadScroll = useCallback(() => {
    const el = threadScrollRef.current;
    if (!el) return;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  useEffect(() => {
    if (!selectedId || loadingDetail || detailError) return;
    const el = threadScrollRef.current;
    if (!el) return;
    const freshConversation = lastScrolledConvRef.current !== selectedId;
    if (freshConversation || isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      isNearBottomRef.current = true;
    }
    lastScrolledConvRef.current = selectedId;
  }, [selectedId, loadingDetail, detailError, messages.length, bookingActions.length]);

  return (
    <div
      ref={rootRef}
      style={fillHeight ? { height: `${fillHeight}px` } : undefined}
      className="py-2.5 flex flex-col gap-3 min-h-[60dvh] h-[calc(100dvh-180px)]"
    >
      <div className="flex flex-col gap-3">
        {/* Top line — title + New message on the left, message search on
            the far right. */}
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-bold m-0 text-brand-purple font-display leading-tight truncate">
                Inbox
              </h2>
              <div className="text-[11px] text-slate-600 mt-0.5">
                {isSearching
                  ? searchingMessages
                    ? `Searching all messages for “${trimmedQuery}”…`
                    : `${displayedConversations.length} result${displayedConversations.length === 1 ? "" : "s"} for “${trimmedQuery}”`
                  : listFilter === "all"
                    ? `${activeConversations.length} active conversation${activeConversations.length === 1 ? "" : "s"}`
                    : listFilter === "done"
                      ? `${closedConversations.length} closed conversation${closedConversations.length === 1 ? "" : "s"}`
                      : `Filtered: ${FILTER_LABELS[listFilter]} · ${filteredConversations.length} of ${activeConversations.length}`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              title="Start a new WhatsApp thread with a customer. Meta requires an approved template for first contact."
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-brand-yellow text-brand-purple text-[12px] font-bold cursor-pointer hover:bg-brand-yellow-dark transition-colors font-[inherit]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New message
            </button>
          </div>

          {/* Search box — far right of the New message line. Searches the
              full message history, not just the visible last-message
              preview (see useInboxMessageSearch). */}
          <div className="relative w-full sm:w-auto sm:min-w-[240px] md:w-[300px]">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search all messages…"
              aria-label="Search all messages"
              className="w-full h-9 pl-9 pr-9 rounded-full border border-slate-200 bg-white text-[13px] text-brand-purple placeholder:text-slate-400 focus:outline-none focus:border-brand-yellow font-[inherit]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-brand-purple hover:bg-slate-100 transition-colors text-[16px] leading-none cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Filter chips — single non-wrapping, horizontally-scrollable
            strip so the header keeps a fixed height on phone/iPad (never
            wrapping to extra rows). -mx/px keeps focus rings off the clip
            edge. */}
        <div
          className="flex items-center gap-2 flex-nowrap overflow-x-auto w-full min-w-0 -mx-1 px-1 [scrollbar-width:thin]"
          role="group"
          aria-label="Filter conversations"
        >
          <InboxFilterChip
            label="All"
            count={activeConversations.length}
            active={listFilter === "all"}
            onClick={() => setListFilter("all")}
            color="slate"
            clearable={false}
            hint="Show every active conversation."
          />
          <InboxFilterChip
            label="Awaiting reply"
            count={awaitingReplyCount}
            active={listFilter === "awaiting_reply"}
            onClick={() => toggleFilter("awaiting_reply")}
            color="purple"
            hint="Show active conversations where the latest customer message is newer than the latest staff reply."
          />
          <InboxFilterChip
            label="Failed sends"
            count={failedSendCount}
            active={listFilter === "failed_sends"}
            onClick={() => toggleFilter("failed_sends")}
            color="rose"
            hint="Show conversations where the latest outbound send attempt failed."
          />
          <InboxFilterChip
            label="Unread"
            count={unreadCount}
            active={listFilter === "unread"}
            onClick={() => toggleFilter("unread")}
            color="purple"
            hint="Show only conversations with unread customer messages."
          />
          <InboxFilterChip
            label="Drafts"
            count={draftsCount}
            active={listFilter === "drafts"}
            onClick={() => toggleFilter("drafts")}
            color="amber"
            hint="Show only conversations with a pending AI draft waiting for staff approval."
          />
          <InboxFilterChip
            label="Done"
            count={doneCount}
            active={listFilter === "done"}
            onClick={() => toggleFilter("done")}
            color="slate"
            hint="Show conversations that have been marked complete. They reopen automatically if the customer messages again."
          />
        </div>
      </div>

      <div className="flex-1 flex bg-white rounded-2xl border border-gray-100 shadow-card-resting overflow-hidden">
        {/* List pane */}
        <div
          className={`w-full md:w-[320px] border-r border-slate-200 flex flex-col ${
            showDetailOnMobile ? "hidden md:flex" : "flex"
          }`}
        >
          {loadingList ? (
            <div className="p-4"><LoadingSpinner label="Loading messages…" /></div>
          ) : listError ? (
            <div role="alert" className="m-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-bold text-amber-900">We can&apos;t load your messages right now</h2>
              <p className="mt-1 text-xs text-amber-800">
                The inbox is temporarily unavailable. This usually clears within a minute. If it keeps happening, the dashboard&apos;s WhatsApp widget may still show recent threads.
              </p>
              <button
                type="button"
                onClick={refreshList}
                className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-900 px-3 py-1.5 text-xs font-bold text-amber-50 hover:bg-amber-950"
              >
                Try again
              </button>
              {import.meta.env.DEV && (
                <details className="mt-3 text-micro text-amber-700">
                  <summary>Dev: error details</summary>
                  <pre className="whitespace-pre-wrap mt-1">{String(listError?.message || listError)}</pre>
                </details>
              )}
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-slate-600 text-body">
              <p className="font-semibold text-brand-purple mb-1">No WhatsApp conversations yet</p>
              <p className="text-xs text-slate-500">
                When a customer messages your WhatsApp number, their thread will appear here.
              </p>
            </div>
          ) : displayedConversations.length === 0 ? (
            <div className="p-6 text-center text-slate-600 text-body">
              {isSearching ? (
                <>
                  <p className="mb-1">
                    No messages match <span className="font-semibold">“{trimmedQuery}”</span>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="underline text-brand-purple hover:text-brand-purple-light font-semibold"
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <p className="mb-1">
                    No conversations match <span className="font-semibold">{FILTER_LABELS[listFilter] ?? listFilter}</span>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setListFilter("all")}
                    className="underline text-brand-purple hover:text-brand-purple-light font-semibold"
                  >
                    Show all conversations
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              {displayedConversations.map((c) => (
                <ConversationListItem
                  key={c.id}
                  conv={c}
                  isSelected={c.id === selectedId}
                  onSelect={selectConversation}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail pane */}
        <div
          className={`flex-1 flex flex-col ${showDetailOnMobile ? "flex" : "hidden md:flex"}`}
        >
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-[14px] px-6 text-center">
              Select a conversation on the left to see the thread.
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-col gap-1.5 px-4 py-2.5 border-b border-slate-100 bg-brand-paper">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => selectConversation(null)}
                      className="md:hidden text-brand-purple text-[18px] w-9 h-9 rounded-full hover:bg-brand-purple/5 transition-colors"
                      aria-label="Back to inbox"
                    >←</button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-bold text-brand-purple font-display leading-tight truncate max-w-[260px]">
                          {displayName(selectedConversation)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 truncate">
                        {formatPhoneForDisplay(selectedConversation?.phone_e164)}
                        {customerContext.human?.email
                          ? ` | ${customerContext.human.email}`
                          : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedConversation?.closed_at && (
                      <span
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[12px] font-semibold"
                        title={`Closed ${new Date(selectedConversation.closed_at).toLocaleString("en-GB")}${
                          selectedConversation.closure_reason && selectedConversation.closure_reason !== "manual"
                            ? ` · auto-reason: ${selectedConversation.closure_reason}`
                            : ""
                        }. A new customer message will reopen it automatically.`}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Closed
                      </span>
                    )}
                    <MarkCompleteButton
                      conversation={selectedConversation}
                      onResolve={handleResolveConversation}
                      onReopen={handleReopenConversation}
                      disabled={actionInFlight}
                    />
                    {/* Customer info — slide-over below xl, redundant
                        at xl (the docked column is already visible). */}
                    <button
                      type="button"
                      onClick={() => setContextOpen(true)}
                      title="Show this customer's dogs, last groom, and trusted contacts."
                      className="lg:hidden inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white border border-slate-200 text-brand-purple text-[12px] font-semibold cursor-pointer hover:border-brand-yellow/60 transition-colors font-[inherit]"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      Customer info
                    </button>
                  </div>
                </div>
              </div>

              {/* Thread — kept visible above any draft / booking / template
                  panels via min-h, so staff can always read history while
                  deciding how to reply.
                  Inline "Booking created" cards are interleaved with the
                  messages at the timestamp the action was applied — the
                  inverse of the booking detail's "Created from WhatsApp"
                  link, so staff can follow the loop both ways. */}
              <div
                ref={threadScrollRef}
                onScroll={handleThreadScroll}
                className="flex-1 min-h-0 overflow-y-auto px-4 py-3 bg-brand-paper"
              >
                {loadingDetail ? (
                  <ThreadSkeleton bubbles={5} />
                ) : detailError ? (
                  <div className="text-center text-slate-600 text-body py-8">
                    Couldn&apos;t load the thread.
                    <button
                      type="button"
                      onClick={() => selectConversation(selectedId)}
                      className="ml-2 underline text-brand-purple font-semibold cursor-pointer bg-transparent border-none p-0 font-[inherit]"
                    >
                      Retry
                    </button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-slate-500 text-body py-8">
                    No messages yet.
                  </div>
                ) : (
                  [
                    ...messages.map((m) => ({
                      kind: "message",
                      at: m.sent_at,
                      key: `m-${m.id}`,
                      data: m,
                    })),
                    ...bookingActions
                      .filter((a) => a.state === "applied" || a.state === "auto_applied")
                      .map((a) => ({
                        kind: "booking_created",
                        at: a.applied_at || a.created_at,
                        key: `a-${a.id}`,
                        data: a,
                      })),
                  ]
                    .sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")))
                    .map((item) =>
                      item.kind === "message" ? (
                        <MessageBubble key={item.key} message={item.data} />
                      ) : (
                        <BookingCreatedCard
                          key={item.key}
                          action={item.data}
                          dogNamesById={dogNamesById}
                        />
                      ),
                    )
                )}
              </div>

              {/* Action dock — pending draft and booking proposal. Bounded
                  height + internal scroll so a tall stack can't push the
                  pinned composer off-screen. The generate-reply button now
                  lives inside the compose row below. */}
              <div className="shrink-0 max-h-[45%] overflow-y-auto">

              {/* Pending AI draft — only rendered when there is one.
                  Passing the conversation lets the WhyHeldExplainer inside
                  the panel narrate why this draft is awaiting your nod
                  (mode='AI drafts', risk_level='high', handoff_required,
                  etc.). */}
              {draft && (
                <DraftPanel
                  draft={draft}
                  conversation={selectedConversation}
                  attachedActions={attachedActions}
                  onApprove={handleApproveDraft}
                  onApproveAndApply={handleApproveAndApply}
                  onReject={handleRejectDraft}
                  inFlight={actionInFlight}
                />
              )}

              <BookingActionPanel
                actions={bookingActions.filter((a) => a.state === "pending")}
                onApply={handleApplyBookingAction}
                onReject={handleRejectBookingAction}
                inFlight={actionInFlight}
              />
              </div>

              {/* Free-form compose box — always available when a
                  conversation is selected, gated on the 24h window. Sits
                  OUTSIDE the action dock above, so it stays pinned at the
                  bottom of the detail pane and never scrolls away. The
                  Generate-reply button (Phase G — AI on demand) sits inside
                  this row between the textarea and Send; it only shows when
                  there's an inbound message and no pending draft. */}
              <ComposePanel
                conversation={selectedConversation}
                onSend={handleSendManualReply}
                onSendTemplate={sendTemplate}
                dogNames={dogNames}
                inFlight={actionInFlight}
                hasPendingDraft={!!draft}
                hasInbound={messages.some((m) => m.direction === "inbound")}
                onGenerateReply={handleGenerateReply}
              />
            </>
          )}
        </div>

        {/* Customer context — docked third column at xl+. Hidden on
            smaller breakpoints (the slide-over below replaces it). */}
        {selectedId && (
          <div className="hidden lg:flex lg:w-[280px] xl:w-[300px] lg:flex-col border-l border-slate-200 bg-white">
            <CustomerContextPanel
              context={customerContext}
              conversation={selectedConversation}
              onOpenHuman={onOpenHuman}
              onOpenDog={onOpenDog}
              onBookAppointment={() => setBookOpen(true)}
              onUpdateNotes={handleUpdateNotes}
            />
          </div>
        )}
      </div>

      {/* Slide-over for below xl. Mounted only when open so the
          backdrop and focus trap don't sit dormant in the tree. */}
      {selectedId && contextOpen && (
        <SlideOverPanel
          onClose={() => setContextOpen(false)}
          titleId="inbox-customer-context-title"
        >
          <CustomerContextPanel
            context={customerContext}
            conversation={selectedConversation}
            onOpenHuman={(id) => {
              setContextOpen(false);
              onOpenHuman?.(id);
            }}
            onOpenDog={(id) => {
              setContextOpen(false);
              onOpenDog?.(id);
            }}
            onClose={() => setContextOpen(false)}
            titleId="inbox-customer-context-title"
            onBookAppointment={() => {
              setContextOpen(false);
              setBookOpen(true);
            }}
            onUpdateNotes={handleUpdateNotes}
          />
        </SlideOverPanel>
      )}

      {bookOpen && selectedId && (
        <BookAppointmentModal
          conversation={selectedConversation}
          dogs={customerContext.dogs}
          onClose={() => setBookOpen(false)}
          onBook={handleBookAppointment}
        />
      )}

      {composeOpen && (
        <ComposeNewModal
          onClose={() => setComposeOpen(false)}
          onSent={handleComposeSent}
          onSentSMS={handleComposeSMSSent}
        />
      )}
    </div>
  );
}
