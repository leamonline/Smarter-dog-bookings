// ============================================================
// src/components/modals/day-closure/BroadcastMessageModal.jsx
//
// "Message the day" — staff pick a date and a reason; every Booked customer
// that day gets their OWN 1:1 templated message (WhatsApp or SMS, no group
// chat). Preview runs a dry-run through the broadcast-message edge function
// (single source of truth for recipients + channel + opt-outs), then "Send to
// all" fires for real. Anyone opted out of both channels is listed back so
// staff can reach them another way.
//
// The feature is gated server-side behind a kill-switch + the day_closure_v1
// template being Meta-approved; the modal surfaces that state so staff know
// when it's dormant.
// ============================================================

import { useState } from "react";
import { X } from "lucide-react";
import { ModalShell, HeaderIconButton } from "../shell/index.js";
import { useStaffMessaging } from "../../../supabase/hooks/useStaffMessaging";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { parseSupabaseFunctionError } from "../../../supabase/hooks/inbox/helpers.js";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const SKIP_LABEL = {
  opted_out_or_no_channel: "Opted out of WhatsApp & SMS (or no number)",
  broadcast_disabled: "Broadcast is switched off",
  template_not_approved: "Template awaiting Meta approval",
  send_failed: "Send failed — try again",
  log_insert_failed: "Couldn’t be queued",
  lookup_failed: "Customer record missing",
};

function skipLabel(reason) {
  return SKIP_LABEL[reason] ?? reason;
}

export function BroadcastMessageModal({ defaultDate, onClose }) {
  const toast = useToast();
  const messaging = useStaffMessaging();
  const [date, setDate] = useState(defaultDate || todayStr());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Result of the last dry-run (preview) or real send.
  const [result, setResult] = useState(null);
  const [resultMode, setResultMode] = useState(null); // "preview" | "sent"

  const reasonValid = reason.trim().length > 0;

  async function run(dryRun) {
    if (busy || !reasonValid) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await messaging.broadcastMessage({
        bookingDate: date,
        reason: reason.trim(),
        dryRun,
      });
      if (invokeErr) throw new Error(await parseSupabaseFunctionError(invokeErr, "Broadcast failed"));
      if (data?.error) throw new Error(data.error);
      setResult(data);
      setResultMode(dryRun ? "preview" : "sent");
      if (!dryRun) {
        const n = data?.counts?.sent ?? 0;
        toast.show(
          n > 0 ? `Sent to ${n} customer${n === 1 ? "" : "s"}.` : "Nothing was sent — see the breakdown.",
          n > 0 ? "success" : "info",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const dormant = result && result.can_send === false;
  const recipientCount = result ? (result.counts?.sent ?? 0) : 0;
  const skipped = result?.skipped ?? [];

  return (
    <ModalShell
      onClose={() => onClose?.()}
      titleId="broadcast-title"
      accent="var(--color-brand-purple)"
      widthClass="w-[min(560px,95vw)]"
      maxHeightClass="max-h-[90vh]"
      bodyClassName="p-4 flex flex-col gap-3"
      zIndex={1100}
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex-1 min-w-0">
            <span className="text-label text-ink-muted">
              Broadcast
            </span>
            <h2 id="broadcast-title" className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1">
              Message the day’s customers
            </h2>
          </div>
          <HeaderIconButton label="Close" onClick={() => onClose?.()}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
    >
      <p className="text-[13px] text-slate-600 leading-relaxed">
        Sends every <span className="font-semibold">Booked</span> customer on this day their own private
        message (WhatsApp or SMS — never a group chat). Type the reason and preview before sending.
      </p>

      <label className="block">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Day</span>
        <input
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setResult(null); }}
          className="w-full py-2 px-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-brand-purple outline-none focus:border-brand-purple"
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Reason / message</span>
        <textarea
          value={reason}
          onChange={(e) => { setReason(e.target.value); setResult(null); }}
          rows={3}
          placeholder="e.g. we’re closed Monday for a burst pipe — we’ll be in touch to rebook"
          className="w-full py-2 px-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 outline-none resize-y focus:border-brand-purple"
        />
        <span className="text-[11px] text-slate-400 mt-1 block">
          This fills the approved template: “Hi [name], an important update about your grooming appointment at Smarter Dog Grooming Salon: [your reason]. Please reply to this message and we’ll help with whatever you need.”
        </span>
      </label>

      {error && (
        <div role="alert" className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2">
          <div className="text-[13px] text-slate-700">
            {resultMode === "preview" ? (
              <>
                <span className="font-bold text-brand-purple">{recipientCount}</span> customer{recipientCount === 1 ? "" : "s"} would be messaged.
              </>
            ) : (
              <>
                Sent to <span className="font-bold text-brand-green-700">{result.counts?.sent ?? 0}</span>
                {(result.counts?.already ?? 0) > 0 && <> · {result.counts.already} already messaged today</>}.
              </>
            )}
          </div>

          {dormant && (
            <div className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2">
              Nothing will send yet: {!result.broadcast_enabled ? "the broadcast kill-switch is off" : "the WhatsApp template is still awaiting Meta approval"}.
            </div>
          )}

          {resultMode === "preview" && (result.sent ?? []).length > 0 && (
            <div className="text-[12px] text-slate-500">
              Preview: <span className="italic text-slate-600">“{result.sent[0].preview}”</span>
            </div>
          )}

          {skipped.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                {skipped.length} can’t be reached this way
              </div>
              <ul className="text-[12px] text-slate-600 flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                {skipped.map((s, i) => (
                  <li key={s.human_id || i} className="flex justify-between gap-2">
                    <span className="truncate">{s.name || "Customer"}</span>
                    <span className="text-slate-400 shrink-0">{skipLabel(s.reason)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => run(true)}
          disabled={busy || !reasonValid}
          className="flex-1 py-2.5 rounded-full border border-brand-purple/30 text-brand-purple text-[13px] font-bold cursor-pointer hover:bg-brand-purple/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy && resultMode !== "sent" ? "Checking…" : "Preview recipients"}
        </button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={busy || !reasonValid || resultMode !== "preview" || recipientCount === 0}
          title={resultMode !== "preview" ? "Preview first" : undefined}
          className="flex-[1.4] py-2.5 rounded-full bg-brand-purple text-white text-[13px] font-bold cursor-pointer hover:bg-brand-purple-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy && resultMode === "preview" ? "Sending…" : `Send to all${recipientCount ? ` (${recipientCount})` : ""}`}
        </button>
      </div>
    </ModalShell>
  );
}
