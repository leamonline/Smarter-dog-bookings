// Capacity today — the engine's numbers turned into one glanceable headline
// (places booked, next free slot, what sizes still fit) plus the remaining
// slots as actions: book a dog in, or open a slot for last-minute customers.
// All seat/size/cutoff maths comes from the capacity engine — never re-derived.
import { DAY_CAPACITY } from "../../../engine/utilisation";
import { SectionCard, EmptyState, TertiaryLink } from "./parts.jsx";

function fillRank(o) {
  // Genuinely fillable first: reachable-by-customers, then free seats, then full.
  if (o.customerReachable) return 0;
  if (o.seatsFree > 0) return 1;
  return 2;
}

export function CapacitySummary({ opportunities, immediateSet, nextAvailable, dogsBooked, onToggleImmediate, onNewBooking }) {
  const remaining = opportunities
    .filter((o) => !o.isPast)
    .sort((a, b) => fillRank(a) - fillRank(b) || a.slotMinutes - b.slotMinutes);

  const seatsLeftToday = remaining.reduce((n, o) => n + o.seatsFree, 0);
  const nextFreeToday = remaining
    .filter((o) => o.seatsFree > 0)
    .sort((a, b) => a.slotMinutes - b.slotMinutes)[0];
  const largeSlots = remaining.filter((o) => o.seatsFree > 0 && o.largeDogEligible).map((o) => o.slot);

  return (
    <SectionCard
      title="Capacity today"
      subtitle={`${dogsBooked} of ${DAY_CAPACITY} places booked`}
      accent="bg-brand-yellow"
    >
      <div className="px-2 pb-2 text-[13px] text-slate-700 flex flex-col gap-0.5">
        {nextFreeToday ? (
          <p>
            <span className="font-bold text-slate-800">
              {seatsLeftToday} {seatsLeftToday === 1 ? "space" : "spaces"} left today
            </span>{" "}
            · next free at <span className="font-bold text-slate-800 tabular-nums">{nextFreeToday.slot}</span>
          </p>
        ) : remaining.length > 0 ? (
          <p className="font-semibold">No spaces left today — the rest of the day is full.</p>
        ) : null}
        {nextFreeToday && (
          <p className="text-slate-600">
            {largeSlots.length > 0
              ? `Small & medium fit any free space · large dogs at ${largeSlots.join(", ")}`
              : "Small & medium spaces only — no large-dog space left"}
          </p>
        )}
        {nextAvailable && (
          <p className="text-slate-600">
            Next free after today:{" "}
            <span className="font-semibold text-slate-800">{nextAvailable.dateLabel} · {nextAvailable.slotLabel}</span>
          </p>
        )}
      </div>
      {remaining.length === 0 ? (
        <EmptyState>No more slots left today.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {remaining.map((o) => {
            const isImmediate = immediateSet.has(o.slot);
            const full = o.seatsFree === 0;
            return (
              <li
                key={o.slot}
                className={`flex items-center gap-3 rounded-lg border px-3 py-1 min-h-[48px] ${
                  o.customerReachable ? "border-brand-cyan/40 bg-brand-cyan/[0.05]" : full ? "border-slate-200 bg-slate-50/60" : "border-slate-200 bg-white"
                }`}
              >
                <span className="font-bold text-slate-800 text-[14px] tabular-nums w-12 shrink-0">{o.slot}</span>
                <div className="min-w-0 flex-1 text-[12px]">
                  <span className={full ? "text-slate-600 font-semibold" : "text-slate-700 font-semibold"}>
                    {full ? "Full" : `${o.seatsFree} ${o.seatsFree === 1 ? "space" : "spaces"} free`}
                  </span>
                  {!full && o.largeDogEligible && <span className="text-slate-600"> · large ok</span>}
                  {o.customerReachable ? (
                    <span className="text-brand-cyan-dark font-semibold"> · customers can book now</span>
                  ) : isImmediate ? (
                    <span className="text-slate-600"> · last-minute past cutoff</span>
                  ) : (
                    <span className="text-slate-600"> · staff only</span>
                  )}
                </div>
                {!full && (
                  <div className="flex items-center shrink-0 -my-1">
                    <TertiaryLink onClick={() => onToggleImmediate(o.slot)}>
                      {isImmediate ? "Close last-minute" : "Open last-minute"}
                    </TertiaryLink>
                    <TertiaryLink tone="purple" onClick={() => onNewBooking(o.slot)}>Book in</TertiaryLink>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
