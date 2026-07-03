// Next up — who's arriving next (a prominent card with a live countdown),
// then the rest of the day's expected arrivals as expandable slot rows.
// Fully-arrived and past groups live in <EarlierToday>, not here, so the next
// time-sensitive thing is always at the top of this section.
import { useState } from "react";
import { minutesUntilSlot, statusRank } from "../../../engine/today";
import { BookingStatusBar } from "../../modals/booking-detail/BookingStatusBar.jsx";
import { SectionCard, StatusPill, WelfareChips, PrimaryButton, TertiaryLink, Chevron, formatMinutes, formatMoney } from "./parts.jsx";

function SourceChip({ role }) {
  if (role !== "customer" && role !== "ai") return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold uppercase tracking-wide">
      via {role}
    </span>
  );
}

/** "due in 12 min", "due now", "started 3 min ago". */
function dueLabel(slot, now) {
  const mins = minutesUntilSlot(slot, now);
  if (mins > 0) return `due in ${formatMinutes(mins)}`;
  if (mins >= -1) return "due now";
  return `started ${formatMinutes(-mins)} ago`;
}

/** One dog inside an expanded group — full detail + the status stepper. */
function DogArrivalCard({ b, resolve, getWelfare, paymentOf, onUpdateBooking, onOpenBooking, onMessageOwner, onMarkPaid }) {
  const d = resolve(b);
  const welfare = getWelfare(b);
  const pay = paymentOf(b);
  return (
    <li className="rounded-lg bg-white border border-slate-200 p-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-bold text-slate-800 text-[15px]">{d.dogName}</span>
        {d.breed && <span className="text-[12px] text-slate-600">{d.breed}</span>}
        {b.size && <span className="text-[12px] text-slate-600 capitalize">{b.size}</span>}
        <SourceChip role={b.createdByRole} />
      </div>
      <div className="text-[13px] text-slate-600 mt-0.5">
        {d.owner} · {b.service}
        {pay.kind !== "paid" && pay.amountDue != null && (
          <span className="font-semibold text-slate-700"> · {formatMoney(pay.amountDue)} due</span>
        )}
      </div>
      <WelfareChips alerts={welfare.alerts} pregnant={welfare.pregnant} notes={welfare.notes} />
      <div className="mt-2">
        <BookingStatusBar booking={b} currentDateStr={b._bookingDate} onUpdate={onUpdateBooking} />
      </div>
      <div className="flex items-center flex-wrap -my-1">
        <TertiaryLink tone="purple" onClick={() => onOpenBooking(b.id)}>Open booking</TertiaryLink>
        <TertiaryLink onClick={() => onMessageOwner(b)}>Message owner</TertiaryLink>
        {pay.kind !== "paid" && (
          <TertiaryLink onClick={() => onMarkPaid(b)}>Record payment</TertiaryLink>
        )}
      </div>
    </li>
  );
}

/** The prominent "who's next" card with a live countdown and greet actions. */
function NextArrivalCard({ group, now, resolve, getWelfare, paymentOf, onMarkArrived, onOpenBooking, onMessageOwner }) {
  const pending = group.bookings.filter((b) => statusRank(b.status) === 0);
  const arrived = group.bookings.filter((b) => statusRank(b.status) >= 1);
  return (
    <div className="rounded-xl border-2 border-brand-teal/40 bg-brand-teal/[0.05] p-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-wide text-brand-teal-text">Next arrival</span>
        <span className="font-extrabold text-slate-800 text-[19px] tabular-nums leading-none">{group.slot}</span>
        <span className="text-[13px] font-bold text-brand-teal-text">{dueLabel(group.slot, now)}</span>
        <span className="text-[13px] text-slate-600">
          {group.bookings.length} {group.bookings.length === 1 ? "dog" : "dogs"}
        </span>
      </div>
      <ul className="flex flex-col gap-2 mt-2.5">
        {pending.map((b) => {
          const d = resolve(b);
          const welfare = getWelfare(b);
          const pay = paymentOf(b);
          return (
            <li key={b.id} className="rounded-lg bg-white border border-slate-200 p-3">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-bold text-slate-800 text-[15px]">{d.dogName}</span>
                {d.breed && <span className="text-[12px] text-slate-600">{d.breed}</span>}
                <span className="text-[13px] text-slate-600">{d.owner}</span>
                <span className="text-[13px] text-slate-600">· {b.service}</span>
                {pay.kind !== "paid" && pay.amountDue != null && (
                  <span className="text-[13px] font-semibold text-slate-700">· {formatMoney(pay.amountDue)} due</span>
                )}
              </div>
              <WelfareChips alerts={welfare.alerts} pregnant={welfare.pregnant} notes={welfare.notes} />
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <PrimaryButton onClick={() => onMarkArrived(b)}>Mark arrived</PrimaryButton>
                <TertiaryLink tone="purple" onClick={() => onOpenBooking(b.id)}>Open booking</TertiaryLink>
                <TertiaryLink onClick={() => onMessageOwner(b)}>Message owner</TertiaryLink>
              </div>
            </li>
          );
        })}
        {arrived.map((b) => {
          const d = resolve(b);
          return (
            <li key={b.id} className="flex items-center gap-2 flex-wrap rounded-lg bg-white/70 border border-slate-200 px-3 py-2">
              <span className="font-semibold text-slate-700 text-[14px]">{d.dogName}</span>
              <StatusPill status={b.status} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A later arrival group — the whole row toggles it open, and the collapsed
 * row already tells the story: time, dogs, and how far off it is.
 */
export function ArrivalGroupRow({ group, now, defaultOpen = false, ...dogCardProps }) {
  const [open, setOpen] = useState(defaultOpen);
  const arrived = group.bookings.filter((b) => statusRank(b.status) >= 1).length;
  const total = group.bookings.length;
  const names = group.bookings.map((b) => dogCardProps.resolve(b).dogName).join(", ");
  const state =
    arrived === total
      ? total === 1 ? "arrived" : "all arrived"
      : arrived > 0
        ? `${arrived} of ${total} arrived`
        : dueLabel(group.slot, now);
  return (
    <div className={`rounded-xl border ${group.isCurrent ? "border-brand-teal/40 bg-brand-teal/[0.04]" : "border-slate-200"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full min-h-[52px] flex items-center gap-2.5 px-3 py-2 text-left rounded-xl hover:bg-slate-50 motion-safe:transition-colors"
      >
        <span className="font-bold text-slate-800 text-[15px] tabular-nums shrink-0">{group.slot}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-slate-700">
            {total} {total === 1 ? "dog" : "dogs"} · {state}
          </span>
          <span className="block text-[12px] text-slate-600 truncate">{names}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <ul className="flex flex-col gap-2 px-2 pb-2">
          {group.bookings.map((b) => (
            <DogArrivalCard key={b.id} b={b} {...dogCardProps} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function NextUp({ next, upcoming, now, ...handlers }) {
  const later = upcoming.reduce((n, g) => n + g.bookings.length, 0);
  return (
    <SectionCard
      title="Next up"
      subtitle={later > 0 ? `Then ${later} more ${later === 1 ? "dog" : "dogs"} later today` : "The last arrivals of the day"}
      accent="bg-brand-teal"
    >
      <div className="flex flex-col gap-2">
        {next && <NextArrivalCard group={next} now={now} {...handlers} />}
        {upcoming.map((g) => (
          <ArrivalGroupRow key={g.slot} group={g} now={now} {...handlers} />
        ))}
      </div>
    </SectionCard>
  );
}

/** Completed / past arrival groups, collapsed out of the way but reviewable. */
export function EarlierToday({ groups, now, ...handlers }) {
  const [open, setOpen] = useState(false);
  const total = groups.reduce((n, g) => n + g.bookings.length, 0);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden" aria-label="Earlier today">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full min-h-[52px] flex items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-slate-50 motion-safe:transition-colors"
      >
        <span aria-hidden className="h-5 w-1.5 rounded-full bg-slate-300" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-slate-800 leading-tight">Earlier today</span>
          <span className="block text-[12px] text-slate-600 mt-0.5">
            {total} {total === 1 ? "dog" : "dogs"} across {groups.length} {groups.length === 1 ? "slot" : "slots"}
          </span>
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 p-2 sm:p-3 border-t border-slate-100">
          {groups.map((g) => (
            <ArrivalGroupRow key={g.slot} group={g} now={now} {...handlers} />
          ))}
        </div>
      )}
    </section>
  );
}
