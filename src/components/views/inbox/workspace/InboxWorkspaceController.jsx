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
import { useEffect, useMemo, useCallback, useRef } from "react";
import { Plus } from "lucide-react";
import { DAILY_DOG_CAP } from "../../../../constants/salon";
import { useWhatsAppInbox } from "../../../../supabase/hooks/useWhatsAppInbox";
import { useInboxDiaryData } from "../../../../supabase/hooks/useInboxDiaryData";
import { useSalonConfig } from "../../../../supabase/hooks/useSalonConfig";
import { useToast } from "../../../../contexts/ToastContext.jsx";
import {
  PageHeader,
  PageHeaderAction,
} from "../../../ui/index.js";
import { ComposeNewModal } from "../compose-new/ComposeNewModal.jsx";
import { CustomerContextPanel } from "../customer-context/CustomerContextPanel.jsx";
import { useCustomerContext } from "../hooks/useCustomerContext.js";
import { useFillViewportHeight } from "../hooks/useFillViewportHeight.js";
import { BookingActionsPane } from "../../booking-workspace/BookingActionsPane.jsx";
import {
  buildBookingRequest,
  isActiveAppointmentRequest,
} from "../../booking-workspace/bookingWorkspaceModel.js";
import { BookingCustomerPane } from "./BookingCustomerPane.jsx";
import { BulkActionBar } from "./BulkActionBar.jsx";
import { ConversationPane } from "./ConversationPane.jsx";
import { InboxWorkspaceShell } from "./InboxWorkspaceShell.jsx";
import { ThreadPane } from "./ThreadPane.jsx";
import { buildDiaryDates } from "./inboxWorkspaceModel.js";
import { useInboxActionHandlers } from "./useInboxActionHandlers";
import { useInboxDeepLinks } from "./useInboxDeepLinks";
import { useInboxListState } from "./useInboxListState";
import { useInboxWorkspaceState } from "./useInboxWorkspaceState.js";
import { useOutboundCompose } from "./useOutboundCompose";

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

  const pageHeader = (
    <PageHeader
      title="Inbox"
      actions={
        <PageHeaderAction
          type="button"
          onClick={() => compose.openCompose()}
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
      onSelectConversation={workspaceActions.selectConversation}
      onToggleSelect={list.toggleSelect}
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
      onResolve={actions.resolveConversation}
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
