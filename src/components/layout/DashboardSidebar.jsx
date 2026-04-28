import { useEffect, useMemo, useState } from "react";
import { toDateStr } from "../../supabase/transforms.js";
import { getDefaultOpenForDate } from "../../engine/utils.js";
import { useMonthBookings } from "../../supabase/hooks/useMonthBookings.js";
import { useMonthDaySettings } from "../../supabase/hooks/useMonthDaySettings.js";
import { DashboardWhatsAppCard } from "./DashboardWhatsAppCard.jsx";

// Working capacity: 14 dogs per open day. Reflects the realistic
// throughput once size mix and groomer time are factored in, rather
// than the raw 10-slots × 2-seats theoretical maximum.
const DAY_CAPACITY = 14;

function utilisationColor(pct) {
  if (pct >= 70) return "bg-rose-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-emerald-500";
}

export function DashboardSidebar({
  currentDateObj,
  dates,
  bookingsByDate,
  dayOpenState,
  onSelectDate,
}) {
  const todayStr = toDateStr(new Date());
  const selectedStr = toDateStr(currentDateObj);

  // Local month-navigation state. Lets the user page through the
  // mini-calendar without changing the selected day. Resets when
  // currentDateObj jumps (e.g. via the day arrows in the header).
  const [viewYear, setViewYear] = useState(currentDateObj.getFullYear());
  const [viewMonth, setViewMonth] = useState(currentDateObj.getMonth());
  useEffect(() => {
    setViewYear(currentDateObj.getFullYear());
    setViewMonth(currentDateObj.getMonth());
  }, [currentDateObj]);

  const { monthBookingsByDate } = useMonthBookings(viewYear, viewMonth);
  const { monthDayOpenState } = useMonthDaySettings(viewYear, viewMonth);

  // Capacity figures — "today" reflects the day the user is currently
  // viewing (matches how the rest of the dashboard scopes), and
  // "this week" sums the visible week.
  const capacity = useMemo(() => {
    const dayBookings = (bookingsByDate?.[selectedStr] || []).length;
    const dayOpen = dayOpenState?.[selectedStr] ?? getDefaultOpenForDate(currentDateObj);
    const dayCap = dayOpen ? DAY_CAPACITY : 0;
    const dayPct = dayCap > 0 ? Math.min(100, Math.round((dayBookings / dayCap) * 100)) : 0;

    let weekBookings = 0;
    let openDays = 0;
    (dates || []).forEach((d) => {
      weekBookings += (bookingsByDate?.[d.dateStr] || []).length;
      const isOpen = dayOpenState?.[d.dateStr] ?? getDefaultOpenForDate(d.dateObj);
      if (isOpen) openDays += 1;
    });
    const weekCap = openDays * DAY_CAPACITY;
    const weekPct = weekCap > 0 ? Math.min(100, Math.round((weekBookings / weekCap) * 100)) : 0;

    return { dayBookings, dayCap, dayPct, dayOpen, weekBookings, weekCap, weekPct };
  }, [bookingsByDate, dayOpenState, dates, selectedStr, currentDateObj]);

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
    <div className="flex flex-col gap-4 h-full">
      {/* Mini month calendar — at the top so the user can jump to
          any day without leaving the dashboard. The banner is its
          own standalone rounded-xl bar so it visually mirrors the
          day-header banner on the main column. */}
      <div className="bg-brand-purple py-2 px-4 md:py-2.5 md:px-5 rounded-xl flex items-center gap-2 shadow-sm">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          aria-label="Previous month"
          title="Previous month"
          className="w-7 h-7 rounded-md flex items-center justify-center border-none cursor-pointer transition-all shrink-0 bg-white/15 text-white hover:bg-white/25"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1 text-center text-base md:text-lg font-bold text-white leading-tight font-display">
          {monthName}
        </div>
        <button
          type="button"
          onClick={() => goMonth(1)}
          aria-label="Next month"
          title="Next month"
          className="w-7 h-7 rounded-md flex items-center justify-center border-none cursor-pointer transition-all shrink-0 bg-white/15 text-white hover:bg-white/25"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Calendar grid card */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="p-3">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-slate-400">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {weeks.flat().map((date, i) => {
              if (!date) return <div key={`e-${i}`} />;

              const dateStr = toDateStr(date);
              const isOpen = monthDayOpenState[dateStr] ?? getDefaultOpenForDate(date);
              const count = (monthBookingsByDate[dateStr] || []).length;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedStr;

              const dotColor =
                count === 0
                  ? null
                  : count <= 3
                    ? "bg-emerald-400"
                    : count <= 6
                      ? "bg-amber-400"
                      : "bg-rose-400";

              return (
                <button
                  key={dateStr}
                  onClick={() => onSelectDate(date)}
                  aria-label={`${date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${count > 0 ? `, ${count} ${count === 1 ? "booking" : "bookings"}` : !isOpen ? ", closed" : ""}`}
                  className={`relative w-full aspect-square rounded-md text-[11px] font-bold border-none cursor-pointer transition-all flex items-center justify-center ${
                    isSelected
                      ? "bg-brand-cyan text-white shadow-[0_2px_6px_rgba(0,184,224,0.35)]"
                      : isToday
                        ? "bg-sky-50 text-brand-cyan border border-brand-cyan"
                        : !isOpen
                          ? "bg-transparent text-slate-300"
                          : count > 0
                            ? "bg-transparent text-slate-800 hover:bg-slate-50"
                            : "bg-transparent text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <span>{date.getDate()}</span>
                  {dotColor && (
                    <span
                      className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${
                        isSelected ? "bg-white/90" : dotColor
                      }`}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Busyness dot legend */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-500">
            <span className="flex items-center gap-1" title="1–3 bookings: quiet day">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              Quiet
            </span>
            <span className="flex items-center gap-1" title="4–6 bookings: steady day">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" />
              Steady
            </span>
            <span className="flex items-center gap-1" title="7+ bookings: full day">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" aria-hidden="true" />
              Full
            </span>
          </div>
        </div>
      </div>

      {/* WhatsApp summary — sits below the calendar so the at-a-glance
          message preview is in the user's natural read order. */}
      <DashboardWhatsAppCard />

      {/* Capacity bar — anchored to the bottom with mt-auto so the
          column ends at the same Y as the schedule. Colour follows
          utilisation: emerald (quiet), amber (steady), rose (full). */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mt-auto">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
          Capacity
        </div>

        <div className="mb-3">
          <div className="flex items-baseline justify-between mb-1.5 gap-2">
            <div className="text-xs font-semibold text-slate-700 truncate">
              {selectedStr === todayStr ? "Today" : "This day"}
              <span className="text-slate-400 font-medium ml-1">
                {currentDateObj.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              </span>
            </div>
            <div className="text-xs font-semibold text-slate-500 tabular-nums shrink-0">
              {capacity.dayOpen ? (
                `${capacity.dayPct}%`
              ) : (
                <span className="text-slate-400 italic">closed</span>
              )}
            </div>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full ${utilisationColor(capacity.dayPct)} rounded-full transition-all`}
              style={{ width: `${capacity.dayOpen ? capacity.dayPct : 0}%` }}
              aria-hidden="true"
            />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1.5 gap-2">
            <div className="text-xs font-semibold text-slate-700">This week</div>
            <div className="text-xs font-semibold text-slate-500 tabular-nums shrink-0">
              {capacity.weekPct}%
            </div>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full ${utilisationColor(capacity.weekPct)} rounded-full transition-all`}
              style={{ width: `${capacity.weekPct}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
