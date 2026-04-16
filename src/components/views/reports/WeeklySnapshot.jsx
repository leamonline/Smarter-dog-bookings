import { useState, useMemo } from "react";
import { PRICING, SERVICES } from "../../../constants/index.js";
import { useSalon } from "../../../contexts/SalonContext.js";
import { getDogByIdOrName } from "../../../engine/bookingRules.js";
import { toDateStr } from "../../../supabase/transforms.js";

function parsePrice(service, size, customPrice) {
  if (customPrice != null && customPrice > 0) return customPrice;
  const priceStr = PRICING[service]?.[size] || "";
  const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : num;
}

function getWeekDates(refDate) {
  const d = new Date(refDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    dates.push(dt);
  }
  return dates;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function revenueForDay(bookings, dogs) {
  return bookings.reduce((sum, b) => {
    const dog = getDogByIdOrName(dogs, b._dogId || b.dogName);
    return sum + parsePrice(b.service, b.size, dog?.customPrice);
  }, 0);
}

export function WeeklySnapshot() {
  const { dogs, bookingsByDate } = useSalon();
  const [open, setOpen] = useState(true);

  const today = new Date();
  const todayStr = toDateStr(today);

  const thisWeekDates = useMemo(() => getWeekDates(today), [todayStr]);
  const lastWeekDates = useMemo(() => {
    const lastMon = new Date(thisWeekDates[0]);
    lastMon.setDate(lastMon.getDate() - 7);
    return getWeekDates(lastMon);
  }, [thisWeekDates]);

  const thisWeekData = useMemo(() => {
    return thisWeekDates.map((date, i) => {
      const dateStr = toDateStr(date);
      const dayBookings = bookingsByDate[dateStr] || [];
      const revenue = revenueForDay(dayBookings, dogs);
      return {
        label: DAY_LABELS[i],
        dateStr,
        revenue,
        count: dayBookings.length,
        isToday: dateStr === todayStr,
      };
    });
  }, [thisWeekDates, bookingsByDate, todayStr, dogs]);

  const lastWeekData = useMemo(() => {
    return lastWeekDates.map((date) => {
      const dateStr = toDateStr(date);
      const dayBookings = bookingsByDate[dateStr] || [];
      return revenueForDay(dayBookings, dogs);
    });
  }, [lastWeekDates, bookingsByDate, dogs]);

  const thisWeekTotal = thisWeekData.reduce((s, d) => s + d.revenue, 0);
  const lastWeekTotal = lastWeekData.reduce((s, v) => s + v, 0);
  const maxDayRevenue = Math.max(...thisWeekData.map((d) => d.revenue), 1);

  const thisWeekAvg = (thisWeekData.reduce((s, d) => s + d.count, 0) / 7).toFixed(1);
  const lastWeekAvg = useMemo(() => {
    const total = lastWeekDates.reduce((sum, date) => {
      const dateStr = toDateStr(date);
      return sum + (bookingsByDate[dateStr] || []).length;
    }, 0);
    return (total / 7).toFixed(1);
  }, [lastWeekDates, bookingsByDate]);

  const monthlyTotal = useMemo(() => {
    const month = today.getMonth();
    const year = today.getFullYear();
    let total = 0;
    for (const [dateStr, dayBookings] of Object.entries(bookingsByDate)) {
      const d = new Date(dateStr + "T00:00:00");
      if (d.getMonth() === month && d.getFullYear() === year) {
        total += revenueForDay(dayBookings, dogs);
      }
    }
    return total;
  }, [bookingsByDate, todayStr, dogs]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gradient-to-br from-brand-cyan to-brand-cyan-dark border-none cursor-pointer font-[inherit]"
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-extrabold text-white">This Week at a Glance</span>
          <span className="text-xs font-semibold text-white/60">
            {thisWeekAvg} dogs/day avg
          </span>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="p-5 px-6">
          {/* Revenue hero + bar chart */}
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-[28px] font-black text-slate-800 font-display">
              £{thisWeekTotal}
            </span>
            <span className="text-sm font-semibold text-slate-500">this week</span>
          </div>

          <div className="flex gap-2 items-end h-[100px] mb-4">
            {thisWeekData.map((day) => (
              <div key={day.label} className="flex-1 text-center flex flex-col items-center justify-end h-full">
                <div
                  className={`w-full max-w-[40px] rounded-t-md min-h-[4px] transition-[height] duration-300 ${day.isToday ? "bg-brand-teal" : "bg-brand-cyan"}`}
                  style={{ height: `${Math.max((day.revenue / maxDayRevenue) * 100, 4)}%` }}
                />
                <div className="text-[11px] font-bold text-slate-800 mt-1.5">{day.label}</div>
                <div className="text-[11px] font-semibold text-slate-500">£{day.revenue}</div>
              </div>
            ))}
          </div>

          {/* Comparison stats */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <span className="text-xs font-semibold text-slate-500">Last week: </span>
              <span className="font-extrabold text-slate-800">£{lastWeekTotal}</span>
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-500">This month: </span>
              <span className="font-extrabold text-slate-800">£{monthlyTotal}</span>
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-500">Last week avg: </span>
              <span className="font-extrabold text-slate-800">{lastWeekAvg}/day</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
