import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { toDateStr } from "../../supabase/transforms";
import {
  computeDayCapacity,
  computeWeekCapacity,
  findNextAvailable,
  utilisationColor,
} from "../../engine/utilisation";
import { excludeCancelled } from "../../engine/occupancy";
import { getDefaultOpenForDate } from "../../engine/utils";
import { MetricBar } from "../ui";

// Capacity keeps its own semantics — open/closed state and the utilisation
// colour scale — and hands MetricBar a rendered figure plus a fill class.
// A closed day has no percentage to show and no track to fill.
function CapacityBar({ pct, isOpen, label, sub, statusLabel }) {
  return (
    <MetricBar
      label={label}
      subLabel={sub}
      value={isOpen ? `${pct}%` : <span className="italic text-ink-muted">closed</span>}
      caption={isOpen ? statusLabel : null}
      progress={isOpen ? pct : null}
      progressClassName={utilisationColor(pct)}
    />
  );
}

export function CapacityCard({
  currentDateObj,
  dates,
  bookingsByDate,
  dayOpenState,
  daySettings,
  onSelectDate,
}) {
  const todayStr = toDateStr(new Date());
  const selectedStr = toDateStr(currentDateObj);

  const day = useMemo(() => {
    // Cancelled rows free their seat — match the day view's live count.
    const bookings = excludeCancelled(bookingsByDate?.[selectedStr] || []).length;
    const isOpen = dayOpenState?.[selectedStr] ?? getDefaultOpenForDate(currentDateObj);
    return { bookings, isOpen, ...computeDayCapacity(bookings, isOpen) };
  }, [bookingsByDate, dayOpenState, selectedStr, currentDateObj]);

  const week = useMemo(
    () => computeWeekCapacity(dates, bookingsByDate, dayOpenState),
    [dates, bookingsByDate, dayOpenState],
  );

  const nextAvailable = useMemo(
    () =>
      findNextAvailable({
        fromDate: currentDateObj,
        bookingsByDate,
        dayOpenState,
        daySettings,
      }),
    [currentDateObj, bookingsByDate, dayOpenState, daySettings],
  );

  return (
    <section
      aria-label="Capacity summary"
      className="bg-white rounded-2xl border border-gray-100 shadow-card-resting p-4"
    >
      <h2 className="text-label text-ink-muted mb-3">
        Capacity
      </h2>

      <div className="flex flex-col gap-3">
        <CapacityBar
          pct={day.pct}
          isOpen={day.isOpen}
          label={selectedStr === todayStr ? "Today" : "This day"}
          sub={currentDateObj.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          statusLabel={day.isOpen ? `${day.bookings} of ${day.cap} seats booked` : "Closed"}
        />
        <CapacityBar
          pct={week.pct}
          isOpen={true}
          label="This week"
          statusLabel={`${week.bookings} of ${week.cap} seats booked this week`}
        />
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="text-label text-ink-muted mb-1">
          Next available
        </div>
        {nextAvailable ? (
          <button
            type="button"
            onClick={() => onSelectDate?.(nextAvailable.date)}
            className="group text-left w-full flex items-center justify-between gap-2 text-sm font-semibold text-brand-teal-text cursor-pointer transition-all bg-transparent border-none p-0 font-[inherit] hover:text-brand-teal-text/80"
          >
            <span>
              {nextAvailable.dateLabel} at {nextAvailable.slotLabel}
            </span>
            <ArrowRight
              size={14}
              strokeWidth={2.5}
              className="transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        ) : (
          <div className="text-sm text-slate-500 italic">No availability in next 4 weeks</div>
        )}
      </div>
    </section>
  );
}
