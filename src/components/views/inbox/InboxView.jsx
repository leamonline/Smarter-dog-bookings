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

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useWhatsAppInbox } from "../../../supabase/hooks/useWhatsAppInbox.js";
import { LoadingSpinner } from "../../ui/LoadingSpinner.jsx";
import { displayName } from "./helpers.js";
import { InboxFilterChip } from "./InboxFilterChip.jsx";
import { StatusPill } from "./StatusPill.jsx";
import { ConversationListItem } from "./conversation-list/ConversationListItem.jsx";
import { AutoSendToggle } from "./thread/AutoSendToggle.jsx";
import { AutonomousBookingToggle } from "./thread/AutonomousBookingToggle.jsx";
import { MessageBubble } from "./thread/MessageBubble.jsx";
import { DraftPanel } from "./thread/DraftPanel.jsx";
import { BookingActionPanel } from "./thread/BookingActionPanel.jsx";
import { ComposePanel } from "./thread/ComposePanel.jsx";

export function InboxView() {
  const {
    conversations,
    loadingList,
    selectedId,
    selectedConversation,
    messages,
    draft,
    bookingActions,
    attachedActions,
    loadingDetail,
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
    sendTemplate,
    dogNames,
    actionInFlight,
  } = useWhatsAppInbox();

  // List filter: one of "all" | "unread" | "drafts" | "bookings" | "needs_review".
  // "all" is the default and shows every conversation. The other modes
  // pre-filter the list to a specific subset so staff can triage in
  // focused sweeps without losing the "scroll the full inbox" mode.
  // Clicking the active chip clears the filter (returns to "all").
  const [listFilter, setListFilter] = useState("all");
  const unreadCount = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),
    [conversations],
  );
  const draftsCount = useMemo(
    () => conversations.filter((c) => c.has_pending_draft).length,
    [conversations],
  );
  const bookingsCount = useMemo(
    () => conversations.filter((c) => c.has_pending_booking_action).length,
    [conversations],
  );
  const needsReviewCount = useMemo(
    () => conversations.filter((c) => c.needs_human_review).length,
    [conversations],
  );

  const filteredConversations = useMemo(() => {
    switch (listFilter) {
      case "unread":
        return conversations.filter((c) => (c.unread_count || 0) > 0);
      case "drafts":
        return conversations.filter((c) => c.has_pending_draft);
      case "bookings":
        return conversations.filter((c) => c.has_pending_booking_action);
      case "needs_review":
        return conversations.filter((c) => c.needs_human_review);
      case "all":
      default:
        return conversations;
    }
  }, [conversations, listFilter]);

  const toggleFilter = useCallback((next) => {
    setListFilter((prev) => (prev === next ? "all" : next));
  }, []);

  const FILTER_LABELS = {
    unread: "unread",
    drafts: "pending drafts",
    bookings: "pending booking proposals",
    needs_review: "high-risk drafts",
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

  // Mobile: show detail when a conversation is selected
  const showDetailOnMobile = !!selectedId;

  return (
    <div className="py-2.5 flex flex-col gap-3 h-[calc(100vh-180px)]">
      <div className="flex justify-between items-start gap-3 flex-wrap">
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
              {listFilter === "all"
                ? `${conversations.length} conversation${conversations.length === 1 ? "" : "s"}`
                : `Filtered: ${FILTER_LABELS[listFilter]} · ${filteredConversations.length} of ${conversations.length}`}
            </div>
          </div>
        </div>
        <div
          className="flex items-center gap-2 flex-wrap"
          role="group"
          aria-label="Filter conversations"
        >
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
            label="Bookings"
            count={bookingsCount}
            active={listFilter === "bookings"}
            onClick={() => toggleFilter("bookings")}
            color="emerald"
            hint="Show only conversations with a pending AI booking proposal."
          />
          <InboxFilterChip
            label="Needs review"
            count={needsReviewCount}
            active={listFilter === "needs_review"}
            onClick={() => toggleFilter("needs_review")}
            color="rose"
            hint="Show only conversations whose latest draft is high-risk or marked for human review."
          />
        </div>
      </div>

      <div className="flex-1 flex bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
        {/* List pane */}
        <div
          className={`w-full md:w-[320px] border-r border-slate-200 flex flex-col ${
            showDetailOnMobile ? "hidden md:flex" : "flex"
          }`}
        >
          {loadingList ? (
            <div className="p-4"><LoadingSpinner /></div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-slate-600 text-[13px]">
              <p className="font-semibold text-brand-purple mb-1">No WhatsApp conversations yet</p>
              <p className="text-[12px] text-slate-500">
                When a customer messages your WhatsApp number, their thread will appear here.
              </p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-slate-600 text-[13px]">
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
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              {filteredConversations.map((c) => (
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
                        {selectedConversation?.state && (
                          <StatusPill state={selectedConversation.state} size="xs" />
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 truncate">
                        {selectedConversation?.phone_e164}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <AutoSendToggle
                      conversation={selectedConversation}
                      onChange={setAutoSendEnabled}
                      disabled={actionInFlight}
                    />
                    <AutonomousBookingToggle
                      conversation={selectedConversation}
                      onChange={setAutonomousBookingEnabled}
                      disabled={actionInFlight}
                    />
                    {selectedConversation?.state === "ai_handling" ? (
                      <button
                        onClick={takeoverConversation}
                        disabled={actionInFlight}
                        title="Take this conversation off the AI so you can drive it directly. Stops fresh AI drafts until you hand it back."
                        className="inline-flex items-center h-8 px-3 rounded-full bg-white border border-slate-200 text-brand-purple text-[12px] font-semibold cursor-pointer disabled:opacity-50 hover:border-brand-yellow/60 transition-colors font-[inherit]"
                      >
                        Take over
                      </button>
                    ) : selectedConversation?.state === "human_takeover" ? (
                      <button
                        onClick={releaseConversation}
                        disabled={actionInFlight}
                        title="Hand control back to the AI. New customer messages will get fresh AI drafts again."
                        className="inline-flex items-center h-8 px-3 rounded-full bg-white border border-slate-200 text-brand-purple text-[12px] font-semibold cursor-pointer disabled:opacity-50 hover:border-brand-yellow/60 transition-colors font-[inherit]"
                      >
                        Hand back to AI
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  {selectedConversation?.state === "human_takeover"
                    ? "Staff are handling this chat — the AI won't draft replies until you hand it back."
                    : selectedConversation?.auto_send_enabled
                      ? "AI is drafting and low-risk replies may auto-send. Take over to pause."
                      : "AI is drafting; every reply waits for your approval. Auto-send is off."}
                </p>
              </div>

              {/* Thread — kept visible above any draft / booking / template
                  panels via min-h, so staff can always read history while
                  deciding how to reply. */}
              <div className="flex-1 min-h-[180px] overflow-y-auto px-4 py-3 bg-brand-paper">
                {loadingDetail ? (
                  <LoadingSpinner />
                ) : messages.length === 0 ? (
                  <div className="text-center text-slate-500 text-[13px] py-8">
                    No messages yet.
                  </div>
                ) : (
                  messages.map((m) => <MessageBubble key={m.id} message={m} />)
                )}
              </div>

              {/* Pending AI draft — only rendered when there is one */}
              {draft && (
                <DraftPanel
                  draft={draft}
                  attachedActions={attachedActions}
                  onApprove={approveDraft}
                  onApproveAndApply={approveDraftAndApply}
                  onReject={rejectDraft}
                  inFlight={actionInFlight}
                />
              )}

              <BookingActionPanel
                actions={bookingActions}
                onApply={applyBookingAction}
                onReject={rejectBookingAction}
                inFlight={actionInFlight}
              />

              {/* Free-form compose box — always available when a
                  conversation is selected, gated on the 24h window */}
              <ComposePanel
                conversation={selectedConversation}
                onSend={sendManualReply}
                onSendTemplate={sendTemplate}
                dogNames={dogNames}
                inFlight={actionInFlight}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
