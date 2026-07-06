// Payments to take — today's bookings that still owe money, with the
// deposit/balance split. An operational nudge, not an invoice: rows leave
// this list by being recorded paid, never by being hidden.
import { SectionCard, SecondaryButton, BookingStatusLine, MarkPaidAction } from "./parts.jsx";

function PaymentRow({ entry, resolve, paymentOf, onMarkPaid, onOpenBooking }) {
  const b = entry.booking;
  const d = resolve(b);
  const pay = paymentOf(b); // recomputed with the dog's custom price
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-slate-800 text-[15px]">{d.dogName}</span>
        <span className="text-[13px] text-slate-600">{d.owner}</span>
      </div>
      <BookingStatusLine booking={b} pay={pay}>
        {b.notes && b.notes.trim() && <span className="italic">“{b.notes.trim()}”</span>}
      </BookingStatusLine>
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <MarkPaidAction booking={b} onMarkPaid={onMarkPaid} />
        <SecondaryButton onClick={() => onOpenBooking(b.id)}>Open booking</SecondaryButton>
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
