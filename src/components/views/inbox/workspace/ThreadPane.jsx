import { useCallback, useEffect, useRef } from "react";
import { formatPhoneForDisplay } from "../../../../utils/phone.js";
import { ThreadSkeleton } from "../../../ui/Skeleton.jsx";
import { displayName, formatDayToken } from "../helpers.js";
import { InitialsAvatar } from "../InitialsAvatar.jsx";
import { MarkCompleteButton } from "../MarkCompleteButton.jsx";
import { BookingActionPanel } from "../thread/BookingActionPanel.jsx";
import { BookingCreatedCard } from "../thread/BookingCreatedCard.jsx";
import { ComposePanel } from "../thread/ComposePanel.jsx";
import { DraftPanel } from "../thread/DraftPanel.jsx";
import { MessageBubble } from "../thread/MessageBubble.jsx";
import { WindowClosedBanner } from "../thread/WindowClosedBanner.jsx";

const BOTTOM_ANCHOR_PX = 80;

export function ThreadPane({
  selectedId,
  hasConversations,
  conversation,
  customerEmail,
  messages,
  draft,
  bookingActions,
  attachedActions,
  dogNamesById,
  dogNames,
  loadingDetail,
  detailError,
  actionInFlight,
  draftValue,
  onDraftChange,
  onSend,
  onRetryMessage,
  onSendTemplate,
  onGenerateReply,
  onRetryLoad,
  onBack,
  onResolve,
  onReopen,
  onOpenBooking,
  onOpenCustomer,
  bookingSuggested = false,
  contextTriggerRef,
  onApproveDraft,
  onRejectDraft,
  onApplyBookingAction,
  onRejectBookingAction,
  autoFocusSignal,
  textareaRef,
}) {
  const threadScrollRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const lastConversationIdRef = useRef(null);

  const handleThreadScroll = useCallback(() => {
    const element = threadScrollRef.current;
    if (!element) return;
    isNearBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_ANCHOR_PX;
  }, []);

  useEffect(() => {
    if (!selectedId || loadingDetail || detailError) return;
    const element = threadScrollRef.current;
    if (!element) return;
    const isFreshConversation = lastConversationIdRef.current !== selectedId;
    if (isFreshConversation || isNearBottomRef.current) {
      element.scrollTop = element.scrollHeight;
      isNearBottomRef.current = true;
    }
    lastConversationIdRef.current = selectedId;
  }, [selectedId, loadingDetail, detailError, messages.length, bookingActions.length]);

  if (!selectedId) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[14px] text-slate-500">
          {!hasConversations
            ? "Nothing here yet — when a customer messages your WhatsApp number, the thread will open here."
            : "Pick a conversation to see the thread."}
        </div>
      </div>
    );
  }

  const items = [
    ...messages.map((message) => ({
      kind: "message",
      at: message.sent_at,
      key: `m-${message.id}`,
      data: message,
    })),
    ...bookingActions
      .filter((action) => action.state === "applied" || action.state === "auto_applied")
      .map((action) => ({
        kind: "booking_created",
        at: action.applied_at || action.created_at,
        key: `a-${action.id}`,
        data: action,
      })),
  ].sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")));

  const chronology = [];
  let lastDayKey = null;
  for (const item of items) {
    const dayKey = item.at ? new Date(item.at).toDateString() : "";
    if (dayKey && dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      chronology.push(
        <div key={`day-${dayKey}`} className="my-3 flex justify-center">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
            {formatDayToken(item.at)}
          </span>
        </div>,
      );
    }
    chronology.push(
      item.kind === "message" ? (
        <MessageBubble key={item.key} message={item.data} onRetry={onRetryMessage} />
      ) : (
        <BookingCreatedCard
          key={item.key}
          action={item.data}
          dogNamesById={dogNamesById}
        />
      ),
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex flex-col gap-1.5 border-b border-slate-100 bg-brand-paper px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="h-9 w-9 rounded-full text-[18px] text-brand-purple transition-colors hover:bg-brand-purple/5 md:hidden"
              aria-label="Back to inbox"
            >
              ←
            </button>
            <InitialsAvatar
              name={displayName(conversation)}
              seed={conversation?.human_id || conversation?.phone_e164 || selectedId}
              size={36}
            />
            <div className="min-w-0">
              <span className="block max-w-[260px] truncate font-display text-[14px] font-bold leading-tight text-brand-purple">
                {displayName(conversation)}
              </span>
              <div className="truncate text-[11px] text-slate-600">
                {formatPhoneForDisplay(conversation?.phone_e164)}
                {customerEmail ? ` | ${customerEmail}` : ""}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {conversation?.closed_at && (
              <span
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500"
                title={`Closed ${new Date(conversation.closed_at).toLocaleString("en-GB")}${
                  conversation.closure_reason && conversation.closure_reason !== "manual"
                    ? ` · auto-reason: ${conversation.closure_reason}`
                    : ""
                }. A new customer message will reopen it automatically.`}
              >
                <span aria-hidden="true">✓</span>
                Closed
              </span>
            )}
            <MarkCompleteButton
              conversation={conversation}
              onResolve={onResolve}
              onReopen={onReopen}
              disabled={actionInFlight}
            />
            <button
              type="button"
              onClick={onOpenBooking}
              aria-label={bookingSuggested ? "Booking (suggested)" : undefined}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[12px] font-semibold text-brand-purple transition-colors hover:border-brand-yellow/60 wide:hidden"
            >
              Booking
              {bookingSuggested ? (
                <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-coral" />
              ) : null}
            </button>
            <button
              ref={contextTriggerRef}
              type="button"
              onClick={onOpenCustomer}
              className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-[12px] font-semibold text-brand-purple transition-colors hover:border-brand-yellow/60 wide:hidden"
            >
              Customer
            </button>
          </div>
        </div>
      </div>

      <WindowClosedBanner conversation={conversation} />

      <div
        ref={threadScrollRef}
        onScroll={handleThreadScroll}
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
        className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-brand-paper px-4 py-3 overscroll-contain"
      >
        {loadingDetail ? (
          <ThreadSkeleton bubbles={5} />
        ) : detailError ? (
          <div className="py-8 text-center text-body text-slate-600">
            Couldn&apos;t load the thread.
            <button
              type="button"
              onClick={onRetryLoad}
              className="ml-2 border-none bg-transparent p-0 font-[inherit] font-semibold text-brand-purple underline"
            >
              Retry
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="py-8 text-center text-body text-slate-500">No messages yet.</div>
        ) : chronology}
      </div>

      <div className="max-h-[45%] shrink-0 overflow-y-auto">
        {draft && (
          <DraftPanel
            draft={draft}
            conversation={conversation}
            attachedActions={attachedActions}
            onApprove={onApproveDraft}
            onReject={onRejectDraft}
            inFlight={actionInFlight}
          />
        )}
        <BookingActionPanel
          actions={bookingActions.filter((action) => action.state === "pending")}
          onApply={onApplyBookingAction}
          onReject={onRejectBookingAction}
          inFlight={actionInFlight}
        />
      </div>

      <ComposePanel
        conversation={conversation}
        value={draftValue}
        onChange={onDraftChange}
        onSend={onSend}
        onSendTemplate={onSendTemplate}
        dogNames={dogNames}
        inFlight={actionInFlight}
        hasPendingDraft={!!draft}
        hasInbound={messages.some((message) => message.direction === "inbound")}
        onGenerateReply={onGenerateReply}
        hideTemplateBanner
        autoFocusSignal={autoFocusSignal}
        textareaRef={textareaRef}
      />
    </div>
  );
}
