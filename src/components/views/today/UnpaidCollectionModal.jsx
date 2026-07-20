import { ModalShell } from "../../modals/shell/ModalShell.jsx";
import { formatMoney } from "./parts.jsx";

export function UnpaidCollectionModal({
  booking,
  amountDue,
  onTakePayment,
  onMarkCollected,
  onClose,
}) {
  const titleId = `unpaid-collection-${booking.id}`;
  const amount = formatMoney(amountDue);
  return (
    <ModalShell
      onClose={onClose}
      titleId={titleId}
      accent="var(--color-brand-yellow)"
      widthClass="w-[min(500px,94vw)]"
      maxHeightClass="max-h-[min(90vh,520px)]"
      mobilePresentation="sheet"
      header={(
        <div className="border-b border-brand-paper-line px-5 py-4">
          <p className="text-label text-brand-coral-text">PAYMENT STILL DUE</p>
          <h2 id={titleId} className="mt-1 font-display text-[24px] font-bold leading-tight text-brand-purple">
            {amount} is still due for {booking.dogName}
          </h2>
        </div>
      )}
      footer={(
        <div className="flex flex-col-reverse gap-2 border-t border-brand-paper-line bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-4 text-[13px] font-bold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button type="button" onClick={onMarkCollected} className="min-h-11 rounded-xl border border-brand-purple/20 bg-white px-4 text-[13px] font-bold text-brand-purple hover:bg-brand-purple/5">
            Mark collected anyway
          </button>
          <button type="button" onClick={onTakePayment} className="min-h-11 rounded-xl bg-brand-yellow px-4 text-[13px] font-bold text-brand-purple hover:bg-brand-yellow-dark">
            Take {amount}
          </button>
        </div>
      )}
    >
      <div className="space-y-3 px-5 py-5 text-[14px] leading-6 text-slate-700">
        <p>Take the payment now, or continue collection and leave the balance visible for follow-up.</p>
        <p className="rounded-xl border border-brand-yellow/40 bg-brand-yellow/10 px-3 py-2 text-[13px] font-semibold text-amber-900">
          Collection and payment are separate. Continuing will not mark this booking paid.
        </p>
      </div>
    </ModalShell>
  );
}
