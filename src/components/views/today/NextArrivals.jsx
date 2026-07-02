// Section B — Dogs due in today, grouped by slot. The current/next slot is
// prioritised; fully-done past slots collapse quietly but stay expandable.
import { useState } from "react";
import { BookingStatusBar } from "../../modals/booking-detail/BookingStatusBar.jsx";
import { SectionCard, EmptyState, WelfareChips, formatMoney } from "./parts.jsx";

function SourceChip({ role }) {
  if (role !== "customer" && role !== "ai") return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-semibold uppercase tracking-wide">
      via {role}
    </span>
  );
}

function SlotGroup({ group, resolve, getWelfare, paymentOf, onUpdateBooking, onOpenBooking, onMessageOwner, onMarkPaid }) {
  const [open, setOpen] = useState(!group.isPast);
  const label = group.isCurrent ? "Now" : group.isPast ? "Done" : "Upcoming";
  return (
    <div className={`rounded-xl border ${group.isCurrent ? "border-brand-teal/40 bg-brand-teal/[0.04]" : "border-slate-100"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span className="font-bold text-slate-800 text-[15px] tabular-nums">{group.slot}</span>
        <span
          className={`text-[11px] font-bold uppercase tracking-wide ${
            group.isCurrent ? "text-brand-teal-dark" : group.isPast ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {label}
        </span>
        <span className="text-[12px] text-slate-400">
          {group.bookings.length} {group.bookings.length === 1 ? "dog" : "dogs"}
        </span>
        <span aria-hidden className="ml-auto text-slate-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ul className="flex flex-col gap-2 px-2 pb-2">
          {group.bookings.map((b) => {
            const d = resolve(b);
            const welfare = getWelfare(b);
            const pay = paymentOf(b);
            return (
              <li key={b.id} className="rounded-lg bg-white border border-slate-100 p-3">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-bold text-slate-800 text-[15px]">{d.dogName}</span>
                  {d.breed && <span className="text-[12px] text-slate-500">{d.breed}</span>}
                  {b.size && <span className="text-[11px] text-slate-400 capitalize">{b.size}</span>}
                  <SourceChip role={b.createdByRole} />
                </div>
                <div className="text-[13px] text-slate-500 mt-0.5">
                  {d.owner} · {b.service}
                  {pay.kind !== "paid" && pay.amountDue != null && (
                    <span className="text-slate-600"> · {formatMoney(pay.amountDue)} due</span>
                  )}
                </div>
                <WelfareChips alerts={welfare.alerts} pregnant={welfare.pregnant} notes={welfare.notes} />
                <div className="mt-2">
                  <BookingStatusBar booking={b} currentDateStr={b._bookingDate} onUpdate={onUpdateBooking} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => onOpenBooking(b.id)} className="text-[12px] font-semibold text-brand-purple hover:underline">Open booking</button>
                  <button type="button" onClick={() => onMessageOwner(b)} className="text-[12px] font-semibold text-slate-600 hover:underline">Message owner</button>
                  {pay.kind !== "paid" && (
                    <button type="button" onClick={() => onMarkPaid(b)} className="text-[12px] font-semibold text-slate-600 hover:underline">Record payment</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function NextArrivals(props) {
  const { groups } = props;
  return (
    <SectionCard title="Dogs due in today" subtitle="Grouped by drop-off time" accent="bg-brand-teal">
      {groups.length === 0 ? (
        <EmptyState>No dogs booked in today.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <SlotGroup key={g.slot} group={g} {...props} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
