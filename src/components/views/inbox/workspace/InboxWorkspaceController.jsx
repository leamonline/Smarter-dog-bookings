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
import { Plus } from "lucide-react";
import { DAILY_DOG_CAP } from "../../../../constants/salon";
import { useSalon } from "../../../../contexts/SalonContext";
import { useWhatsAppInbox } from "../../../../supabase/hooks/useWhatsAppInbox.js";
import { useSalonConfig } from "../../../../supabase/hooks/useSalonConfig.js";
import { useToast } from "../../../../contexts/ToastContext.jsx";
import { Spinner } from "../../../ui/Spinner.jsx";
import {
  PageHeader,
  PageHeaderAction,
} from "../../../ui/index.js";
import {
  displayName,
  isAwaitingReply,
} from "../helpers.js";
import { ComposeNewModal } from "../compose-new/ComposeNewModal.jsx";
import { CustomerContextPanel } from "../customer-context/CustomerContextPanel.jsx";
import { useCustomerContext } from "../hooks/useCustomerContext.js";
import { useInboxMessageSearch } from "../hooks/useInboxMessageSearch.js";
import { useFillViewportHeight } from "../hooks/useFillViewportHeight.js";
import { BookAppointmentModal } from "../customer-context/BookAppointmentModal.jsx";
import { BookingActionsPane } from "../../booking-workspace/BookingActionsPane.jsx";
import {
  buildBookingRequest,
  isActiveAppointmentRequest,
} from "../../booking-workspace/bookingWorkspaceModel.js";
import { BookingCustomerPane } from "./BookingCustomerPane.jsx";
import { ConversationPane } from "./ConversationPane.jsx";
import { InboxWorkspaceShell } from "./InboxWorkspaceShell.jsx";
import { ThreadPane } from "./ThreadPane.jsx";
import { buildDiaryDates } from "./inboxWorkspaceModel.js";
import { useInboxWorkspaceState } from "./useInboxWorkspaceState.js";

// At 1440px and above the context rail is permanently docked, so inserting
// slots leaves it in place. Narrower, it is an overlay covering the thread and
// must step aside once the times are in the reply.
const DOCKED_RAIL_QUERY = "(min-width: 1440px)";

function isRailDocked() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.(DOCKED_RAIL_QUERY)?.matches === true;
}

function toLocalDateStr(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

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
    rejectDraft,
    sendManualReply,
    applyBookingAction,
    rejectBookingAction,
    resolveConversation,
    reopenConversation,
    bulkResolveConversations,
    bulkReopenConversations,
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
  } = useWhatsAppInbox({ includeBookingWorkspaceData: true });
  const toast = useToast();
  const salon = useSalon();
  // The authoritative cap lives in salon_config; fall back to the shared
  // constant only while that loads so the diary never over-offers.
  const { config: salonConfig } = useSalonConfig();
  const dailyDogCap = salonConfig?.dailyDogCap ?? DAILY_DOG_CAP;
  const initialDateStr = useMemo(() => toLocalDateStr(new Date()), []);
  const { state: workspaceState, actions: workspaceActions } = useInboxWorkspaceState({
    initialConversationId: selectedId,
    initialDateStr,
    onSelectConversation: selectConversation,
  });
  const contextTriggerRef = useRef(null);
  const composerTextareaRef = useRef(null);
  const selectedWork = workspaceState.workByConversation[selectedId] ?? {
    draft: "",
    dateStr: initialDateStr,
    slots: [],
  };

  useEffect(() => {
    workspaceActions.syncSelectedConversation(selectedId);
  }, [selectedId, workspaceActions]);

  // Booking intent is derived from the same model the Booking Desk queue uses,
  // so the two surfaces can never disagree about what counts as an active
  // appointment request. It only ever labels the Booking header — nothing here
  // opens, moves or focuses a panel on the customer's behalf.
  const bookingRequest = useMemo(
    () => (selectedConversation && isActiveAppointmentRequest(selectedConversation)
      ? buildBookingRequest(selectedConversation)
      : null),
    [selectedConversation],
  );
  const diaryDates = useMemo(
    () => buildDiaryDates(selectedWork.dateStr),
    [selectedWork.dateStr],
  );

  const handlePickDate = useCallback((date) => {
    if (!selectedId) return;
    workspaceActions.setDate(selectedId, toLocalDateStr(date));
  }, [selectedId, workspaceActions]);

  // Same contract for the Booking pane's composed offer: append, focus, and
  // hand back to the normal send path. Nothing is sent from here, so the
  // WhatsApp 24-hour window and template rules stay with the composer.
  const handleInsertOfferText = useCallback((text) => {
    if (!selectedId || !text) return;
    const existing = selectedWork.draft || "";
    const next = existing.trim() ? `${existing.trimEnd()}\n\n${text}` : text;
    workspaceActions.setDraft(selectedId, next);
    requestAnimationFrame(() => composerTextareaRef.current?.focus());
    if (!isRailDocked()) workspaceActions.closeContext();
  }, [selectedId, selectedWork.draft, workspaceActions]);

  // Wrap the hook actions with success toasts so screen-reader users
  // hear confirmation (errors stay inline in the panels — they need
  // the surrounding context to make sense). Toasts go through the
  // aria-live region inside ToastProvider so they're announced
  // without stealing focus.
  const handleApproveDraft = useCallback(async (opts) => {
    const res = await approveDraft(opts);
    if (res?.ok) toast.show("Reply sent", "success");
    return res;
  }, [approveDraft, toast]);

  const handleRejectDraft = useCallback(async (opts) => {
    const res = await rejectDraft(opts);
    if (res?.ok) toast.show("Draft rejected.", "info");
    return res;
  }, [rejectDraft, toast]);

  const handleSendManualReply = useCallback(async (opts) => {
    const res = await sendManualReply(opts);
    if (res?.ok) toast.show("Reply sent", "success");
    return res;
  }, [sendManualReply, toast]);

  const handleSendDraft = useCallback(async (opts) => {
    const res = await handleSendManualReply(opts);
    if (res?.ok) workspaceActions.clearDraft(selectedId);
    return res;
  }, [handleSendManualReply, selectedId, workspaceActions]);

  const handleRetryMessage = useCallback(
    (message) => handleSendManualReply({ text: message.content }),
    [handleSendManualReply],
  );

  const handleApplyBookingAction = useCallback(async (actionId, editedPayload) => {
    const res = await applyBookingAction(actionId, editedPayload);
    if (res?.ok) toast.show("Booking added to the diary", "success");
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
      toast.show("Conversation closed", "success", () => reopenConversation(targetId));
    } else if (res?.reason) {
      toast.show(`Could not close: ${res.reason}`, "error");
    }
    return res;
  }, [resolveConversation, reopenConversation, selectedId, toast]);

  const handleReopenConversation = useCallback(async () => {
    const res = await reopenConversation();
    if (res?.ok) toast.show("Conversation reopened", "info");
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
      toast.show("Suggested reply added — review and send when ready", "info");
    } else if (res?.ok) {
      toast.show("The AI didn't have a suggestion this time — give it another go", "info");
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
    if (res?.ok) toast.show("Booking added to the diary", "success");
    else if (res?.reason) toast.show(`Could not book: ${res.reason}`, "error");
    return res;
  }, [createStaffBooking, toast]);

  // Compose-new modal — outbound entry point. Opens from the header
  // button; after a successful send, close the modal and select the
  // freshly-upserted conversation so staff land straight in the thread.
  const [composeOpen, setComposeOpen] = useState(false);
  // Pre-target the new-message composer at a specific customer (deep-link from
  // "Message owner" when they have no existing thread).
  const [composeInitialHumanId, setComposeInitialHumanId] = useState(null);
  // Bumped to ask the reply box to focus after a deep-link opens a thread.
  const [composeFocusSignal, setComposeFocusSignal] = useState(0);
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

  // Close the book-appointment modal when switching conversations so a
  // booking form holding the previous customer's dog does not follow staff
  // into the newly selected thread. Workspace state closes the context pane.
  useEffect(() => {
    setBookOpen(false);
  }, [selectedId]);
  const customerContext = useCustomerContext(selectedConversation?.human_id ?? null);

  // The conversation row already carries this customer's dogs (id, name,
  // breed, size), so the booking pane can render immediately rather than
  // waiting on the customer-context fetch. The fuller record wins once it
  // lands — it also carries alerts and groom notes.
  const bookingPaneDogs = useMemo(
    () => (customerContext?.dogs?.length
      ? customerContext.dogs
      : selectedConversation?.humans?.dogs || []),
    [customerContext?.dogs, selectedConversation],
  );

  // "Update notes" — AI reads the thread and appends durable customer
  // notes + dog grooming requests to their records (nothing is sent).
  // On success, refresh the panel so new dog groom-notes show straight
  // away. Returns the result so the panel button can manage its busy
  // state.
  const handleUpdateNotes = useCallback(async () => {
    const res = await updateNotesFromConversation(selectedId);
    if (res?.ok) {
      toast.show(res.summary ?? "Notes updated", "success");
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

  // Multi-select for bulk close. A Set of conversation ids ticked via the
  // per-row checkboxes; >0 reveals the floating action bar. Cleared whenever
  // the filter or search mode changes, so a hidden row can never be closed by
  // a selection the staff member can no longer see.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  useEffect(() => {
    setSelectedIds(new Set());
  }, [listFilter, isSearching]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Bulk close: one round-trip closes every ticked conversation, then a single
  // undo toast reopens exactly those ids (mirrors the single-close undo). No
  // confirm modal — the undo toast is the safety net at any count. Realtime
  // echoes the closes into the list with no extra wiring.
  const handleBulkClose = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const res = await bulkResolveConversations(ids);
    if (res?.ok) {
      clearSelection();
      const n = res.ids.length;
      toast.show(
        `${n} conversation${n === 1 ? "" : "s"} closed`,
        "success",
        () => bulkReopenConversations(res.ids),
      );
    } else if (res?.reason) {
      toast.show(`Could not close: ${res.reason}`, "error");
    }
    return res;
  }, [selectedIds, bulkResolveConversations, bulkReopenConversations, clearSelection, toast]);

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

  // Deep-link by human: ?human=<id> lands staff in that human's WhatsApp/SMS
  // ready to type. Callers like "Message owner" only know the human id, so
  // resolve human_id → conversation here (mirrors the ?conversation= effect).
  // If a thread exists we open it AND focus the reply box; if not, we open the
  // new-message composer pre-targeted at that customer so first contact works
  // too. Wait for the list so the lookup is reliable.
  const targetHumanId = searchParams.get("human");
  useEffect(() => {
    if (!targetHumanId) return;
    if (loadingList) return;
    const conv = conversations.find((c) => c.human_id === targetHumanId);
    if (conv) {
      if (selectedId !== conv.id) selectConversation(conv.id);
      // Focus the composer so staff can start typing straight away.
      setComposeFocusSignal((n) => n + 1);
    } else {
      // No thread yet — open the new-message composer targeted at this human.
      setComposeInitialHumanId(targetHumanId);
      setComposeOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("human");
    setSearchParams(next, { replace: true });
  }, [targetHumanId, loadingList, conversations, selectedId, selectConversation, searchParams, setSearchParams]);

  // Fill from the shell's real top edge to the viewport bottom rather
  // than guessing the top chrome with a magic number — robust to the
  // toolbar wrapping or a banner appearing. The h-[calc(...)] class
  // stays as the first-paint fallback until the hook measures.
  const rootRef = useRef(null);
  const fillHeight = useFillViewportHeight(rootRef);

  const conversationSummary = isSearching
    ? searchingMessages
      ? `Searching all messages for “${trimmedQuery}”…`
      : `${displayedConversations.length} result${displayedConversations.length === 1 ? "" : "s"} for “${trimmedQuery}”`
    : listFilter === "all"
      ? `${activeConversations.length} active conversation${activeConversations.length === 1 ? "" : "s"}`
      : listFilter === "done"
        ? `${closedConversations.length} closed conversation${closedConversations.length === 1 ? "" : "s"}`
        : `Filtered: ${FILTER_LABELS[listFilter]} · ${filteredConversations.length} of ${activeConversations.length}`;

  const pageHeader = (
    <PageHeader
      title="Inbox"
      actions={
        <PageHeaderAction
          type="button"
          onClick={() => setComposeOpen(true)}
          title="Start a new WhatsApp thread with a customer. Meta requires an approved template for first contact."
          icon={Plus}
        >
          New message
        </PageHeaderAction>
      }
    />
  );

  const conversationPane = (
    <ConversationPane
      conversations={conversations}
      displayedConversations={displayedConversations}
      loadingList={loadingList}
      listError={listError}
      refreshList={refreshList}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      onClearSearch={() => setSearchQuery("")}
      isSearching={isSearching}
      trimmedQuery={trimmedQuery}
      listFilter={listFilter}
      filterCounts={{
        all: activeConversations.length,
        awaiting_reply: awaitingReplyCount,
        failed_sends: failedSendCount,
        unread: unreadCount,
        drafts: draftsCount,
        done: doneCount,
      }}
      onFilterChange={(nextFilter) => {
        if (nextFilter === "all") {
          setListFilter("all");
          return;
        }
        toggleFilter(nextFilter);
      }}
      conversationSummary={conversationSummary}
      selectedId={selectedId}
      selectedIds={selectedIds}
      onSelectConversation={workspaceActions.selectConversation}
      onToggleSelect={toggleSelect}
    />
  );

  const threadPane = (
    <ThreadPane
      selectedId={selectedId}
      hasConversations={conversations.length > 0}
      conversation={selectedConversation}
      customerEmail={customerContext.human?.email}
      messages={messages}
      draft={draft}
      bookingActions={bookingActions}
      attachedActions={attachedActions}
      dogNamesById={dogNamesById}
      dogNames={dogNames}
      loadingDetail={loadingDetail}
      detailError={detailError}
      actionInFlight={actionInFlight}
      draftValue={selectedWork.draft}
      onDraftChange={(value) => workspaceActions.setDraft(selectedId, value)}
      onSend={handleSendDraft}
      onRetryMessage={handleRetryMessage}
      onSendTemplate={sendTemplate}
      onGenerateReply={handleGenerateReply}
      onRetryLoad={() => selectConversation(selectedId)}
      onBack={workspaceActions.paneBack}
      onResolve={handleResolveConversation}
      onReopen={handleReopenConversation}
      onOpenBooking={() => workspaceActions.openContext("booking")}
      onOpenCustomer={() => workspaceActions.openContext("customer")}
      bookingSuggested={
        !!bookingRequest && !workspaceState.dismissedSuggestionIds[selectedId]
      }
      contextTriggerRef={contextTriggerRef}
      onApproveDraft={handleApproveDraft}
      onRejectDraft={handleRejectDraft}
      onApplyBookingAction={handleApplyBookingAction}
      onRejectBookingAction={handleRejectBookingAction}
      autoFocusSignal={composeFocusSignal}
      textareaRef={composerTextareaRef}
    />
  );

  const contextPane = selectedId ? (
    <BookingCustomerPane
      expandedSection={workspaceState.contextSection}
      bookingSuggested={!!bookingRequest}
      suggestionDismissed={!!workspaceState.dismissedSuggestionIds[selectedId]}
      onExpand={workspaceActions.openContext}
      onDismissSuggestion={() => workspaceActions.dismissSuggestion(selectedId)}
      bookingPane={
        <BookingActionsPane
          conversationId={selectedId}
          customerName={customerContext?.human?.fullName || bookingRequest?.customerName || ""}
          dogs={bookingPaneDogs}
          lastServiceByDogId={customerContext?.lastServiceByDogId}
          dates={diaryDates}
          currentDateStr={selectedWork.dateStr}
          daySettings={salon.daySettings}
          bookingsByDate={salon.bookingsByDate}
          dailyDogCap={dailyDogCap}
          onPickDate={handlePickDate}
          onInsertIntoReply={handleInsertOfferText}
        />
      }
      customerPane={
        <CustomerContextPanel
          context={customerContext}
          conversation={selectedConversation}
          onOpenHuman={onOpenHuman}
          onOpenDog={onOpenDog}
          onBookAppointment={() => setBookOpen(true)}
          onUpdateNotes={handleUpdateNotes}
        />
      }
    />
  ) : null;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {pageHeader}
      <InboxWorkspaceShell
        rootRef={rootRef}
        fillHeight={fillHeight}
        mobilePane={workspaceState.mobilePane}
        contextOpen={workspaceState.contextOpen}
        contextSection={workspaceState.contextSection}
        conversationPane={conversationPane}
        threadPane={threadPane}
        contextPane={contextPane}
        onPaneBack={workspaceActions.paneBack}
        onDismissContext={workspaceActions.closeContext}
        returnFocusRef={contextTriggerRef}
      />

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
          onClose={() => { setComposeOpen(false); setComposeInitialHumanId(null); }}
          onSent={handleComposeSent}
          onSentSMS={handleComposeSMSSent}
          conversations={conversations}
          initialHumanId={composeInitialHumanId}
          onOpenConversation={(id) => {
            selectConversation(id);
            setComposeOpen(false);
            setComposeInitialHumanId(null);
          }}
        />
      )}

      {/* Bulk-select action bar — floats above the list while ≥1 conversation
          is ticked. Closing is reopenable, so there's no confirm step; the
          success toast carries the undo.
          A full-width wrapper centres the pill via flexbox (not a translate),
          which leaves `transform` free for the pop-in animation and keeps the
          bar clear of the iPhone home indicator via the safe-area offset. The
          wrapper is click-through so it never blocks the list behind it. */}
      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-3 pointer-events-none">
          <div
            role="region"
            aria-label="Bulk actions"
            className="pointer-events-auto animate-card-pop-in inline-flex items-center gap-3 max-w-[calc(100vw-1.5rem)] px-3 py-2 rounded-full bg-brand-purple text-white shadow-lg shadow-brand-purple/30 ring-1 ring-white/10"
          >
            <span className="text-[13px] font-semibold pl-1 whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={handleBulkClose}
              disabled={actionInFlight}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-brand-yellow text-brand-purple text-[12px] font-bold whitespace-nowrap cursor-pointer hover:bg-brand-yellow-dark active:scale-[0.97] motion-safe:transition-transform transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60 disabled:cursor-not-allowed font-[inherit]"
            >
              {actionInFlight ? (
                <>
                  <Spinner size="sm" className="text-brand-purple" label="Closing" />
                  Closing…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Close {selectedIds.size} conversation{selectedIds.size === 1 ? "" : "s"}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="text-[12px] font-semibold text-white/80 hover:text-white pr-1 cursor-pointer bg-transparent border-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 font-[inherit]"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
