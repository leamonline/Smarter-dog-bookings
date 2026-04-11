import { useState, useMemo } from "react";
import { SALON_SLOTS, ALL_DAYS } from "../../../constants/index.js";
import { computeSlotCapacities } from "../../../engine/capacity.js";
import { toDateStr } from "../../../supabase/transforms.js";

export function AvailabilityCalendar({ bookingsByDate, dayOpenState, daySettings, onSelectDate, selectedDateStr, sizeTheme }) {
  const today = new Date();
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
  const getDateStatus = (day) => {
    const date = new Date(viewYear, viewMonth, day);
    const dateStr = toDateStr(date);

    // Past dates are disabled
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (date < todayStart) return "past";

    // Check if day is open — use dayOpenState if available, else check default from ALL_DAYS
    const dayOfWeek = date.getDay();
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    if (dayOpenState && dayOpenState[dateStr] !== undefined) {
      if (!dayOpenState[dateStr]) return "closed";
    } else {
      // Fall back to default open state
      if (!ALL_DAYS[dayIndex]?.defaultOpen) return "closed";
    }

    // Check if there's any availability (at least one slot not full)
    const dayBookings = bookingsByDate?.[dateStr] || [];
    const settings = daySettings?.[dateStr];
    const activeSlots = [...SALON_SLOTS, ...(settings?.extraSlots || [])];
    const capacities = computeSlotCapacities(dayBookings, activeSlots);
    const hasAvailability = Object.values(capacities).some(c => c.available > 0);

    return hasAvailability ? "available" : "full";
  };

  // Memoize statuses for all days in the month to avoid recomputing on every render
  const dateStatuses = useMemo(() => {
    const statuses = {};
    for (let d = 1; d <= daysInMonth; d++) {
      statuses[d] = getDateStatus(d);
    }
    return statuses;
  }, [viewYear, viewMonth, daysInMonth, bookingsByDate, dayOpenState, daySettings]);

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2.5">
        <button onClick={prevMonth} className="bg-slate-50 border border-slate-200 rounded-md w-[30px] h-[30px] cursor-pointer flex items-center justify-center">
          <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-slate-800"><path d="M10 3l-5 5 5 5" /></svg>
        </button>
        <div className="text-sm font-bold text-slate-800">{monthName}</div>
        <button onClick={nextMonth} className="bg-slate-50 border border-slate-200 rounded-md w-[30px] h-[30px] cursor-pointer flex items-center justify-center">
          <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-slate-800"><path d="M6 3l5 5-5 5" /></svg>
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
            color = "#E8567F";
            border = "2px solid #FDE8EE";
            cursor = "not-allowed";
            opacity = 0.7;
            fontWeight = 600;
          }
          if (status === "full") {
            bg = "#FDE8EE";
            color = "#E8567F";
            border = "2px solid #FDE8EE";
            cursor = "not-allowed";
            opacity = 0.6;
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

          return (
            <button
              key={d}
              onClick={() => { if (isClickable) onSelectDate(new Date(viewYear, viewMonth, d)); }}
              disabled={!isClickable}
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
    </div>
  );
}
