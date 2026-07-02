// Section E — Payments & handover. Today's bookings that still owe money, with
// the deposit/balance split. An operational nudge, not an invoice.
import { SectionCard, EmptyState, StatusPill, PrimaryButton, formatMoney } from "./parts.jsx";

function PaymentRow({ entry, resolve, paymentOf, onMarkPaid, onOpenBooking }) {
  const b = entry.booking;
  const d = resolve(b);
  const pay = paymentOf(b); // recomputed with the dog's custom price
  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-800 text-[15px]">{d.dogName}</span>
          <span className="text-[13px] text-slate-500">{d.owner}</span>
          <StatusPill status={b.status} />
        </div>
        <div className="text-[13px] text-slate-500 mt-0.5">
          {pay.kind === "deposit" ? (
            <span>Deposit {formatMoney(pay.depositPaid)} paid · <span className="font-semibold text-slate-700">{formatMoney(pay.amountDue)} balance</span></span>
          ) : pay.kind === "due" ? (
            <span className="font-semibold text-slate-700">{formatMoney(pay.amountDue)} due at pick-up</span>
          ) : (
            <span>{pay.label}</span>
          )}
          {b.notes && b.notes.trim() && <span className="italic text-slate-500"> · “{b.notes.trim()}”</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <PrimaryButton onClick={() => onMarkPaid(b)}>Mark paid</PrimaryButton>
        <button type="button" onClick={() => onOpenBooking(b.id)} className="text-[12px] font-semibold text-brand-purple hover:underline">Open</button>
      </div>
    </li>
  );
}

export function PaymentsList(props) {
  const { entries } = props;
  return (
    <SectionCard title="Payments & handover" subtitle="Balances to collect at pick-up" count={entries.length} accent="bg-slate-400">
      {entries.length === 0 ? (
        <EmptyState>Everyone&apos;s settled up. 💷</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <PaymentRow key={e.booking.id} entry={e} {...props} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
