// ============================================================
// src/components/views/inbox/thread/BookingActionPanel.jsx
//
// Pending AI booking-action panel. Lets staff edit date / slot /
// service / size before applying. Apply calls
// apply_whatsapp_booking_action; Reject sets state='rejected' with
// an optional reason captured to whatsapp_booking_actions.rejection_reason.
//
// FieldDate and FieldSelect stay co-located — they're only used here.
// ============================================================

import { useEffect, useState } from "react";
import { SALON_SLOTS, SERVICES } from "../../../../constants/index.ts";
import { BookingCapacityPreview } from "./BookingCapacityPreview.jsx";

export function BookingActionPanel({ actions, onApply, onReject, inFlight }) {
  const [error, setError] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState("");
  // Edited values keyed by action.id. Lets staff fix the date / slot /
  // service / size the AI proposed before adding it to the diary.
  const [edits, setEdits] = useState({});

  const actionIdsKey = actions.map((action) => action.id).join("|");
  useEffect(() => {
    setError(null);
    setRejectingId(null);
    setReason("");
    setEdits({});
  }, [actionIdsKey]);

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
    <div className="px-4 pt-3 pb-2 bg-brand-yellow/10 border-t border-brand-yellow/30">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-purple">
          Booking proposal
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-yellow/20 text-brand-purple border border-brand-yellow/60">
          <span aria-hidden="true" className="text-[8px]">●</span>
          Proposed · awaiting your OK
        </span>
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
              className="bg-white border border-brand-yellow/30 rounded-2xl px-3 py-2.5 shadow-card-resting"
            >
              {isRejecting ? (
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for rejecting (optional)"
                  className="w-full text-[13px] p-2 bg-white border border-slate-200 rounded-lg font-[inherit] resize-y mb-2"
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

              {!isRejecting && action.action === "create" && (
                <BookingCapacityPreview date={date} slot={slot} size={size} />
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
