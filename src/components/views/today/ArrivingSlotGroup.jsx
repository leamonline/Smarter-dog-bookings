// One appointment-slot group for the Arriving lane. Several dogs due at the
// same time share ONE heading (time, dog count, countdown, confirmation
// count) instead of each card repeating the same slot and countdown.
// Grouping itself is done by the pure `groupFeedBySlot` engine selector
// (src/engine/today.ts); this file only renders one already-built group.
//
// The countdown is read from the first entry's already-computed `timingLabel`
// rather than recomputed here: every booking in a slot group shares the same
// slot and `now`, so lateness is identical across the whole group — and the
// heading is the ONE place lateness is stated (cards never repeat it).
import { BookingCard, dogCountLabel } from "./StatusBoard.jsx";

export function ArrivingSlotGroup({
  group,
  resolve,
  getWelfare,
  paymentOf,
  handlers,
  onTheWaySignals,
  isGoldFor,
  busyIds,
  flashId,
}) {
  const toConfirm = group.entries.filter((entry) => entry.actionReasons?.includes("confirmation")).length;
  const countdown = group.entries[0]?.timingLabel || null;
  const isLateGroup = !!group.entries[0]?.isLate;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-0.5 pt-1">
        <h3 className="text-[13px] font-bold tabular-nums text-brand-purple">{group.label}</h3>
        {group.entries.length > 1 ? (
          <span className="text-[12px] font-semibold text-slate-500">{dogCountLabel(group.entries.length)}</span>
        ) : null}
        {countdown ? (
          <span className={`text-[12px] font-bold tabular-nums ${isLateGroup ? "text-brand-coral-text" : "text-slate-500"}`}>
            {countdown}
          </span>
        ) : null}
        {toConfirm > 0 ? (
          <span className="text-[12px] font-bold text-amber-800">{toConfirm} to confirm</span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2.5">
        {group.entries.map((entry) => (
          <BookingCard
            key={entry.booking.id}
            entry={entry}
            lane="due"
            laneTitle="Arriving"
            resolve={resolve}
            getWelfare={getWelfare}
            paymentOf={paymentOf}
            handlers={handlers}
            onTheWaySignals={onTheWaySignals}
            isGold={isGoldFor?.(entry) || false}
            busy={busyIds?.has(entry.booking.id)}
            flash={flashId === entry.booking.id}
          />
        ))}
      </div>
    </div>
  );
}
