import { useState, useMemo, useCallback } from "react";
import { SALON_SLOTS } from "../../../constants/index";
import { computeSlotCapacities } from "../../../engine/capacity";
import { isDateOpen } from "../../../engine/utils";
import { toDateStr } from "../../../supabase/transforms";

export function AvailabilityCalendar({ bookingsByDate, dayOpenState, daySettings, onSelectDate, selectedDateStr, sizeTheme }) {
  // Snapshot of "today" at mount; the modal lifecycle is short enough that
  // we don't need to track real-time midnight rollovers, and a stable
  // reference lets the dateStatuses memo skip unnecessary recomputation.
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const monthName = new Date(viewYear, viewMonth).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const isToday = (d) => {
    return d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  };

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Check availability for a date
  const getDateStatus = useCallback((day) => {
    const date = new Date(viewYear, viewMonth, day);
    const dateStr = toDateStr(date);

    // Past dates are disabled
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (date < todayStart) return "past";

    // Closed days aren't bookable. Resolve open/closed through the shared
    // resolver so this picker can't disagree with the rest of the app.
    if (!isDateOpen(dateStr, dayOpenState)) return "closed";

    // Check if there's any availability (at least one slot not full)
    const dayBookings = bookingsByDate?.[dateStr] || [];
    const settings = daySettings?.[dateStr];
    const activeSlots = [...SALON_SLOTS, ...(settings?.extraSlots || [])];
    const capacities = computeSlotCapacities(dayBookings, activeSlots);
    const hasAvailability = Object.values(capacities).some(c => c.available > 0);

    return hasAvailability ? "available" : "full";
  }, [viewYear, viewMonth, today, dayOpenState, bookingsByDate, daySettings]);

  // Memoize statuses for all days in the month to avoid recomputing on every render
  const dateStatuses = useMemo(() => {
    const statuses = {};
    for (let d = 1; d <= daysInMonth; d++) {
      statuses[d] = getDateStatus(d);
    }
    return statuses;
  }, [daysInMonth, getDateStatus]);

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2.5">
        <button type="button" onClick={prevMonth} aria-label="Previous month" className="tap-target bg-slate-50 border border-slate-200 rounded-md w-11 h-11 cursor-pointer flex items-center justify-center text-slate-800 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
          <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3l-5 5 5 5" /></svg>
        </button>
        <div className="text-sm font-bold text-slate-800">{monthName}</div>
        <button type="button" onClick={nextMonth} aria-label="Next month" className="tap-target bg-slate-50 border border-slate-200 rounded-md w-11 h-11 cursor-pointer flex items-center justify-center text-slate-800 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
          <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5" /></svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d} className="text-center text-[10px] font-bold text-slate-500 py-0.5">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-[3px]">
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;

          const status = dateStatuses[d];
          const dateStr = toDateStr(new Date(viewYear, viewMonth, d));
          const isSelected = dateStr === selectedDateStr;
          const isClickable = status === "available";

          let bg = "transparent";
          let color = "#E5E7EB";
          let border = "2px solid transparent";
          let cursor = "not-allowed";
          let opacity = 0.4;
          let fontWeight = 500;

          if (status === "available") {
            bg = "#DCFCE7";
            color = "#16A34A";
            border = "2px solid #16A34A";
            cursor = "pointer";
            opacity = 1;
            fontWeight = 700;
          }
          if (status === "closed") {
            bg = "#FDE8EE";
            color = "var(--color-brand-coral)";
            border = "2px solid #FDE8EE";
            cursor = "not-allowed";
            opacity = 0.7;
            fontWeight = 600;
          }
          if (status === "full") {
            // Slate, not the closed-day pink — "fully booked" and "closed" used
            // to be the same colour. Slate reads as "no space left" and is
            // clearly distinct from a closed (pink) day.
            bg = "#F1F5F9";
            color = "#64748B";
            border = "2px solid #E2E8F0";
            cursor = "not-allowed";
            opacity = 1;
            fontWeight = 600;
          }
          if (isSelected) {
            bg = sizeTheme.gradient[0];
            color = sizeTheme.headerText;
            border = `2px solid ${sizeTheme.gradient[0]}`;
            opacity = 1;
          }
          if (isToday(d) && !isSelected) {
            border = `2px solid ${sizeTheme.gradient[0]}`;
          }

          const statusWord = isSelected
            ? "selected"
            : status === "closed"
              ? "closed"
              : status === "full"
                ? "fully booked"
                : status === "past"
                  ? "past"
                  : "available";

          return (
            <button
              key={d}
              onClick={() => { if (isClickable) onSelectDate(new Date(viewYear, viewMonth, d)); }}
              disabled={!isClickable}
              aria-label={`${d} ${monthName}, ${statusWord}`}
              title={isClickable ? undefined : statusWord.charAt(0).toUpperCase() + statusWord.slice(1)}
              className="w-full aspect-square rounded-lg text-[13px] font-inherit transition-all flex items-center justify-center"
              style={{ background: bg, color, border, cursor, opacity, fontWeight }}
              onMouseEnter={(e) => { if (isClickable && !isSelected) { e.currentTarget.style.background = sizeTheme.light; e.currentTarget.style.color = sizeTheme.gradient[0]; } }}
              onMouseLeave={(e) => { if (isClickable && !isSelected) { e.currentTarget.style.background = "#DCFCE7"; e.currentTarget.style.color = "#16A34A"; } }}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Legend — closed and fully-booked days are both unbookable but mean
          different things, so map the colours rather than leaving staff to guess. */}
      <div className="mt-2.5 flex items-center justify-center gap-3 text-[10px] font-semibold text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#DCFCE7", border: "1px solid #16A34A" }} aria-hidden="true" />
          Available
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#F1F5F9", border: "1px solid #E2E8F0" }} aria-hidden="true" />
          Fully booked
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#FDE8EE", border: "1px solid #FDE8EE" }} aria-hidden="true" />
          Closed
        </span>
      </div>
    </div>
  );
}
