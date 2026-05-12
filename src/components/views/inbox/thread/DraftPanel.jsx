// ============================================================
// src/components/views/inbox/thread/DraftPanel.jsx
//
// The pending AI-draft card. Renders the proposed reply with intent
// + confidence + risk metadata, and a five-mode action bar:
//   - idle, no attached action: Approve & send / Edit first / Reject
//   - idle, attached action:    Approve & Apply / Send reply only / Edit first / Reject
//   - editing, no attached:     Send edit / Cancel edit
//   - editing, attached:        Send edit & Apply / Send edit only / Cancel edit
//   - rejecting:                Confirm reject / Cancel
//
// Rejection reason is optional but persisted (whatsapp_drafts.rejected_reason).
// ============================================================

import { useEffect, useState } from "react";
import { confidenceLabel, formatShortDate } from "../helpers.js";
import { RiskPill } from "../RiskPill.jsx";

export function DraftPanel({ draft, attachedActions = [], onApprove, onApproveAndApply, onReject, inFlight }) {
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

  // Action bar dispatch — five mutually exclusive button sets driven by
  // the current edit/reject mode and whether the draft has an attached
  // booking action. Flattened from a nested ternary to keep each case
  // readable on its own line.
  let mode = "idle";
  if (editing) mode = "editing";
  else if (rejecting) mode = "rejecting";
  const hasAttached = attachedActions.length > 0;

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
        {mode === "editing" && hasAttached && (
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
        )}
        {mode === "editing" && !hasAttached && (
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
        )}
        {mode === "rejecting" && (
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
        )}
        {mode === "idle" && hasAttached && (
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
        )}
        {mode === "idle" && !hasAttached && (
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
