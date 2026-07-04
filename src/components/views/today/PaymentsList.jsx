// Payments to take — today's bookings that still owe money, with the
// deposit/balance split. An operational nudge, not an invoice: rows leave
// this list by being recorded paid, never by being hidden.
import { useState } from "react";
import { PAYMENT_METHODS } from "../../../constants/salon";
import { SectionCard, StatusPill, PrimaryButton, SecondaryButton, formatMoney } from "./parts.jsx";

function PaymentRow({ entry, resolve, paymentOf, onMarkPaid, onOpenBooking }) {
  const b = entry.booking;
  const d = resolve(b);
  const pay = paymentOf(b); // recomputed with the dog's custom price
  const [choosing, setChoosing] = useState(false);
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-slate-800 text-[15px]">{d.dogName}</span>
        <span className="text-[13px] text-slate-600">{d.owner}</span>
        <StatusPill status={b.status} />
      </div>
      <div className="text-[13px] text-slate-600 mt-0.5">
        {pay.kind === "deposit" ? (
          <span>Deposit {formatMoney(pay.depositPaid)} paid · <span className="font-bold text-slate-800">{formatMoney(pay.amountDue)} balance</span></span>
        ) : pay.kind === "due" ? (
          <span className="font-bold text-slate-800">{formatMoney(pay.amountDue)} due at pick-up</span>
        ) : (
          <span>{pay.label}</span>
        )}
        {b.notes && b.notes.trim() && <span className="italic"> · “{b.notes.trim()}”</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-2">
        {choosing ? (
          <>
            <span className="text-[13px] font-semibold text-slate-600 self-center">Paid by:</span>
            {PAYMENT_METHODS.map((m) => (
              <SecondaryButton key={m.id} onClick={() => { onMarkPaid(b, m.id); setChoosing(false); }}>{m.label}</SecondaryButton>
            ))}
            <button type="button" onClick={() => setChoosing(false)} className="text-[13px] text-slate-500 underline min-h-[44px] px-1 bg-transparent border-none cursor-pointer">Cancel</button>
          </>
        ) : (
          <>
            <PrimaryButton onClick={() => setChoosing(true)}>Mark paid</PrimaryButton>
            <SecondaryButton onClick={() => onOpenBooking(b.id)}>Open booking</SecondaryButton>
          </>
        )}
      </div>
    </li>
  );
}

export function PaymentsList(props) {
  const { entries } = props;
  return (
    <SectionCard title="Payments to take" subtitle="Balances to collect at pick-up" count={entries.length} accent="bg-brand-yellow">
      <ul className="flex flex-col gap-2">
        {entries.map((e) => (
          <PaymentRow key={e.booking.id} entry={e} {...props} />
        ))}
      </ul>
    </SectionCard>
  );
}
