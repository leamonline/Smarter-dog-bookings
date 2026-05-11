import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { toDateStr } from "../../supabase/transforms.js";
import {
  computeDayCapacity,
  computeWeekCapacity,
  findNextAvailable,
  utilisationColor,
  utilisationLabel,
} from "../../engine/utilisation.js";
import { getDefaultOpenForDate } from "../../engine/utils.ts";

function CapacityBar({ pct, isOpen, label, sub, statusLabel }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <div className="text-xs font-semibold text-brand-purple truncate">
          {label}
          {sub && (
            <span className="text-slate-400 font-medium ml-1">{sub}</span>
          )}
        </div>
        <div className="text-xs font-semibold text-slate-500 tabular-nums shrink-0 flex items-center gap-1.5">
          {isOpen ? `${pct}%` : <span className="italic text-slate-400">closed</span>}
          {isOpen && (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {statusLabel}
            </span>
          )}
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full ${utilisationColor(pct)} rounded-full transition-all`}
          style={{ width: `${isOpen ? pct : 0}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
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
    const bookings = (bookingsByDate?.[selectedStr] || []).length;
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
      className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-4"
    >
      <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
        Capacity
      </h2>

      <div className="flex flex-col gap-3">
        <CapacityBar
          pct={day.pct}
          isOpen={day.isOpen}
          label={selectedStr === todayStr ? "Today" : "This day"}
          sub={currentDateObj.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          statusLabel={utilisationLabel(day.pct, day.isOpen)}
        />
        <CapacityBar
          pct={week.pct}
          isOpen={true}
          label="This week"
          statusLabel={utilisationLabel(week.pct, true)}
        />
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
          Next available
        </div>
        {nextAvailable ? (
          <button
            type="button"
            onClick={() => onSelectDate?.(nextAvailable.date)}
            className="group text-left w-full flex items-center justify-between gap-2 text-sm font-semibold text-brand-teal cursor-pointer transition-all bg-transparent border-none p-0 font-[inherit] hover:text-brand-teal/80"
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
