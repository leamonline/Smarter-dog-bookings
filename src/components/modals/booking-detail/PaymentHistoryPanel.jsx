import { useMemo, useState } from "react";
import { ChevronDown, History, RotateCcw } from "lucide-react";
import { paymentMethodLabel } from "../../../constants/salon";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { useBookingPaymentHistory } from "../../../supabase/hooks/useBookingPaymentHistory";

const FIELDS = [
  ["payment", "Status"],
  ["paid_amount", "Amount paid"],
  ["payment_method", "Method"],
  ["paid_at", "Paid at"],
  ["deposit_amount", "Deposit"],
  ["deposit_received_at", "Deposit received"],
];

function formatValue(field, value) {
  if (value == null || value === "") return "Not recorded";
  if (field === "paid_amount" || field === "deposit_amount") {
    return `£${Number(value).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
  }
  if (field === "payment_method") return paymentMethodLabel(value) || String(value);
  if (field.endsWith("_at")) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  }
  return String(value);
}

function changesFor(event) {
  if (event.operation === "INSERT") return [];
  const before = event.before_values || {};
  const after = event.after_values || {};
  return FIELDS.filter(([field]) => before[field] !== after[field]).map(([field, label]) => ({
    field,
    label,
    before: formatValue(field, before[field]),
    after: formatValue(field, after[field]),
  }));
}

function actorLabel(event) {
  if (event.actorName) return event.actorName;
  if (event.actor_id) return `Staff · ${event.actor_id.slice(0, 8)}`;
  return event.actor_role === "service_role" ? "System service" : "Database action";
}

export function PaymentHistoryPanel({ bookingId, onRestored }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [reason, setReason] = useState("");
  const [restoreError, setRestoreError] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const toast = useToast();
  const history = useBookingPaymentHistory(bookingId, { enabled: open });
  const latestId = history.events[0]?.id;
  const selected = useMemo(
    () => history.events.find((event) => event.id === selectedId) ?? null,
    [history.events, selectedId],
  );

  const submitRestore = async (event) => {
    event.preventDefault();
    if (!selected || latestId == null || !reason.trim()) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      await history.restore(selected.id, latestId, reason);
      await history.refresh();
      await onRestored?.();
      setSelectedId(null);
      setReason("");
      toast.show("Payment details restored and recorded", "success");
    } catch (caught) {
      setRestoreError(caught instanceof Error ? caught.message : "Couldn’t restore the payment record.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="mt-3 border-t border-slate-200 pt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`payment-history-${bookingId}`}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between rounded-lg px-2 text-left text-[13px] font-bold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
      >
        <span className="flex items-center gap-2"><History size={16} aria-hidden="true" />Payment history</span>
        <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div id={`payment-history-${bookingId}`} className="px-2 pb-1 pt-2">
          <p className="mb-3 text-[11px] leading-4 text-slate-500">Recorded since 27 September 2026. This history records saved values; it does not prove that money moved.</p>
          {!history.available ? (
            <p role="status" className="text-[12px] font-semibold text-slate-600">Payment history is unavailable in sample data.</p>
          ) : history.loading && history.events.length === 0 ? (
            <p role="status" className="text-[12px] text-slate-500">Loading payment history…</p>
          ) : history.error ? (
            <div role="alert" className="rounded-lg bg-red-50 p-3 text-[12px] font-semibold text-red-800">
              {history.error}
              <button type="button" onClick={() => history.refresh()} className="ml-2 underline">Try again</button>
            </div>
          ) : history.events.length === 0 ? (
            <p role="status" className="text-[12px] text-slate-500">No payment changes have been recorded for this booking.</p>
          ) : (
            <ol className="space-y-3">
              {history.events.map((item) => {
                const changes = changesFor(item);
                const canRestore = item.operation === "UPDATE" && item.before_values;
                return (
                  <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 text-[12px]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-800">
                          {item.restored_from ? "Payment correction" : item.operation === "INSERT" ? "Initial payment state" : item.operation === "DELETE" ? "Booking deleted" : "Payment changed"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{actorLabel(item)} · {new Date(item.recorded_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
                      </div>
                      {canRestore && selectedId !== item.id && (
                        <button type="button" onClick={() => { setSelectedId(item.id); setReason(""); setRestoreError(null); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 font-bold text-slate-700 hover:bg-slate-50">
                          <RotateCcw size={14} aria-hidden="true" />Restore
                        </button>
                      )}
                    </div>
                    {changes.length > 0 && (
                      <dl className="mt-2 space-y-1.5">
                        {changes.map((change) => (
                          <div key={change.field} className="grid grid-cols-[7rem_1fr] gap-2">
                            <dt className="font-semibold text-slate-500">{change.label}</dt>
                            <dd className="text-slate-700"><span className="line-through decoration-slate-400">{change.before}</span><span aria-hidden="true"> → </span><span className="font-semibold">{change.after}</span></dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {item.reason && <p className="mt-2 rounded-lg bg-sky-50 px-2 py-1.5 text-sky-900"><span className="font-bold">Reason:</span> {item.reason}</p>}
                    {selectedId === item.id && (
                      <form onSubmit={submitRestore} className="mt-3 rounded-lg bg-amber-50 p-3">
                        <p className="font-bold text-amber-950">Restore the values from before this change?</p>
                        <p className="mt-1 leading-4 text-amber-900">This corrects the booking record. It does not charge or refund anyone.</p>
                        <label className="mt-3 block font-bold text-amber-950" htmlFor={`restore-reason-${item.id}`}>Correction reason</label>
                        <textarea id={`restore-reason-${item.id}`} required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What was entered incorrectly? Avoid customer or banking details." className="mt-1 min-h-20 w-full rounded-lg border border-amber-300 bg-white p-2 text-[13px] text-slate-800 focus-visible:ring-2 focus-visible:ring-brand-teal" />
                        {restoreError && (
                          <div role="alert" className="mt-2 font-semibold text-red-700">
                            <p>{restoreError}</p>
                            <button
                              type="button"
                              onClick={async () => {
                                await history.refresh();
                                setSelectedId(null);
                                setReason("");
                                setRestoreError(null);
                              }}
                              className="mt-1 underline"
                            >
                              Reload and review history
                            </button>
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="submit" disabled={restoring || !reason.trim()} className="min-h-11 rounded-lg bg-brand-coral px-3 font-bold text-white disabled:opacity-50">{restoring ? "Restoring…" : "Restore payment details"}</button>
                          <button type="button" disabled={restoring} onClick={() => { setSelectedId(null); setReason(""); setRestoreError(null); }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-bold text-slate-700">Cancel</button>
                        </div>
                      </form>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
