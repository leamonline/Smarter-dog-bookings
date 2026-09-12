// ============================================================
// Booking Desk — the flagged preview of the responsive workspace.
//
// This route renders the SAME shell and panes as /inbox (conversation
// list, full thread, Booking/Customer context) so the layout can be
// reviewed at every breakpoint. Offline it is driven entirely by the
// sample fixtures in bookingWorkspaceSamples.js, which is what makes it
// safe to open at any width without touching real customer data.
//
// Gated by FEATURE_FLAGS.booking_workspace_enabled and owner/dev-offline
// access in App.jsx — see the route definition there.
// ============================================================

import { useCallback, useMemo, useRef, useState } from "react";
import { Clock3 } from "lucide-react";

import { DAILY_DOG_CAP } from "../../../constants/salon";
import { useSalon } from "../../../contexts/SalonContext";
import { useWhatsAppInbox } from "../../../supabase/hooks/useWhatsAppInbox";
import { PageHeader, PageHeaderPill } from "../../ui/PageHeader.jsx";
import { CustomerContextPanel } from "../inbox/customer-context/CustomerContextPanel.jsx";
import { useCustomerContext } from "../inbox/hooks/useCustomerContext.js";
import { useFillViewportHeight } from "../../../hooks/useFillViewportHeight.js";
import { BookingCustomerPane } from "../inbox/workspace/BookingCustomerPane.jsx";
import { ConversationPane } from "../inbox/workspace/ConversationPane.jsx";
import { InboxWorkspaceShell } from "../inbox/workspace/InboxWorkspaceShell.jsx";
import { ThreadPane } from "../inbox/workspace/ThreadPane.jsx";
import { buildDiaryDates } from "../inbox/workspace/inboxWorkspaceModel.js";
import { isRailDocked } from "../inbox/workspace/dockedRail";
import { useInboxWorkspaceState } from "../inbox/workspace/useInboxWorkspaceState.js";
import { BookingPane } from "./BookingPane.jsx";
import {
  buildBookingRequest,
  isActiveAppointmentRequest,
  toggleDraftSlot,
} from "./bookingWorkspaceModel.js";
import {
  SAMPLE_BOOKING_WORKSPACE_CONTEXT,
  SAMPLE_BOOKING_WORKSPACE_CONVERSATIONS,
  SAMPLE_BOOKING_WORKSPACE_MESSAGES,
} from "./bookingWorkspaceSamples.js";

const MAX_SLOT_CHOICES = 3;

const EMPTY_CONTEXT = {
  human: null,
  dogs: [],
  lastBooking: null,
  trustedContacts: [],
  loading: false,
  error: null,
};

const noop = () => {};
const noopAsync = async () => ({ ok: false, reason: "Preview only — nothing is sent." });

function toLocalDateStr(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function BookingWorkspaceView({
  isOnline,
  currentDateStr,
  onPickDate,
  dailyDogCap = DAILY_DOG_CAP,
}) {
  const salon = useSalon();
  const inbox = useWhatsAppInbox({ includeBookingWorkspaceData: true });
  const rootRef = useRef(null);
  const fillHeight = useFillViewportHeight(rootRef);
  const composerTextareaRef = useRef(null);
  const contextTriggerRef = useRef(null);

  const [offlineSelectedId, setOfflineSelectedId] = useState(
    SAMPLE_BOOKING_WORKSPACE_CONVERSATIONS[0]?.id ?? null,
  );

  const conversations = isOnline
    ? inbox.conversations
    : SAMPLE_BOOKING_WORKSPACE_CONVERSATIONS;
  const selectedId = isOnline ? inbox.selectedId : offlineSelectedId;
  const selectedConversation = isOnline
    ? inbox.selectedConversation
    : conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const messages = isOnline
    ? inbox.messages
    : SAMPLE_BOOKING_WORKSPACE_MESSAGES[selectedId] ?? [];

  const liveContext = useCustomerContext(
    isOnline ? selectedConversation?.human_id ?? null : null,
  );
  const customerContext = isOnline
    ? liveContext
    : SAMPLE_BOOKING_WORKSPACE_CONTEXT[selectedId] ?? EMPTY_CONTEXT;

  const { state: workspaceState, actions: workspaceActions } = useInboxWorkspaceState({
    initialConversationId: selectedId,
    initialDateStr: currentDateStr,
    onSelectConversation: isOnline ? inbox.selectConversation : setOfflineSelectedId,
  });

  const selectedWork = workspaceState.workByConversation[selectedId] ?? {
    draft: "",
    dateStr: currentDateStr,
    slots: [],
  };

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

  const handleToggleSlot = useCallback((choice) => {
    if (!selectedId) return;
    const result = toggleDraftSlot(selectedWork.slots, choice, MAX_SLOT_CHOICES);
    if (result.choices === selectedWork.slots) return;
    workspaceActions.setSlots(selectedId, result.choices);
  }, [selectedId, selectedWork.slots, workspaceActions]);

  const handlePickDate = useCallback((date) => {
    if (!selectedId) return;
    workspaceActions.setDate(selectedId, toLocalDateStr(date));
    // Keep the parent calendar in step with the diary the preview is showing.
    onPickDate?.(date);
  }, [onPickDate, selectedId, workspaceActions]);

  const handleClearSlots = useCallback(() => {
    if (!selectedId) return;
    workspaceActions.setSlots(selectedId, []);
  }, [selectedId, workspaceActions]);

  const handleInsertSlots = useCallback(() => {
    if (!selectedId) return;
    workspaceActions.insertSlots(selectedId);
    requestAnimationFrame(() => composerTextareaRef.current?.focus());
    // Docked, the rail is a column of its own and can stay put; narrower it
    // is an overlay over the thread and steps aside. ../inbox/workspace/dockedRail
    // owns the breakpoint so this preview and /inbox cannot disagree.
    if (!isRailDocked()) workspaceActions.closeContext();
  }, [selectedId, workspaceActions]);

  const conversationPane = (
    <ConversationPane
      conversations={conversations}
      displayedConversations={conversations}
      loadingList={isOnline && inbox.loadingList}
      listError={isOnline ? inbox.listError : null}
      refreshList={isOnline ? inbox.refreshList : noop}
      searchQuery=""
      onSearchQueryChange={noop}
      onClearSearch={noop}
      isSearching={false}
      trimmedQuery=""
      listFilter="all"
      filterCounts={{
        all: conversations.length,
        awaiting_reply: 0,
        failed_sends: conversations.filter((c) => c.has_failed_message).length,
        unread: conversations.filter((c) => (c.unread_count || 0) > 0).length,
        drafts: conversations.filter((c) => c.has_pending_draft).length,
        done: 0,
      }}
      onFilterChange={noop}
      conversationSummary={`${conversations.length} active conversation${
        conversations.length === 1 ? "" : "s"
      }`}
      selectedId={selectedId}
      selectedIds={new Set()}
      onSelectConversation={workspaceActions.selectConversation}
      onToggleSelect={noop}
    />
  );

  const threadPane = (
    <ThreadPane
      selectedId={selectedId}
      hasConversations={conversations.length > 0}
      conversation={selectedConversation}
      customerEmail={customerContext.human?.email}
      messages={messages}
      draft={null}
      bookingActions={[]}
      attachedActions={[]}
      dogNamesById={{}}
      dogNames={[]}
      loadingDetail={isOnline && inbox.loadingDetail}
      detailError={isOnline ? inbox.detailError : null}
      actionInFlight={false}
      draftValue={selectedWork.draft}
      onDraftChange={(value) => workspaceActions.setDraft(selectedId, value)}
      onSend={noopAsync}
      onRetryMessage={noopAsync}
      onSendTemplate={noopAsync}
      onGenerateReply={noopAsync}
      onRetryLoad={noop}
      onBack={workspaceActions.paneBack}
      onResolve={noopAsync}
      onReopen={noopAsync}
      onOpenBooking={() => workspaceActions.openContext("booking")}
      onOpenCustomer={() => workspaceActions.openContext("customer")}
      bookingSuggested={
        !!bookingRequest && !workspaceState.dismissedSuggestionIds[selectedId]
      }
      contextTriggerRef={contextTriggerRef}
      onApproveDraft={noopAsync}
      onRejectDraft={noopAsync}
      onApplyBookingAction={noopAsync}
      onRejectBookingAction={noopAsync}
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
        <BookingPane
          request={bookingRequest}
          dates={diaryDates}
          currentDateStr={selectedWork.dateStr}
          daySettings={salon.daySettings}
          bookingsByDate={salon.bookingsByDate}
          dailyDogCap={dailyDogCap}
          choices={selectedWork.slots}
          onToggleChoice={handleToggleSlot}
          onPickDate={handlePickDate}
          atLimit={selectedWork.slots.length >= MAX_SLOT_CHOICES}
          onClear={handleClearSlots}
          onInsertIntoReply={handleInsertSlots}
          showInsertAction
        />
      }
      customerPane={
        <CustomerContextPanel
          context={customerContext}
          conversation={selectedConversation}
          onOpenHuman={noop}
          onOpenDog={noop}
          onBookAppointment={noop}
          onUpdateNotes={noopAsync}
        />
      }
    />
  ) : null;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <PageHeader title="Booking Desk" className="mb-0 shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0">
            <div aria-hidden="true" className="font-display text-xl font-extrabold text-brand-purple">
              Booking Desk
            </div>
            <p className="truncate text-caption font-semibold text-slate-500">
              Requests, diary and booking context together
            </p>
          </div>
          <PageHeaderPill tone="closed">
            {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
          </PageHeaderPill>
        </div>
        <div className="hidden items-center gap-1.5 text-caption font-semibold text-slate-500 sm:flex">
          <Clock3 aria-hidden="true" size={15} /> Draft choices only
        </div>
      </PageHeader>

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
    </div>
  );
}
