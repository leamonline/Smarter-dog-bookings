// ============================================================
// src/components/views/WhatsAppInboxView.jsx
//
// The staff WhatsApp inbox. Two-pane layout on desktop (list + detail),
// stacked on mobile. Uses the useWhatsAppInbox hook for all data/actions.
//
// Feature set:
//   - Conversations list with unread badges, pending-draft indicator
//   - Thread view showing the full message history
//   - Pending AI draft panel with Approve / Edit & Send / Reject
//   - Compose box for free-form staff replies — always visible when a
//     conversation is selected, disabled outside the 24h window
//   - "Take over" toggle — switches the conversation to human_takeover
//     so the AI stops drafting for it
//   - Auto-refreshes via realtime subscriptions in the hook
//
// Not yet:
//   - Template picker for messages outside the 24h window
//   - Booking-action approval (whatsapp_booking_actions) — separate screen
// ============================================================

import { useState, useEffect } from "react";
import { useWhatsAppInbox } from "../../supabase/hooks/useWhatsAppInbox.js";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";

// ── Formatting helpers ──────────────────────────────────────
function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  const yday = new Date(now);
  yday.setDate(yday.getDate() - 1);
  if (d.toDateString() === yday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function displayName(conv) {
  if (conv?.humans?.name) {
    return `${conv.humans.name}${conv.humans.surname ? " " + conv.humans.surname : ""}`;
  }
  return conv?.phone_e164 ?? "Unknown";
}

function confidenceLabel(c) {
  if (c == null) return "";
  if (c >= 0.9) return "high";
  if (c >= 0.6) return "medium";
  return "low";
}

// Meta only lets us send free-form text within 24h of the customer's
// last inbound message. Client-side check mirrors the backend check
// in whatsapp-send so we can disable the compose box before the user
// writes anything. Backend still enforces — this is a UX hint, not
// security. Returns true if the window is currently open.
const WINDOW_MS = 24 * 60 * 60 * 1000;
function isWindowOpen(lastInboundAt) {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < WINDOW_MS;
}

// Human-friendly "window closes in Xh Ym" — shown as a soft hint next
// to the compose box so staff know when they'll lose free-form.
function windowCountdown(lastInboundAt) {
  if (!lastInboundAt) return null;
  const remaining = WINDOW_MS - (Date.now() - new Date(lastInboundAt).getTime());
  if (remaining <= 0) return null;
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 1) return `Window closes in ${hours}h ${mins}m`;
  return `Window closes in ${mins}m`;
}

// ── Components ──────────────────────────────────────────────
function ConversationListItem({ conv, isSelected, onSelect }) {
  const unread = conv.unread_count > 0;
  return (
    <button
      onClick={() => onSelect(conv.id)}
      className={`w-full text-left px-3 py-3 border-b border-slate-100 transition-colors ${
        isSelected ? "bg-slate-100" : "hover:bg-slate-50"
      }`}
    >
      <div className="flex justify-between items-start gap-2 mb-1">
        <span className={`text-[14px] ${unread ? "font-bold" : "font-semibold"} text-slate-800 truncate`}>
          {displayName(conv)}
        </span>
        <span className="text-[11px] text-slate-400 shrink-0">
          {formatWhen(conv.last_inbound_at)}
        </span>
      </div>
      <div className="flex justify-between items-center gap-2">
        <span className={`text-[12px] truncate ${unread ? "text-slate-700" : "text-slate-500"}`}>
          {conv.last_customer_text ?? "(no text)"}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {conv.has_pending_draft && (
            <span
              className="inline-block w-2 h-2 rounded-full bg-amber-400"
              title="AI draft pending review"
            />
          )}
          {unread && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-brand-purple text-white text-[10px] font-bold">
              {conv.unread_count}
            </span>
          )}
          {conv.state === "human_takeover" && (
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              human
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ message }) {
  const isInbound = message.direction === "inbound";
  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"} mb-2`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-[14px] whitespace-pre-wrap ${
          isInbound
            ? "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
            : "bg-green-100 text-slate-800 rounded-br-sm"
        }`}
      >
        {message.content ?? <span className="italic text-slate-400">(non-text message)</span>}
        <div className="text-[10px] text-slate-400 mt-1 text-right">
          {formatWhen(message.sent_at)}
          {!isInbound && message.status && message.status !== "sent" && (
            <span className="ml-1">· {message.status}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftPanel({ draft, onApprove, onReject, inFlight }) {
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState(draft?.proposed_text ?? "");
  const [error, setError] = useState(null);
  // Two-step reject: first click opens the reason textarea, second
  // click (with or without a reason) actually rejects. Keeps the
  // "quick reject" path fast while letting staff log insight when
  // they have it.
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    setEditedText(draft?.proposed_text ?? "");
    setEditing(false);
    setError(null);
    setRejecting(false);
    setRejectReason("");
  }, [draft?.id]);

  if (!draft) {
    return (
      <div className="p-4 bg-slate-50 border-t border-slate-200 text-[13px] text-slate-500 italic">
        No pending AI draft for this conversation.
      </div>
    );
  }

  async function handleApprove(useEditedText) {
    setError(null);
    const res = await onApprove(useEditedText ? { editedText } : {});
    if (!res.ok) setError(res.reason ?? "Send failed");
  }

  async function handleConfirmReject() {
    setError(null);
    const res = await onReject({ reason: rejectReason });
    if (!res.ok) setError(res.reason ?? "Reject failed");
  }

  return (
    <div className="p-4 bg-amber-50 border-t-2 border-amber-300">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
            AI Draft
          </span>
          <span className="text-[11px] text-amber-700">
            {draft.intent} · {confidenceLabel(draft.confidence)} confidence
          </span>
        </div>
        <span className="text-[11px] text-slate-400">{draft.model}</span>
      </div>

      {editing ? (
        <textarea
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          className="w-full text-[14px] p-2 bg-white border border-amber-300 rounded-lg font-[inherit] resize-y"
          rows={4}
        />
      ) : (
        <div className="text-[14px] text-slate-800 whitespace-pre-wrap mb-2">
          {draft.proposed_text}
        </div>
      )}

      {rejecting && (
        <div className="mt-2">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-amber-800 mb-1">
            Why are you rejecting? (optional — helps us tune the AI)
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. tone too formal, should have offered a slot, wrong info about the dog…"
            className="w-full text-[14px] p-2 bg-white border border-amber-300 rounded-lg font-[inherit] resize-y"
            rows={3}
            maxLength={500}
            autoFocus
          />
        </div>
      )}

      {error && (
        <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded p-2 my-2">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-2">
        {editing ? (
          <>
            <button
              onClick={() => handleApprove(true)}
              disabled={inFlight || !editedText.trim()}
              className="px-3 py-1.5 rounded-md bg-brand-purple text-white text-[13px] font-bold disabled:opacity-50"
            >
              Send edit
            </button>
            <button
              onClick={() => { setEditing(false); setEditedText(draft.proposed_text); }}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
            >
              Cancel edit
            </button>
          </>
        ) : rejecting ? (
          <>
            <button
              onClick={handleConfirmReject}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-red-600 text-white text-[13px] font-bold disabled:opacity-50"
            >
              Confirm reject
            </button>
            <button
              onClick={() => { setRejecting(false); setRejectReason(""); }}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => handleApprove(false)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-brand-purple text-white text-[13px] font-bold disabled:opacity-50"
            >
              Approve &amp; send
            </button>
            <button
              onClick={() => setEditing(true)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
            >
              Edit first
            </button>
            <button
              onClick={() => setRejecting(true)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-500 text-[13px]"
            >
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Compose box for free-form staff replies. Always visible when a
// conversation is selected. Disabled outside the 24h window with a
// hint that the template picker is coming. Enter sends, Shift+Enter
// inserts a newline — matches WhatsApp and most chat apps.
function ComposePanel({ conversation, onSend, inFlight }) {
  const [text, setText] = useState("");
  const [error, setError] = useState(null);

  // Reset input when the user switches to a different conversation,
  // so a half-typed message doesn't get sent to the wrong person.
  useEffect(() => {
    setText("");
    setError(null);
  }, [conversation?.id]);

  const windowOpen = isWindowOpen(conversation?.last_inbound_at);
  const countdown = windowOpen ? windowCountdown(conversation?.last_inbound_at) : null;

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || inFlight) return;
    setError(null);
    const res = await onSend({ text: trimmed });
    if (res?.ok) {
      setText("");
    } else {
      setError(res?.reason ?? "Send failed");
    }
  }

  function handleKeyDown(e) {
    // Enter = send, Shift+Enter = newline. Matches WhatsApp.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!windowOpen) {
    return (
      <div className="p-4 bg-slate-50 border-t border-slate-200">
        <div className="text-[13px] text-slate-600">
          <span className="font-bold">24h window closed.</span>{" "}
          Can't send a free-form reply — the customer hasn't messaged us in the last 24 hours.
          Template picker coming soon; for now, use the WhatsApp consumer app on your phone if it's urgent.
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-white border-t border-slate-200">
      {error && (
        <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-2">
          {error}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a reply…"
          disabled={inFlight}
          rows={2}
          maxLength={2000}
          className="flex-1 text-[14px] p-2 bg-white border border-slate-300 rounded-lg font-[inherit] resize-y disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={inFlight || !text.trim()}
          className="px-4 py-2 rounded-md bg-brand-purple text-white text-[13px] font-bold disabled:opacity-50 shrink-0"
        >
          Send
        </button>
      </div>
      <div className="flex justify-between items-center mt-1">
        <span className="text-[11px] text-slate-400">
          Enter to send · Shift+Enter for new line
        </span>
        {countdown && (
          <span className="text-[11px] text-slate-400">{countdown}</span>
        )}
      </div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────
export function WhatsAppInboxView() {
  const {
    conversations,
    loadingList,
    selectedId,
    selectedConversation,
    messages,
    draft,
    loadingDetail,
    selectConversation,
    approveDraft,
    rejectDraft,
    sendManualReply,
    takeoverConversation,
    releaseConversation,
    actionInFlight,
  } = useWhatsAppInbox();

  // Mobile: show detail when a conversation is selected
  const showDetailOnMobile = !!selectedId;

  return (
    <div className="py-2.5 flex flex-col gap-3 h-[calc(100vh-180px)]">
      <div className="flex justify-between items-center">
        <h2 className="text-[22px] font-extrabold m-0 text-slate-800 font-display">
          WhatsApp
        </h2>
        <div className="text-[12px] text-slate-500">
          {conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)} unread ·{" "}
          {conversations.filter((c) => c.has_pending_draft).length} awaiting review
        </div>
      </div>

      <div className="flex-1 flex bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* List pane */}
        <div
          className={`w-full md:w-[320px] border-r border-slate-200 flex flex-col ${
            showDetailOnMobile ? "hidden md:flex" : "flex"
          }`}
        >
          {loadingList ? (
            <div className="p-4"><LoadingSpinner /></div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-[13px]">
              No WhatsApp conversations yet.
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              {conversations.map((c) => (
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
            <div className="flex-1 flex items-center justify-center text-slate-400 text-[14px]">
              Select a conversation to see the thread.
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => selectConversation(null)}
                    className="md:hidden text-slate-500 text-[18px]"
                    aria-label="Back to inbox"
                  >←</button>
                  <div>
                    <div className="text-[15px] font-bold text-slate-800">
                      {displayName(selectedConversation)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {selectedConversation?.phone_e164} · state: {selectedConversation?.state}
                    </div>
                  </div>
                </div>
                <div>
                  {selectedConversation?.state === "ai_handling" ? (
                    <button
                      onClick={takeoverConversation}
                      disabled={actionInFlight}
                      className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[12px] font-bold"
                    >
                      Take over
                    </button>
                  ) : selectedConversation?.state === "human_takeover" ? (
                    <button
                      onClick={releaseConversation}
                      disabled={actionInFlight}
                      className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[12px] font-bold"
                    >
                      Hand back to AI
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Thread */}
              <div className="flex-1 overflow-y-auto px-4 py-3 bg-slate-50">
                {loadingDetail ? (
                  <LoadingSpinner />
                ) : messages.length === 0 ? (
                  <div className="text-center text-slate-400 text-[13px] py-8">
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
                  onApprove={approveDraft}
                  onReject={rejectDraft}
                  inFlight={actionInFlight}
                />
              )}

              {/* Free-form compose box — always available when a
                  conversation is selected, gated on the 24h window */}
              <ComposePanel
                conversation={selectedConversation}
                onSend={sendManualReply}
                inFlight={actionInFlight}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
