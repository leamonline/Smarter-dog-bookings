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
//   - Template picker for messages outside the 24h window
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useWhatsAppInbox } from "../../supabase/hooks/useWhatsAppInbox.js";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { titleCase } from "../../utils/text.js";
import { WHATSAPP_TEMPLATES } from "../../constants/whatsappTemplates.js";
import { SALON_SLOTS, SERVICES } from "../../constants/index.ts";

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

// AutoSendToggle — flips whatsapp_conversations.auto_send_enabled
// for the selected conversation. This is the per-conversation gate
// described in the README's "Turning auto-send on safely" section.
//
// Important UX caveats baked into the title text (not enforced here —
// staff need to be able to flip it on per-conversation BEFORE the
// global env flag goes live so the rollout is gradual):
//   - The global AI_AUTO_SEND_LOW_RISK env flag must also be 'true'
//     on the function for any draft to actually auto-send.
//   - Even when both are true, a draft only auto-sends when it's
//     low-risk + handoff-free + in the auto-send intent allowlist.
//   - human_takeover conversations don't get drafts at all, so the
//     toggle is moot in that state. We disable it then.
function AutoSendToggle({ conversation, onChange, disabled }) {
  if (!conversation) return null;
  const enabled = !!conversation.auto_send_enabled;
  const inHumanTakeover = conversation.state === "human_takeover";
  const isDisabled = !!disabled || inHumanTakeover;

  const title = inHumanTakeover
    ? "Auto-send is moot while staff have taken over the conversation."
    : enabled
      ? "Auto-send is on for this conversation. Low-risk drafts may send without staff approval (also requires AI_AUTO_SEND_LOW_RISK=true at function level)."
      : "Auto-send is off. All drafts wait for staff approval.";

  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      disabled={isDisabled}
      title={title}
      aria-pressed={enabled}
      className={`px-2.5 py-1.5 rounded-md text-[12px] font-bold border transition-colors disabled:opacity-50 ${
        enabled
          ? "bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200"
          : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span aria-hidden="true" className="mr-1">{enabled ? "●" : "○"}</span>
      Auto-send {enabled ? "on" : "off"}
    </button>
  );
}

function ConversationListItem({ conv, isSelected, onSelect }) {
  const unread = conv.unread_count > 0;
  return (
    <button
      onClick={() => onSelect(conv.id)}
      className={`relative w-full text-left px-3 py-2.5 border-b border-slate-100 transition-colors cursor-pointer font-[inherit] border-l-2 ${
        isSelected
          ? "bg-brand-yellow/10 border-l-brand-yellow"
          : "bg-white hover:bg-slate-50 border-l-transparent"
      }`}
    >
      <div className="flex justify-between items-start gap-2 mb-0.5">
        <span className={`text-[13px] truncate ${unread ? "font-bold text-brand-purple" : "font-semibold text-brand-purple/90"}`}>
          {displayName(conv)}
        </span>
        <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
          {formatWhen(conv.last_inbound_at)}
        </span>
      </div>
      <div className="flex justify-between items-center gap-2">
        <span className={`text-[11px] truncate ${unread ? "text-slate-700" : "text-slate-500"}`}>
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
  // Edited values keyed by action.id. Lets staff fix the date / slot /
  // service / size the AI proposed before adding it to the diary.
  const [edits, setEdits] = useState({});

  useEffect(() => {
    setError(null);
    setRejectingId(null);
    setReason("");
    setEdits({});
  }, [actions.map((action) => action.id).join("|")]);

  if (!actions?.length) return null;

  const getValue = (action, field) => {
    const e = edits[action.id]?.[field];
    if (e !== undefined) return e;
    return action.payload?.[field] ?? "";
  };

  const setValue = (actionId, field, value) => {
    setEdits((prev) => ({
      ...prev,
      [actionId]: { ...(prev[actionId] || {}), [field]: value },
    }));
  };

  const buildEditedPayload = (action) => {
    const e = edits[action.id];
    if (!e) return null;
    const merged = { ...(action.payload || {}), ...e };
    // Only send if at least one field actually differs.
    const changed = Object.keys(e).some(
      (k) => (action.payload || {})[k] !== e[k],
    );
    return changed ? merged : null;
  };

  async function handleApply(action) {
    setError(null);
    const editedPayload = buildEditedPayload(action);
    const res = await onApply(action.id, editedPayload);
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
    <div className="px-4 pt-3 pb-2 bg-emerald-50/60 border-t border-emerald-200">
      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800/80 mb-2">
        Booking proposal
      </div>

      {error && (
        <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 mb-2">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {actions.map((action) => {
          const isRejecting = rejectingId === action.id;
          const date = getValue(action, "booking_date");
          const slot = getValue(action, "slot");
          const service = getValue(action, "service");
          const size = getValue(action, "size") || "small";

          // Build the slot list — SALON_SLOTS plus any value already
          // on the action that isn't in the standard set (e.g. an
          // extra slot the AI suggested). Keeps the dropdown honest.
          const slotOptions = Array.from(
            new Set([...SALON_SLOTS, slot].filter(Boolean)),
          );

          return (
            <div
              key={action.id}
              className="bg-white border border-emerald-200 rounded-2xl px-3 py-2.5 shadow-[0_1px_3px_rgba(16,185,129,0.06)]"
            >
              {isRejecting ? (
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for rejecting (optional)"
                  className="w-full text-[13px] p-2 bg-white border border-emerald-200 rounded-lg font-[inherit] resize-y mb-2"
                  rows={2}
                  maxLength={500}
                  autoFocus
                />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <FieldDate
                    label="Date"
                    value={date}
                    onChange={(v) => setValue(action.id, "booking_date", v)}
                  />
                  <FieldSelect
                    label="Time"
                    value={slot}
                    onChange={(v) => setValue(action.id, "slot", v)}
                    options={slotOptions.map((s) => ({ value: s, label: s }))}
                    placeholder="Slot"
                  />
                  <FieldSelect
                    label="Service"
                    value={service}
                    onChange={(v) => setValue(action.id, "service", v)}
                    options={SERVICES.map((s) => ({ value: s.id, label: s.name }))}
                    placeholder="Service"
                  />
                  <FieldSelect
                    label="Size"
                    value={size}
                    onChange={(v) => setValue(action.id, "size", v)}
                    options={[
                      { value: "small", label: "Small" },
                      { value: "medium", label: "Medium" },
                      { value: "large", label: "Large" },
                    ]}
                  />
                </div>
              )}

              {action.payload?.notes && !isRejecting && (
                <div className="mt-1.5 text-[11px] text-slate-500 line-clamp-2">
                  {action.payload.notes}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-2">
                {isRejecting ? (
                  <>
                    <button
                      onClick={() => handleReject(action.id)}
                      disabled={inFlight}
                      className="inline-flex items-center h-8 px-3 rounded-full bg-brand-coral text-white text-[12px] font-bold cursor-pointer disabled:opacity-50 font-[inherit]"
                    >
                      Confirm reject
                    </button>
                    <button
                      onClick={() => { setRejectingId(null); setReason(""); }}
                      disabled={inFlight}
                      className="inline-flex items-center h-8 px-3 rounded-full bg-white border border-slate-200 text-slate-700 text-[12px] font-semibold cursor-pointer disabled:opacity-50 font-[inherit]"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleApply(action)}
                      disabled={inFlight}
                      className="inline-flex items-center h-8 px-3 rounded-full bg-brand-yellow text-brand-purple text-[12px] font-bold cursor-pointer disabled:opacity-50 hover:bg-brand-yellow-dark transition-colors font-[inherit]"
                    >
                      Add to diary
                    </button>
                    <button
                      onClick={() => setRejectingId(action.id)}
                      disabled={inFlight}
                      className="inline-flex items-center h-8 px-3 rounded-full bg-white border border-slate-200 text-slate-600 text-[12px] font-semibold cursor-pointer disabled:opacity-50 hover:border-brand-coral/60 hover:text-brand-coral transition-colors font-[inherit]"
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

function FieldDate({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
        {label}
      </span>
      <input
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[13px] font-semibold text-brand-purple bg-white border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none focus:border-brand-yellow font-[inherit] min-h-[36px]"
      />
    </label>
  );
}

function FieldSelect({ label, value, onChange, options, placeholder }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
        {label}
      </span>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[13px] font-semibold text-brand-purple bg-white border border-slate-200 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none focus:border-brand-yellow font-[inherit] min-h-[36px]"
      >
        {placeholder && !value && <option value="">{placeholder}…</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
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
function ComposePanel({ conversation, onSend, onSendTemplate, dogNames, inFlight }) {
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
      <div className="p-3 bg-white border-t border-slate-200">
        <TemplatePicker
          conversation={conversation}
          dogNames={dogNames ?? []}
          onSend={onSendTemplate}
        />
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
          className="flex-1 text-[14px] p-2 bg-white border border-slate-200 rounded-xl font-[inherit] resize-y disabled:opacity-50 focus:outline-none focus:border-brand-yellow"
        />
        <button
          onClick={handleSend}
          disabled={inFlight || !text.trim()}
          className="self-stretch inline-flex items-center px-4 rounded-full bg-brand-yellow text-brand-purple text-[13px] font-bold cursor-pointer disabled:opacity-50 hover:bg-brand-yellow-dark transition-colors shrink-0 font-[inherit]"
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

// ── Template picker ─────────────────────────────────────────
// Shown in ComposePanel when the 24h free-form text window is closed.
// Lets staff pick a Meta-approved template, fill in any params, preview
// the message, then send it via whatsapp-send (mode:"template").
function TemplatePicker({ conversation, dogNames, onSend }) {
  const [selectedTemplateName, setSelectedTemplateName] = useState(WHATSAPP_TEMPLATES[0].name);
  const [paramValues, setParamValues] = useState({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const template = WHATSAPP_TEMPLATES.find((t) => t.name === selectedTemplateName);

  // Auto-fill known params from conversation context whenever the selected
  // template or conversation changes.
  useEffect(() => {
    const autoFilled = {};
    const customerFirstName = conversation?.humans?.name ?? "";
    const firstDog = (dogNames ?? [])[0] ?? "";

    for (const param of template.params) {
      if (param.autoFill === "customer_first_name") autoFilled[param.key] = customerFirstName;
      else if (param.autoFill === "dog_name_select") autoFilled[param.key] = firstDog;
    }
    setParamValues(autoFilled);
    setSent(false);
    setError(null);
  }, [selectedTemplateName, conversation?.id, dogNames, template]);

  const allFilled = template.params.every((p) => (paramValues[p.key] ?? "").trim() !== "");
  const preview = template.preview(paramValues);

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      await onSend(template, paramValues);
      setSent(true);
    } catch (err) {
      setError(err.message ?? "Failed to send template");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="p-3 text-sm text-green-700 bg-green-50 rounded-lg border border-green-200">
        ✓ Template sent. The customer will receive the message shortly.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-xs font-medium text-amber-800">
        24h window closed — send a template message instead
      </p>

      <div>
        <label className="block text-xs text-slate-600 mb-1">Template</label>
        <select
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          value={selectedTemplateName}
          onChange={(e) => setSelectedTemplateName(e.target.value)}
        >
          {WHATSAPP_TEMPLATES.map((t) => (
            <option key={t.name} value={t.name}>{t.label}</option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">{template.description}</p>
      </div>

      {template.params.map((param) => {
        if (param.autoFill === "dog_name_select" && (dogNames ?? []).length > 1) {
          return (
            <div key={param.key}>
              <label className="block text-xs text-slate-600 mb-1">{param.label}</label>
              <select
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
                value={paramValues[param.key] ?? ""}
                onChange={(e) => setParamValues((prev) => ({ ...prev, [param.key]: e.target.value }))}
              >
                <option value="">Select a dog…</option>
                {dogNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          );
        }
        return (
          <div key={param.key}>
            <label className="block text-xs text-slate-600 mb-1">{param.label}</label>
            <input
              type="text"
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
              value={paramValues[param.key] ?? ""}
              onChange={(e) => setParamValues((prev) => ({ ...prev, [param.key]: e.target.value }))}
              placeholder={`Enter ${param.label.toLowerCase()}…`}
            />
          </div>
        );
      })}

      <div className="bg-white border border-slate-200 rounded p-3 text-sm text-slate-700 whitespace-pre-wrap">
        {preview}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSend}
        disabled={!allFilled || sending}
        className="self-end px-4 py-2 text-sm font-medium rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? "Sending…" : "Send Template"}
      </button>
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
    setAutoSendEnabled,
    sendTemplate,
    dogNames,
    actionInFlight,
  } = useWhatsAppInbox();

  // List filter: "all" or "needs_review". When "needs_review", only
  // conversations whose latest pending draft is high-risk or has
  // handoff_required surface in the list. Helps staff triage during
  // a busy day — the same red-dot conversations bubble to a clean
  // dedicated view without losing the "scroll the full inbox" mode.
  const [listFilter, setListFilter] = useState("all");
  const needsReviewCount = conversations.filter((c) => c.needs_human_review).length;
  const filteredConversations =
    listFilter === "needs_review"
      ? conversations.filter((c) => c.needs_human_review)
      : conversations;

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
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold m-0 text-brand-purple font-display leading-tight truncate">
              WhatsApp inbox
            </h2>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)} unread
              <span className="text-slate-300"> · </span>
              {conversations.filter((c) => c.has_pending_draft).length} drafts
              <span className="text-slate-300"> · </span>
              {conversations.filter((c) => c.has_pending_booking_action).length} bookings
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {needsReviewCount > 0 && (
            <button
              type="button"
              onClick={() =>
                setListFilter((prev) => (prev === "needs_review" ? "all" : "needs_review"))
              }
              aria-pressed={listFilter === "needs_review"}
              title={
                listFilter === "needs_review"
                  ? "Showing only conversations whose latest draft is high-risk or marked for human review. Click to show all."
                  : "Show only conversations whose latest draft is high-risk or marked for human review."
              }
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-bold border transition-colors font-[inherit] ${
                listFilter === "needs_review"
                  ? "bg-rose-100 border-rose-200 text-rose-800 hover:bg-rose-200"
                  : "bg-white border-slate-200 text-slate-600 hover:border-rose-300 hover:text-rose-700"
              }`}
            >
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              Needs review · {needsReviewCount}
            </button>
          )}
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
            <div className="p-6 text-center text-slate-400 text-[13px]">
              No WhatsApp conversations yet.
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-[13px]">
              No high-risk conversations right now.{" "}
              <button
                type="button"
                onClick={() => setListFilter("all")}
                className="underline text-slate-500 hover:text-slate-700"
              >
                Show all
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
            <div className="flex-1 flex items-center justify-center text-slate-400 text-[14px]">
              Select a conversation to see the thread.
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-brand-paper">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => selectConversation(null)}
                    className="md:hidden text-brand-purple text-[18px] w-9 h-9 rounded-full hover:bg-brand-purple/5 transition-colors"
                    aria-label="Back to inbox"
                  >←</button>
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-brand-purple font-display leading-tight truncate">
                      {displayName(selectedConversation)}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {selectedConversation?.phone_e164} · {selectedConversation?.state}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AutoSendToggle
                    conversation={selectedConversation}
                    onChange={setAutoSendEnabled}
                    disabled={actionInFlight}
                  />
                  {selectedConversation?.state === "ai_handling" ? (
                    <button
                      onClick={takeoverConversation}
                      disabled={actionInFlight}
                      className="inline-flex items-center h-8 px-3 rounded-full bg-white border border-slate-200 text-brand-purple text-[12px] font-semibold cursor-pointer disabled:opacity-50 hover:border-brand-yellow/60 transition-colors font-[inherit]"
                    >
                      Take over
                    </button>
                  ) : selectedConversation?.state === "human_takeover" ? (
                    <button
                      onClick={releaseConversation}
                      disabled={actionInFlight}
                      className="inline-flex items-center h-8 px-3 rounded-full bg-white border border-slate-200 text-brand-purple text-[12px] font-semibold cursor-pointer disabled:opacity-50 hover:border-brand-yellow/60 transition-colors font-[inherit]"
                    >
                      Hand back to AI
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Thread */}
              <div className="flex-1 overflow-y-auto px-4 py-3 bg-brand-paper">
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
