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
//   - Pending AI booking-action panel with Apply / Reject
//   - Compose box for free-form staff replies — always visible when a
//     conversation is selected, disabled outside the 24h window
//   - "Take over" toggle — switches the conversation to human_takeover
//     so the AI stops drafting for it
//   - Auto-refreshes via realtime subscriptions in the hook
//
// Not yet:
//   - Template picker for messages outside the 24h window
// ============================================================

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useWhatsAppInbox } from "../../supabase/hooks/useWhatsAppInbox.js";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { titleCase } from "../../utils/text.js";

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
    const name = titleCase(conv.humans.name);
    const surname = conv.humans.surname ? " " + titleCase(conv.humans.surname) : "";
    return `${name}${surname}`;
  }
  return conv?.phone_e164 ?? "Unknown";
}

function confidenceLabel(c) {
  if (c == null) return "";
  if (c >= 0.9) return "high";
  if (c >= 0.6) return "medium";
  return "low";
}

// Risk-pill styling. Mirrors the deterministic risk values written by
// the agent (see supabase/functions/_shared/agentRisk.ts):
//   low    — neutral green; safe to auto-send when policy allows
//   medium — amber; staff approves as usual
//   high   — red; medical, complaint, or low-confidence — handle carefully
const RISK_STYLES = {
  low: "bg-emerald-100 text-emerald-800 border-emerald-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-red-100 text-red-800 border-red-200",
};

function RiskPill({ risk }) {
  if (!risk) return null;
  const style = RISK_STYLES[risk] ?? RISK_STYLES.medium;
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${style}`}
      title={`Risk level: ${risk}`}
    >
      {risk} risk
    </span>
  );
}

function serviceLabel(service) {
  const labels = {
    "full-groom": "Full groom",
    "bath-and-brush": "Bath & brush",
    "bath-and-deshed": "Bath & deshed",
    "puppy-groom": "Puppy groom",
  };
  return labels[service] || service || "Service";
}

function formatDateLong(dateStr) {
  if (!dateStr) return "No date";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Compact UK-style "Mon 27 Apr" used by the booking-attached banner.
// Year is omitted because the banner is showing imminent bookings; the
// full date is available in the BookingActionPanel below.
function formatShortDate(dateStr) {
  if (!dateStr) return "?";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
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
          {conv.needs_human_review && (
            <span
              className="inline-block w-2 h-2 rounded-full bg-red-500"
              title="High-risk draft — needs human review"
            />
          )}
          {conv.has_pending_draft && !conv.needs_human_review && (
            <span
              className="inline-block w-2 h-2 rounded-full bg-amber-400"
              title="AI draft pending review"
            />
          )}
          {conv.has_pending_booking_action && (
            <span
              className="inline-block w-2 h-2 rounded-full bg-emerald-500"
              title="Booking proposal pending approval"
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

function BookingActionPanel({ actions, onApply, onReject, inFlight }) {
  const [error, setError] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setError(null);
    setRejectingId(null);
    setReason("");
  }, [actions.map((action) => action.id).join("|")]);

  if (!actions?.length) return null;

  async function handleApply(actionId) {
    setError(null);
    const res = await onApply(actionId);
    if (!res.ok) setError(res.reason ?? "Could not apply booking action");
  }

  async function handleReject(actionId) {
    setError(null);
    const res = await onReject(actionId, reason);
    if (res.ok) {
      setRejectingId(null);
      setReason("");
    } else {
      setError(res.reason ?? "Could not reject booking action");
    }
  }

  return (
    <div className="p-4 bg-emerald-50 border-t-2 border-emerald-300">
      <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-800 mb-2">
        Booking proposal
      </div>

      {error && (
        <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-2">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {actions.map((action) => {
          const payload = action.payload || {};
          const isRejecting = rejectingId === action.id;
          return (
            <div key={action.id} className="bg-white border border-emerald-200 rounded-lg p-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[13px] text-slate-700">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Date</div>
                  <div className="font-bold">{formatDateLong(payload.booking_date)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Time</div>
                  <div className="font-bold">{payload.slot || "No time"}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Service</div>
                  <div className="font-bold">{serviceLabel(payload.service)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Size</div>
                  <div className="font-bold capitalize">{payload.size || "small"}</div>
                </div>
              </div>

              {payload.notes && (
                <div className="mt-2 text-[12px] text-slate-500">{payload.notes}</div>
              )}

              {isRejecting && (
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for rejecting (optional)"
                  className="mt-3 w-full text-[13px] p-2 bg-white border border-emerald-200 rounded-lg font-[inherit] resize-y"
                  rows={2}
                  maxLength={500}
                  autoFocus
                />
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                {isRejecting ? (
                  <>
                    <button
                      onClick={() => handleReject(action.id)}
                      disabled={inFlight}
                      className="px-3 py-1.5 rounded-md bg-red-600 text-white text-[13px] font-bold disabled:opacity-50"
                    >
                      Confirm reject
                    </button>
                    <button
                      onClick={() => { setRejectingId(null); setReason(""); }}
                      disabled={inFlight}
                      className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleApply(action.id)}
                      disabled={inFlight}
                      className="px-3 py-1.5 rounded-md bg-emerald-700 text-white text-[13px] font-bold disabled:opacity-50"
                    >
                      Add to diary
                    </button>
                    <button
                      onClick={() => setRejectingId(action.id)}
                      disabled={inFlight}
                      className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-600 text-[13px]"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
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

function DraftPanel({ draft, attachedActions = [], onApprove, onApproveAndApply, onReject, inFlight }) {
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

  async function handleApproveAndApply(useEditedText) {
    setError(null);
    const res = await onApproveAndApply(useEditedText ? { editedText } : {});
    if (!res.ok) setError(res.reason ?? "Send failed");
  }

  async function handleConfirmReject() {
    setError(null);
    const res = await onReject({ reason: rejectReason });
    if (!res.ok) setError(res.reason ?? "Reject failed");
  }

  return (
    <div className="p-4 bg-amber-50 border-t-2 border-amber-300">
      <div className="flex justify-between items-start gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
            AI Draft
          </span>
          <span className="text-[11px] text-amber-700">
            {draft.intent} · {confidenceLabel(draft.confidence)} confidence
          </span>
          <RiskPill risk={draft.risk_level} />
          {draft.handoff_required && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-red-100 text-red-800 border-red-200"
              title="Conversation must be handled by a human"
            >
              Needs human review
            </span>
          )}
          {draft.auto_send_eligible && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-sky-100 text-sky-800 border-sky-200"
              title="Met all auto-send gates. Whether it actually sent automatically depends on AI_AUTO_SEND_LOW_RISK and the conversation's auto_send_enabled flag."
            >
              Auto-send eligible
            </span>
          )}
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

      {attachedActions.length > 0 && !rejecting && (
        <div className="mt-2 p-2 bg-amber-100 border border-amber-300 rounded text-[12px] text-amber-900">
          <div className="font-bold mb-1">📋 Booking attached:</div>
          {attachedActions.map((action) => (
            <div key={action.id}>
              {action.payload?.dog_name ?? "<unnamed dog>"}
              {" · "}
              {formatShortDate(action.payload?.booking_date)}
              {" · "}
              {action.payload?.slot ?? "?"}
            </div>
          ))}
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
          attachedActions.length > 0 ? (
            <>
              <button
                onClick={() => handleApproveAndApply(true)}
                disabled={inFlight || !editedText.trim()}
                className="px-3 py-1.5 rounded-md bg-brand-purple text-white text-[13px] font-bold disabled:opacity-50"
              >
                Send edit &amp; Apply
              </button>
              <button
                onClick={() => handleApprove(true)}
                disabled={inFlight || !editedText.trim()}
                className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
              >
                Send edit only
              </button>
              <button
                onClick={() => { setEditing(false); setEditedText(draft.proposed_text); }}
                disabled={inFlight}
                className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
              >
                Cancel edit
              </button>
            </>
          ) : (
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
          )
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
        ) : attachedActions.length > 0 ? (
          <>
            <button
              onClick={() => handleApproveAndApply(false)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-brand-purple text-white text-[13px] font-bold disabled:opacity-50"
            >
              Approve &amp; Apply
            </button>
            <button
              onClick={() => handleApprove(false)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
            >
              Send reply only
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
    actionInFlight,
  } = useWhatsAppInbox();

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
    // Clear the param so navigating back into /whatsapp manually
    // doesn't keep snapping back to this conversation.
    const next = new URLSearchParams(searchParams);
    next.delete("conversation");
    setSearchParams(next, { replace: true });
  }, [targetConversationId, loadingList, conversations, selectedId, selectConversation, searchParams, setSearchParams]);

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
          {conversations.filter((c) => c.has_pending_draft).length} drafts ·{" "}
          {conversations.filter((c) => c.has_pending_booking_action).length} bookings
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
                inFlight={actionInFlight}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
