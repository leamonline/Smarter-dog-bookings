// ============================================================
// src/components/views/inbox/workspace/InboxWorkspaceController.jsx
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
// This file orchestrates; the pieces do the work (Debt 10):
//   useInboxListState      — the six list modes (`?filter=` in the URL),
//                             search and the bulk selection
//   useInboxActionHandlers — the hook actions wrapped with their toasts
//   useOutboundCompose     — the "New message" composer + land-in-thread
//   useInboxDeepLinks      — ?conversation= / ?human= entry points
//   useInboxWorkspaceState — pane / context-rail / per-conversation drafts
//   BulkActionBar          — the floating close-N pill
// ============================================================
import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DAILY_DOG_CAP } from "../../../../constants/salon";
import { useWhatsAppInbox } from "../../../../supabase/hooks/useWhatsAppInbox";
import { useInboxDiaryData } from "../../../../supabase/hooks/useInboxDiaryData";
import { useSalonConfig } from "../../../../supabase/hooks/useSalonConfig";
import { useToast } from "../../../../contexts/ToastContext.jsx";
import { ComposeNewModal } from "../compose-new/ComposeNewModal.jsx";
import { CustomerContextPanel } from "../customer-context/CustomerContextPanel.jsx";
import { useCustomerContext } from "../hooks/useCustomerContext.js";
import { useFillViewportHeight } from "../../../../hooks/useFillViewportHeight.js";
import { BookingActionsPane } from "../../booking-workspace/BookingActionsPane.jsx";
import {
  buildBookingRequest,
  isActiveAppointmentRequest,
  mergedRequestState,
} from "../../booking-workspace/bookingWorkspaceModel.js";
import { selectUpcomingBookings, structuredRequestDates } from "../../booking-workspace/upcomingBookings";
import { BookingCustomerPane } from "./BookingCustomerPane.jsx";
import { BulkActionBar } from "./BulkActionBar.jsx";
import { ConversationPane } from "./ConversationPane.jsx";
import { InboxWorkspaceShell } from "./InboxWorkspaceShell.jsx";
import { ThreadPane } from "./ThreadPane.jsx";
import { buildDiaryDates } from "./inboxWorkspaceModel.js";
import { isRailDocked } from "./dockedRail";
import { useInboxActionHandlers } from "./useInboxActionHandlers";
import { useInboxDeepLinks } from "./useInboxDeepLinks";
import { useInboxListState } from "./useInboxListState";
import { useInboxWorkspaceState } from "./useInboxWorkspaceState.js";
import { useOutboundCompose } from "./useOutboundCompose";

function toLocalDateStr(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function InboxView({ onOpenHuman, onOpenDog, onWhatsappReenabled } = {}) {
  const inbox = useWhatsAppInbox({ includeBookingWorkspaceData: true });
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
    sendTemplate,
    sendOutboundTemplate,
    sendOutboundSMS,
    dogNames,
    dogNamesById,
    actionInFlight,
    refreshList,
  } = inbox;
  const toast = useToast();
  const navigate = useNavigate();
  const [failedFocus, setFailedFocus] = useState(null);
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
  // Own read path for the diary, scoped to whatever date it's currently
  // showing — NOT the staff calendar's loaded week (see useInboxDiaryData
  // for why). selectedWork.dateStr is the same value already driving
  // diaryDates and the BookingActionsPane below.
  const diaryData = useInboxDiaryData(selectedWork.dateStr);

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
  const requestedDates = useMemo(
    () => structuredRequestDates([
      bookingRequest?.preferredDay,
      mergedRequestState(selectedConversation || {}).preferredDay,
    ]),
    [bookingRequest, selectedConversation],
  );
  const openRecordedBooking = useCallback((booking, reschedule = false) => {
    if (!booking?.id || !booking.date) return;
    const params = new URLSearchParams({
      booking: String(booking.id),
      date: booking.date,
    });
    if (reschedule) params.set("reschedule", "1");
    navigate(`/today?${params.toString()}`);
  }, [navigate]);

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
    // Docked, the rail is a column of its own and can stay put. Narrower it is
    // an overlay covering the thread, so it steps aside to show the reply the
    // times just landed in. See ./dockedRail for the breakpoint.
    if (!isRailDocked()) workspaceActions.closeContext();
  }, [selectedId, selectedWork.draft, workspaceActions]);

  const customerContext = useCustomerContext(selectedConversation?.human_id ?? null);
  const todayStr = toLocalDateStr(new Date());
  const upcomingBookings = useMemo(
    () => selectUpcomingBookings(customerContext.upcomingBookings || [], todayStr),
    [customerContext.upcomingBookings, todayStr],
  );

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

  const actions = useInboxActionHandlers({
    inbox,
    selectedId,
    toast,
    clearDraft: workspaceActions.clearDraft,
    refetchCustomerContext: customerContext.refetch,
  });

  const compose = useOutboundCompose({
    conversations,
    selectConversation,
    sendOutboundTemplate,
    sendOutboundSMS,
    toast,
  });

  useInboxDeepLinks({
    conversations,
    loadingList,
    selectedId,
    selectConversation,
    onFocusComposer: compose.focusComposer,
    onComposeForHuman: compose.openCompose,
  });

  const list = useInboxListState({ conversations });
  const completionQueueRef = useRef(null);
  completionQueueRef.current = { selectedId, conversations: list.displayedConversations };

  const handleResolveConversation = useCallback(async () => {
    const targetId = selectedId;
    // Capture the visible order before realtime removes the completed row.
    const queue = list.displayedConversations;
    const index = queue.findIndex((conversation) => conversation.id === targetId);
    const nextInOrder = [...queue.slice(index + 1), ...queue.slice(0, index + 1)];
    const res = await actions.resolveConversation();
    const latest = completionQueueRef.current;
    // Staff may have opened another customer while the close was saving.
    if (res?.ok && latest.selectedId === targetId) {
      const openIds = new Set(latest.conversations
        .filter((conversation) => !conversation.closed_at && conversation.id !== targetId)
        .map((conversation) => conversation.id));
      const next = nextInOrder.find((conversation) => openIds.has(conversation.id))
        ?? latest.conversations.find((conversation) => openIds.has(conversation.id));
      workspaceActions.selectConversation(next?.id ?? null);
    }
    return res;
  }, [actions, list.displayedConversations, selectedId, workspaceActions]);

  const { selectedIds, clearSelection } = list;
  const { bulkClose } = actions;
  const handleBulkClose = useCallback(async () => {
    const res = await bulkClose([...selectedIds]);
    if (res?.ok) clearSelection();
    return res;
  }, [bulkClose, selectedIds, clearSelection]);

  // Fill from the shell's real top edge to the viewport bottom rather
  // than guessing the top chrome with a magic number — robust to the
  // toolbar wrapping or a banner appearing. The h-[calc(...)] class
  // stays as the first-paint fallback until the hook measures.
  const rootRef = useRef(null);
  const fillHeight = useFillViewportHeight(rootRef);

  const conversationPane = (
    <ConversationPane
      conversations={conversations}
      displayedConversations={list.displayedConversations}
      loadingList={loadingList}
      listError={listError}
      refreshList={refreshList}
      searchQuery={list.searchQuery}
      onSearchQueryChange={list.setSearchQuery}
      onClearSearch={list.clearSearch}
      isSearching={list.isSearching}
      trimmedQuery={list.trimmedQuery}
      listFilter={list.listFilter}
      filterCounts={list.filterCounts}
      onFilterChange={(nextFilter) => {
        if (nextFilter === "all") {
          list.setListFilter("all");
          return;
        }
        list.toggleFilter(nextFilter);
      }}
      conversationSummary={list.conversationSummary}
      selectedId={selectedId}
      selectedIds={list.selectedIds}
      onSelectConversation={(conversationId) => {
        setFailedFocus(null);
        workspaceActions.selectConversation(conversationId);
      }}
      onToggleSelect={list.toggleSelect}
      onNewMessage={() => compose.openCompose()}
      onShowFailed={(conversation) => {
        workspaceActions.selectConversation(conversation.id);
        setFailedFocus({
          conversationId: conversation.id,
          messageId: conversation.latest_failed_message?.id ?? null,
        });
      }}
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
      onSend={actions.sendDraft}
      onRetryMessage={actions.retryMessage}
      onSendTemplate={sendTemplate}
      onGenerateReply={actions.generateReply}
      onRetryLoad={() => selectConversation(selectedId)}
      onBack={workspaceActions.paneBack}
      onResolve={handleResolveConversation}
      onReopen={actions.reopenConversation}
      onOpenBooking={() => workspaceActions.openContext("booking")}
      onOpenCustomer={() => workspaceActions.openContext("customer")}
      bookingSuggested={
        !!bookingRequest && !workspaceState.dismissedSuggestionIds[selectedId]
      }
      contextTriggerRef={contextTriggerRef}
      onApproveDraft={actions.approveDraft}
      onRejectDraft={actions.rejectDraft}
      onApplyBookingAction={actions.applyBookingAction}
      onRejectBookingAction={actions.rejectBookingAction}
      autoFocusSignal={compose.composeFocusSignal}
      textareaRef={composerTextareaRef}
      focusMessageId={failedFocus?.conversationId === selectedId ? failedFocus.messageId : null}
      onOpenHuman={onOpenHuman}
      onWhatsappReenabled={(result) => {
        onWhatsappReenabled?.(result.humanIds);
        // A re-enable that only touched customer records emits no
        // conversation change, so refresh the list rather than wait for one.
        void refreshList();
      }}
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
          daySettings={diaryData.daySettings}
          bookingsByDate={diaryData.bookingsByDate}
          dailyDogCap={dailyDogCap}
          onPickDate={handlePickDate}
          onInsertIntoReply={handleInsertOfferText}
          upcomingBookings={upcomingBookings}
          requestedDates={requestedDates}
          onViewBooking={(booking) => openRecordedBooking(booking, false)}
          onReschedule={(booking) => openRecordedBooking(booking, true)}
        />
      }
      customerPane={
        <CustomerContextPanel
          context={customerContext}
          conversation={selectedConversation}
          onOpenHuman={onOpenHuman}
          onOpenDog={onOpenDog}
          onUpdateNotes={actions.updateNotes}
        />
      }
    />
  ) : null;

  return (
    <div className="flex min-h-0 flex-col">
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

      {compose.composeOpen && (
        <ComposeNewModal
          onClose={compose.closeCompose}
          onSent={compose.handleComposeSent}
          onSentSMS={compose.handleComposeSMSSent}
          conversations={conversations}
          initialHumanId={compose.composeInitialHumanId}
          onOpenConversation={compose.openConversationFromCompose}
        />
      )}

      <BulkActionBar
        count={list.selectedIds.size}
        busy={actionInFlight}
        onClose={handleBulkClose}
        onClear={list.clearSelection}
      />
    </div>
  );
}
