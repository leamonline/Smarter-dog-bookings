import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toDateStr } from "../../supabase/transforms";
import { getDefaultOpenForDate } from "../../engine/utils";
import { useMonthBookings } from "../../supabase/hooks/useMonthBookings.js";
import { useMonthDaySettings } from "../../supabase/hooks/useMonthDaySettings.js";
import { DAY_CAPACITY } from "../../engine/utilisation";
import { dayCircleStyle, startOfDay } from "../layout/DayTab.jsx";

export function MiniCalendarCard({ currentDateObj, onSelectDate, bare = false }) {
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
      className={
        bare
          ? "overflow-hidden"
          : "bg-white rounded-2xl border border-gray-100 shadow-card-resting overflow-hidden"
      }
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          aria-label="Previous month"
          className="tap-target w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer text-brand-purple/60 hover:text-brand-purple hover:bg-brand-purple/5 transition-colors"
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
          className="tap-target w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer text-brand-purple/60 hover:text-brand-purple hover:bg-brand-purple/5 transition-colors"
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
            const isPast = startOfDay(date) < startOfDay(new Date());

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

            // Match the week-strip dots: the date sits in a circle whose
            // colour answers "can I book this day?" — closed → muted grey,
            // open → green, full → blue. Selected wins (yellow); today keeps
            // a yellow ring.
            const circleStyle = isSelected
              ? "bg-brand-yellow text-brand-purple shadow-[0_2px_6px_rgba(254,204,19,0.35)]"
              : dayCircleStyle({ isPast, dogCount: monthLoading ? null : count, isOpen });

            return (
              <button
                key={dateStr}
                onClick={() => onSelectDate(date)}
                aria-label={ariaLabel}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                className="w-full aspect-square min-h-[40px] flex items-center justify-center rounded-full border-none cursor-pointer bg-transparent transition-all hover:bg-slate-50"
              >
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-black font-display leading-none transition-all ${circleStyle} ${
                    isToday && !isSelected ? "ring-2 ring-brand-yellow ring-offset-1" : ""
                  }`}
                >
                  {date.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-micro font-semibold text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full ring-2 ring-brand-yellow inline-block" />
            Today
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-yellow inline-block" />
            Selected
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            Open
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
            Full
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-200 inline-block" />
            Closed
          </span>
        </div>

      </div>
    </section>
  );
}
