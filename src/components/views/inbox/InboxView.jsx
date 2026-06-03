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
import { useToast } from "../../../contexts/ToastContext.jsx";
import { LoadingSpinner } from "../../ui/LoadingSpinner.jsx";
import { displayName } from "./helpers.js";
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
import { GenerateReplyButton } from "./thread/GenerateReplyButton.jsx";
import { CustomerContextPanel } from "./customer-context/CustomerContextPanel.jsx";
import { SlideOverPanel } from "./customer-context/SlideOverPanel.jsx";
import { useCustomerContext } from "./hooks/useCustomerContext.js";

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
    sendTemplate,
    sendOutboundTemplate,
    sendOutboundSMS,
    generateReplyForConversation,
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

  // Compose-new modal — outbound entry point. Opens from the header
  // button; after a successful send, close the modal and select the
  // freshly-upserted conversation so staff land straight in the thread.
  const [composeOpen, setComposeOpen] = useState(false);
  const handleComposeSent = useCallback(async (payload) => {
    const res = await sendOutboundTemplate(payload);
    if (res?.ok) {
      setComposeOpen(false);
      toast.show("Template sent — opening the thread.", "success");
      const phoneDigits = (payload.phoneE164 ?? "").replace(/\D/g, "");
      const match = conversations.find(
        (c) =>
          (c.phone_e164 ?? "").replace(/\D/g, "") === phoneDigits &&
          (c.channel ?? "whatsapp") === "whatsapp",
      );
      if (match) selectConversation(match.id);
    } else if (res?.reason) {
      toast.show(`Could not send: ${res.reason}`, "error");
    }
    return res;
  }, [sendOutboundTemplate, conversations, selectConversation, toast]);

  const handleComposeSMSSent = useCallback(async (payload) => {
    const res = await sendOutboundSMS(payload);
    if (res?.ok) {
      setComposeOpen(false);
      toast.show("SMS sent — opening the thread.", "success");
      const phoneDigits = (payload.phoneE164 ?? "").replace(/\D/g, "");
      const match = conversations.find(
        (c) =>
          (c.phone_e164 ?? "").replace(/\D/g, "") === phoneDigits &&
          c.channel === "sms",
      );
      if (match) selectConversation(match.id);
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
  // Close the slide-over when switching conversations so a half-open
  // panel doesn't follow staff around.
  useEffect(() => {
    setContextOpen(false);
  }, [selectedId]);
  const customerContext = useCustomerContext(selectedConversation?.human_id ?? null);

  // List filter: one of "all" | "unread" | "drafts" | "bookings" | "needs_review" | "done".
  // "all" is the default and shows every ACTIVE conversation (closed
  // conversations only appear under the "done" chip). The other active
  // modes pre-filter to a specific subset so staff can triage in
  // focused sweeps. Clicking the active chip clears the filter (back
  // to "all"). "done" is its own filter — clicking it again returns
  // to "all" (active queue).
  const [listFilter, setListFilter] = useState("all");

  // Split active vs closed once so each counter doesn't re-walk the list.
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
    () => activeConversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),
    [activeConversations],
  );
  const draftsCount = useMemo(
    () => activeConversations.filter((c) => c.has_pending_draft).length,
    [activeConversations],
  );
  const bookingsCount = useMemo(
    () => activeConversations.filter((c) => c.has_pending_booking_action).length,
    [activeConversations],
  );
  const needsReviewCount = useMemo(
    () =>
      activeConversations.filter(
        (c) => c.needs_human_review || !!c.closure_suggested_at,
      ).length,
    [activeConversations],
  );
  const doneCount = closedConversations.length;

  const filteredConversations = useMemo(() => {
    switch (listFilter) {
      case "unread":
        return activeConversations.filter((c) => (c.unread_count || 0) > 0);
      case "drafts":
        return activeConversations.filter((c) => c.has_pending_draft);
      case "bookings":
        return activeConversations.filter((c) => c.has_pending_booking_action);
      case "needs_review": {
        // Sort suggested-close convs to the top of Needs review so they
        // surface first; otherwise keep last_inbound_at order.
        const matches = activeConversations.filter(
          (c) => c.needs_human_review || !!c.closure_suggested_at,
        );
        return [...matches].sort((a, b) => {
          const aSugg = a.closure_suggested_at ? 1 : 0;
          const bSugg = b.closure_suggested_at ? 1 : 0;
          if (aSugg !== bSugg) return bSugg - aSugg;
          return 0;
        });
      }
      case "done":
        return closedConversations;
      case "all":
      default:
        return activeConversations;
    }
  }, [activeConversations, closedConversations, listFilter]);

  const toggleFilter = useCallback((next) => {
    setListFilter((prev) => (prev === next ? "all" : next));
  }, []);

  const FILTER_LABELS = {
    unread: "unread",
    drafts: "pending drafts",
    bookings: "pending booking proposals",
    needs_review: "needs review",
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

  // Mobile: show detail when a conversation is selected
  const showDetailOnMobile = !!selectedId;

  return (
    <div className="py-2.5 flex flex-col gap-3 min-h-[60dvh] h-[calc(100dvh-180px)]">
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
            hint="Show only conversations whose latest draft is high-risk, marked for human review, or auto-suggested for closure by the daily pass."
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
            <div className="p-4"><LoadingSpinner /></div>
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
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-slate-600 text-body">
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
                      </div>
                      <div className="text-[11px] text-slate-600 truncate">
                        {formatPhoneForDisplay(selectedConversation?.phone_e164)}
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
                      className="xl:hidden inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white border border-slate-200 text-brand-purple text-[12px] font-semibold cursor-pointer hover:border-brand-yellow/60 transition-colors font-[inherit]"
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
              <div className="flex-1 min-h-[180px] overflow-y-auto px-4 py-3 bg-brand-paper">
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

              {/* Phase G — AI on demand. Shown when there's at least
                  one inbound message and no pending draft. Hidden
                  during in-flight actions to avoid stacking. */}
              <GenerateReplyButton
                hasPendingDraft={!!draft}
                hasInbound={messages.some((m) => m.direction === "inbound")}
                inFlight={actionInFlight}
                onGenerate={async () => {
                  const res = await generateReplyForConversation(selectedId);
                  if (res?.ok) {
                    toast.show("Asking the AI… a draft will appear below shortly.", "info");
                  } else if (res?.reason) {
                    toast.show(`Could not generate: ${res.reason}`, "error");
                  }
                }}
              />

              {/* Free-form compose box — always available when a
                  conversation is selected, gated on the 24h window */}
              <ComposePanel
                conversation={selectedConversation}
                onSend={handleSendManualReply}
                onSendTemplate={sendTemplate}
                dogNames={dogNames}
                inFlight={actionInFlight}
              />
            </>
          )}
        </div>

        {/* Customer context — docked third column at xl+. Hidden on
            smaller breakpoints (the slide-over below replaces it). */}
        {selectedId && (
          <div className="hidden xl:flex xl:w-[300px] xl:flex-col border-l border-slate-200 bg-white">
            <CustomerContextPanel
              context={customerContext}
              conversation={selectedConversation}
              onOpenHuman={onOpenHuman}
              onOpenDog={onOpenDog}
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
          />
        </SlideOverPanel>
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
