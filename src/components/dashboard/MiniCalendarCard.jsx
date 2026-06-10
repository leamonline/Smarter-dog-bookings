import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toDateStr } from "../../supabase/transforms";
import { getDefaultOpenForDate } from "../../engine/utils";
import { useMonthBookings } from "../../supabase/hooks/useMonthBookings.js";
import { useMonthDaySettings } from "../../supabase/hooks/useMonthDaySettings.js";
import { DAY_CAPACITY } from "../../engine/utilisation";

export function MiniCalendarCard({ currentDateObj, onSelectDate }) {
  const todayStr = toDateStr(new Date());
  const selectedStr = toDateStr(currentDateObj);

  const [viewYear, setViewYear] = useState(currentDateObj.getFullYear());
  const [viewMonth, setViewMonth] = useState(currentDateObj.getMonth());

  useEffect(() => {
    setViewYear(currentDateObj.getFullYear());
    setViewMonth(currentDateObj.getMonth());
  }, [currentDateObj]);

  const { monthBookingsByDate, monthBookingsLoading } = useMonthBookings(viewYear, viewMonth);
  const { monthDayOpenState, monthDaySettingsLoading } = useMonthDaySettings(viewYear, viewMonth);
  // While the month's data is still loading, suppress the colour/dot
  // calculation so the grid doesn't claim "all days empty, all green"
  // before the bookings arrive.
  const monthLoading = monthBookingsLoading || monthDaySettingsLoading;

  const { weeks, monthName } = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const last = new Date(viewYear, viewMonth + 1, 0);
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const mName = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const rows = [];
    let week = new Array(startDay).fill(null);
    for (let d = 1; d <= last.getDate(); d++) {
      week.push(new Date(viewYear, viewMonth, d));
      if (week.length === 7) { rows.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      rows.push(week);
    }
    return { weeks: rows, monthName: mName };
  }, [viewYear, viewMonth]);

  const goMonth = (offset) => {
    const d = new Date(viewYear, viewMonth + offset, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  return (
    <section
      aria-label="Monthly calendar"
      className="bg-white rounded-2xl border border-gray-100 shadow-card-resting overflow-hidden"
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          aria-label="Previous month"
          className="w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer text-brand-purple/60 hover:text-brand-purple hover:bg-brand-purple/5 transition-colors"
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
        </button>
        <div className="flex-1 text-center text-sm font-bold text-brand-purple font-display">
          {monthName}
        </div>
        <button
          type="button"
          onClick={() => goMonth(1)}
          aria-label="Next month"
          className="w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer text-brand-purple/60 hover:text-brand-purple hover:bg-brand-purple/5 transition-colors"
        >
          <ChevronRight size={16} strokeWidth={2.5} />
        </button>
      </header>

      <div className="p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d, i) => (
            <div key={i} className="text-center text-micro font-bold text-ink-muted">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((date, i) => {
            if (!date) return <div key={`e-${i}`} />;
            const dateStr = toDateStr(date);
            // While loading we don't know if the day is open/closed or
            // how many dogs are booked, so use neutral defaults to
            // avoid claiming "available" on every date.
            const isOpen = monthLoading
              ? true
              : (monthDayOpenState[dateStr] ?? getDefaultOpenForDate(date));
            const count = monthLoading ? 0 : (monthBookingsByDate[dateStr] || []).length;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedStr;
            const isFull = isOpen && count >= DAY_CAPACITY;

            // Status: closed → red, full → blue, available → green
            // Selected/today still win for clarity. Loading → neutral.
            const numberColor = monthLoading
              ? "text-slate-300"
              : !isOpen
                ? "text-rose-500"
                : isFull
                  ? "text-sky-600"
                  : count > 0
                    ? "text-emerald-700"
                    : "text-emerald-600";

            const dotColor = monthLoading || !isOpen
              ? null
              : isFull
                ? "bg-sky-500"
                : count > 0
                  ? "bg-emerald-500"
                  : null;

            const ariaLabel = `${date.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}${
              monthLoading
                ? ", loading"
                : !isOpen
                  ? ", closed"
                  : isFull
                    ? `, fully booked, ${count} bookings`
                    : count > 0
                      ? `, ${count} ${count === 1 ? "booking" : "bookings"}, availability`
                      : ", availability"
            }`;

            return (
              <button
                key={dateStr}
                onClick={() => onSelectDate(date)}
                aria-label={ariaLabel}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                className={`relative w-full aspect-square rounded-md text-[11px] font-bold border-none cursor-pointer transition-all flex items-center justify-center ${
                  isSelected
                    ? "bg-brand-yellow text-brand-purple shadow-[0_2px_6px_rgba(254,204,19,0.35)]"
                    : `bg-transparent ${numberColor} hover:bg-slate-50`
                } ${
                  isToday
                    ? "ring-2 ring-brand-purple ring-offset-1 ring-offset-white"
                    : ""
                }`}
              >
                <span>{date.getDate()}</span>
                {dotColor && !isSelected && (
                  <span
                    className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${dotColor}`}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-center gap-3 text-micro font-semibold text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full ring-2 ring-brand-purple inline-block" />
            Today
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-brand-yellow inline-block" />
            Selected
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Bookings
          </span>
        </div>

      </div>
    </section>
  );
}
