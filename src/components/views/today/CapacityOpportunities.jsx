// Section F — Capacity & opportunities. The engine's numbers turned into
// actions: which remaining slots today are genuinely fillable (customer-
// reachable now, or staff-bookable), plus the next free slot this week.
import { SectionCard, EmptyState } from "./parts.jsx";

function fillRank(o) {
  // Genuinely fillable first: reachable-by-customers, then free seats, then full.
  if (o.customerReachable) return 0;
  if (o.seatsFree > 0) return 1;
  return 2;
}

export function CapacityOpportunities({ opportunities, immediateSet, nextAvailable, onToggleImmediate, onNewBooking }) {
  const remaining = opportunities
    .filter((o) => !o.isPast)
    .sort((a, b) => fillRank(a) - fillRank(b) || a.slotMinutes - b.slotMinutes);

  return (
    <SectionCard
      title="Capacity & opportunities"
      subtitle="Fillable slots left today"
      accent="bg-brand-cyan"
    >
      {nextAvailable && (
        <p className="px-2 pb-2 text-[13px] text-slate-600">
          Next free appointment:{" "}
          <span className="font-semibold text-slate-800">{nextAvailable.dateLabel} · {nextAvailable.slotLabel}</span>
        </p>
      )}
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
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  o.customerReachable ? "border-brand-cyan/40 bg-brand-cyan/[0.05]" : full ? "border-slate-100 bg-slate-50/60" : "border-slate-100 bg-white"
                }`}
              >
                <span className="font-bold text-slate-800 text-[14px] tabular-nums w-12">{o.slot}</span>
                <div className="min-w-0 flex-1 text-[12px]">
                  <span className={full ? "text-slate-400 font-semibold" : "text-slate-700 font-semibold"}>
                    {full ? "Full" : `${o.seatsFree} seat${o.seatsFree === 1 ? "" : "s"} free`}
                  </span>
                  {!full && o.largeDogEligible && <span className="text-slate-400"> · large ok</span>}
                  {o.customerReachable ? (
                    <span className="text-brand-cyan-dark"> · customers can book now</span>
                  ) : isImmediate ? (
                    <span className="text-slate-400"> · last-minute past cutoff</span>
                  ) : (
                    <span className="text-slate-400"> · staff only</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!full && (
                    <button
                      type="button"
                      onClick={() => onToggleImmediate(o.slot)}
                      className="text-[12px] font-semibold text-brand-cyan-dark hover:underline"
                    >
                      {isImmediate ? "Close last-minute" : "Open for last-minute"}
                    </button>
                  )}
                  {!full && (
                    <button
                      type="button"
                      onClick={() => onNewBooking(o.slot)}
                      className="text-[12px] font-semibold text-brand-purple hover:underline"
                    >
                      Book in
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
