import { useMemo } from "react";
import { PRICING, SALON_SLOTS } from "../../../constants/index.js";
import { useSalon } from "../../../contexts/SalonContext.js";
import { getDogByIdOrName } from "../../../engine/bookingRules.js";
import { toDateStr } from "../../../supabase/transforms.js";
import { Trend } from "./ReportWidgets.jsx";

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

function buildInsight(thisWeekData, thisWeekTotal, thisWeekCount, openSlots, fillPct) {
  if (thisWeekCount === 0) {
    return "No bookings yet this week — calendar is wide open.";
  }
  const activeDays = thisWeekData.filter((d) => d.count > 0);
  const peak = thisWeekData.reduce((best, d) => (d.revenue > best.revenue ? d : best), thisWeekData[0]);
  if (activeDays.length === 1) {
    return `${peak.label} is currently carrying the week.`;
  }
  if (fillPct < 20 && openSlots > 0) {
    return `${peak.label} is leading — plenty of room on the other days.`;
  }
  if (fillPct > 75) {
    return `Strong week — ${fillPct.toFixed(0)}% of seats already filled.`;
  }
  return `${peak.label} is the strongest day so far (£${peak.revenue.toFixed(0)}).`;
}

export function WeeklySnapshot() {
  const { dogs, bookingsByDate } = useSalon();

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

  const lastWeekTotal = useMemo(() => {
    return lastWeekDates.reduce((sum, date) => {
      const dateStr = toDateStr(date);
      return sum + revenueForDay(bookingsByDate[dateStr] || [], dogs);
    }, 0);
  }, [lastWeekDates, bookingsByDate, dogs]);

  const thisWeekTotal = thisWeekData.reduce((s, d) => s + d.revenue, 0);
  const thisWeekCount = thisWeekData.reduce((s, d) => s + d.count, 0);
  const openDays = thisWeekData.filter((d) => d.count > 0).length;
  const openSlots = openDays * SALON_SLOTS.length * 2;
  const fillPct = openSlots > 0 ? Math.min((thisWeekCount / openSlots) * 100, 100) : 0;
  const avgPerDog = thisWeekCount > 0 ? thisWeekTotal / thisWeekCount : 0;
  const maxDayRevenue = Math.max(...thisWeekData.map((d) => d.revenue), 1);
  const insight = buildInsight(thisWeekData, thisWeekTotal, thisWeekCount, openSlots, fillPct);

  return (
    <section
      aria-label="This week at a glance"
      className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.05)]"
    >
      <div className="bg-gradient-to-br from-brand-cyan-light to-brand-cyan-dark px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] sm:text-base font-extrabold text-white m-0">This week</h2>
          <div className="text-[11px] sm:text-xs font-semibold text-white/80">
            Last week £{lastWeekTotal.toFixed(0)}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* Hero stat strip */}
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-slate-800 font-display leading-none">
              £{thisWeekTotal.toFixed(0)}
            </span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">revenue</span>
            <Trend cur={thisWeekTotal} prev={lastWeekTotal} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-700 font-display leading-none">
              {thisWeekCount}
            </span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              booking{thisWeekCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-700 font-display leading-none">
              {fillPct.toFixed(0)}%
            </span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">filled</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-700 font-display leading-none">
              £{avgPerDog.toFixed(0)}
            </span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">/ dog</span>
          </div>
        </div>

        {/* Day strip */}
        <div className="flex gap-1.5 sm:gap-2 items-end h-[68px] mb-3">
          {thisWeekData.map((day) => {
            const isClosed = day.count === 0 && day.revenue === 0;
            return (
              <div key={day.label} className="flex-1 text-center flex flex-col items-center justify-end h-full">
                <div
                  className={`w-full max-w-[40px] rounded-t-md min-h-[3px] transition-[height] duration-300 ${
                    day.isToday ? "bg-brand-teal" : day.revenue > 0 ? "bg-brand-cyan" : "bg-slate-200"
                  }`}
                  style={{ height: `${Math.max((day.revenue / maxDayRevenue) * 100, 4)}%` }}
                  aria-label={`${day.label}: £${day.revenue}, ${day.count} booking${day.count !== 1 ? "s" : ""}`}
                />
                <div className={`text-[10px] sm:text-[11px] font-bold mt-1 ${day.isToday ? "text-brand-teal" : "text-slate-700"}`}>
                  {day.label}
                </div>
                <div className="text-[10px] font-semibold text-slate-400">
                  {isClosed ? "—" : `£${day.revenue}`}
                </div>
              </div>
            );
          })}
        </div>

        {/* Insight */}
        <div className="text-[12px] sm:text-[13px] font-medium leading-relaxed">
          <span className="text-[#2D8B7A] font-bold">Insight: </span>
          <span className="text-slate-600">{insight}</span>
        </div>
      </div>
    </section>
  );
}
