import { useEffect, useState } from "react";
import { PiggyBank } from "lucide-react";
import { supabase } from "../../../supabase/client.js";
import { getDepositSettings } from "../../../supabase/repositories/bookingsRepo";
import { isAwaitingDeposit } from "../../../engine/deposits";

// Awaiting-deposit panel on the booking detail modal. Renders only while
// the booking is awaiting (isAwaitingDeposit); shows amount, reference and
// due time plus a copy-ready WhatsApp line. "Deposit received" sets the
// existing Deposit Paid payment state via the parent's onUpdate —
// deposit_received_at is stamped by the DB trigger, nothing else to write.

function formatDue(dueBy) {
  if (!dueBy) return null;
  return new Date(dueBy).toLocaleString("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DepositSection({ booking, onMarkReceived }) {
  const [bank, setBank] = useState(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const awaiting = isAwaitingDeposit(booking);

  useEffect(() => {
    if (!awaiting) return undefined;
    let cancelled = false;
    getDepositSettings(supabase).then((s) => {
      if (!cancelled) setBank(s.bank);
    });
    return () => {
      cancelled = true;
    };
  }, [awaiting]);

  if (!awaiting) return null;

  const amount = booking.depositAmount ?? 10;
  const dueLabel = formatDue(booking.depositDueBy);
  const pasteLine =
    [
      `To hold your booking, please send the £${amount} deposit`,
      bank
        ? `to ${bank.accountName}, sort code ${bank.sortCode}, account ${bank.accountNumber}`
        : null,
      booking.depositReference ? `with reference ${booking.depositReference}` : null,
      dueLabel ? `by ${dueLabel}` : null,
    ]
      .filter(Boolean)
      .join(" ") +
    ". Deposits are non-refundable and can't be transferred if you don't show.";

  const copyLine = async () => {
    try {
      await navigator.clipboard?.writeText(pasteLine);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the text is on screen to copy by hand */
    }
  };

  const markReceived = async () => {
    if (!onMarkReceived || saving) return;
    setSaving(true);
    try {
      await onMarkReceived();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label="Deposit"
      className="rounded-xl px-3 py-3 mb-3 bg-amber-50 border border-amber-200"
    >
      <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-amber-700 m-0">
        <PiggyBank size={13} strokeWidth={2.4} aria-hidden="true" />
        Awaiting deposit
      </p>
      <p className="text-[14px] font-bold text-amber-900 mt-1.5 mb-0">
        £{amount} · reference{" "}
        <span className="font-mono tracking-wide">{booking.depositReference}</span>
        {dueLabel ? <span className="font-semibold"> · due {dueLabel}</span> : null}
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          onClick={copyLine}
          className="min-h-11 px-3 rounded-lg border border-amber-300 bg-white text-[12px] font-bold text-amber-800 cursor-pointer transition-all hover:bg-amber-100 font-[inherit]"
        >
          {copied ? "Copied!" : "Copy WhatsApp message"}
        </button>
        {onMarkReceived && (
          <button
            type="button"
            disabled={saving}
            onClick={markReceived}
            className="min-h-11 px-3 rounded-lg border border-emerald-300 bg-white text-[12px] font-bold text-emerald-800 cursor-pointer transition-all hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60 font-[inherit]"
          >
            {saving ? "Recording…" : "Deposit received"}
          </button>
        )}
      </div>
    </section>
  );
}
