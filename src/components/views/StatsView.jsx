// src/components/views/StatsView.jsx
import { useMemo } from "react";
import { PRICING, SERVICES, SALON_SLOTS } from "../../constants/index.js";
import { useSalon } from "../../contexts/SalonContext.jsx";
import { getDogByIdOrName, getHumanByIdOrName } from "../../engine/bookingRules.js";
import { toDateStr } from "../../supabase/transforms.js";

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

function RevenueForDay(bookings, dogs) {
  return bookings.reduce((sum, b) => {
    const dog = getDogByIdOrName(dogs, b._dogId || b.dogName);
    return sum + parsePrice(b.service, b.size, dog?.customPrice);
  }, 0);
}

export function StatsView() {
  const { dogs, humans, bookingsByDate } = useSalon();

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
      const revenue = RevenueForDay(dayBookings, dogs);
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
      return RevenueForDay(dayBookings, dogs);
    });
  }, [lastWeekDates, bookingsByDate, dogs]);

  const thisWeekTotal = thisWeekData.reduce((s, d) => s + d.revenue, 0);
  const lastWeekTotal = lastWeekData.reduce((s, v) => s + v, 0);
  const maxDayRevenue = Math.max(...thisWeekData.map((d) => d.revenue), 1);

  const monthlyTotal = useMemo(() => {
    const month = today.getMonth();
    const year = today.getFullYear();
    let total = 0;
    for (const [dateStr, dayBookings] of Object.entries(bookingsByDate)) {
      const d = new Date(dateStr + "T00:00:00");
      if (d.getMonth() === month && d.getFullYear() === year) {
        total += RevenueForDay(dayBookings, dogs);
      }
    }
    return total;
  }, [bookingsByDate, todayStr, dogs]);

  const busiestDay = useMemo(() => {
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    for (const [dateStr, dayBookings] of Object.entries(bookingsByDate)) {
      const d = new Date(dateStr + "T00:00:00");
      const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
      dayCounts[dayIdx]++;
      dayTotals[dayIdx] += dayBookings.length;
    }
    let bestIdx = 0;
    let bestAvg = 0;
    for (let i = 0; i < 7; i++) {
      const avg = dayCounts[i] > 0 ? dayTotals[i] / dayCounts[i] : 0;
      if (avg > bestAvg) { bestAvg = avg; bestIdx = i; }
    }
    const FULL_DAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
    return { day: FULL_DAYS[bestIdx], avg: bestAvg.toFixed(1) };
  }, [bookingsByDate]);

  const serviceBreakdown = useMemo(() => {
    const counts = {};
    for (const dayBookings of Object.values(bookingsByDate)) {
      for (const b of dayBookings) {
        counts[b.service] = (counts[b.service] || 0) + 1;
      }
    }
    return SERVICES
      .map((s) => ({ name: s.name, count: counts[s.id] || 0 }))
      .sort((a, b) => b.count - a.count);
  }, [bookingsByDate]);

  const topCustomers = useMemo(() => {
    const ownerCounts = {};
    for (const dayBookings of Object.values(bookingsByDate)) {
      for (const b of dayBookings) {
        const dog = getDogByIdOrName(dogs, b.dog_id || b.dogName);
        const human = dog?._humanId
          ? getHumanByIdOrName(humans, dog._humanId)
          : null;
        const name = human
          ? `${human.name || ""} ${human.surname || ""}`.trim()
          : b.ownerName || b.owner || "Unknown";
        if (name && name !== "Unknown") {
          ownerCounts[name] = (ownerCounts[name] || 0) + 1;
        }
      }
    }
    return Object.entries(ownerCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }, [bookingsByDate, dogs, humans]);

  const thisWeekAvg = (thisWeekData.reduce((s, d) => s + d.count, 0) / 7).toFixed(1);
  const lastWeekAvg = useMemo(() => {
    const total = lastWeekDates.reduce((sum, date) => {
      const dateStr = toDateStr(date);
      return sum + (bookingsByDate[dateStr] || []).length;
    }, 0);
    return (total / 7).toFixed(1);
  }, [lastWeekDates, bookingsByDate]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header banner */}
      <div className="bg-gradient-to-br from-brand-blue to-brand-blue-dark py-5 px-5 md:px-7 rounded-xl relative overflow-hidden">
        <div className="absolute right-8 top-0 text-[80px] opacity-[0.04] -rotate-[15deg] pointer-events-none select-none">{"\uD83D\uDC3E"}</div>
        <div className="relative z-[1]">
          <div className="text-xl md:text-2xl font-black text-white">Weekly Snapshot</div>
          <div className="text-sm font-semibold text-white/70 mt-0.5">
            Performance overview for this week
          </div>
        </div>
      </div>

      {/* Revenue card */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04),0_4px_16px_rgba(45,139,122,0.06)]">
        <div className="h-[3px] bg-gradient-to-r from-brand-teal to-[#3BA594]" />
        <div className="p-5 px-6">
        <div className="text-[13px] font-extrabold text-brand-teal uppercase tracking-widest mb-4">Revenue</div>

        {/* Hero total */}
        <div className="flex items-baseline gap-2 mb-5">
          <span className="text-[32px] font-black text-slate-800">
            £{thisWeekTotal}
          </span>
          <span className="text-sm font-semibold text-slate-500">
            this week
          </span>
        </div>

        {/* Bar chart */}
        <div className="flex gap-2 items-end h-[120px] mb-4">
          {thisWeekData.map((day) => (
            <div key={day.label} className="flex-1 text-center flex flex-col items-center justify-end h-full">
              <div
                className={`w-full max-w-[40px] rounded-t-md min-h-[4px] transition-[height] duration-300 ${day.isToday ? "bg-brand-teal" : "bg-brand-blue"}`}
                style={{
                  height: `${Math.max((day.revenue / maxDayRevenue) * 100, 4)}%`,
                }}
              />
              <div className="text-[11px] font-bold text-slate-800 mt-1.5">
                {day.label}
              </div>
              <div className="text-[11px] font-semibold text-slate-500">
                £{day.revenue}
              </div>
            </div>
          ))}
        </div>

        {/* Comparisons */}
        <div className="flex gap-6">
          <div>
            <span className="text-xs font-semibold text-slate-500">Last week: </span>
            <span className="text-sm font-extrabold text-slate-800">£{lastWeekTotal}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">This month: </span>
            <span className="text-sm font-extrabold text-slate-800">£{monthlyTotal}</span>
          </div>
        </div>
        </div>
      </div>

      {/* Operations card */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04),0_4px_16px_rgba(14,165,233,0.06)]">
        <div className="h-[3px] bg-gradient-to-r from-brand-blue to-[#38BDF8]" />
        <div className="p-5 px-6">
        <div className="text-[13px] font-extrabold text-brand-blue uppercase tracking-widest mb-4">Operations</div>

        {/* Busiest day */}
        <div className="mb-5">
          <div className="text-sm font-bold text-slate-800">
            {busiestDay.day} are your busiest day
          </div>
          <div className="text-xs font-semibold text-slate-500">
            avg {busiestDay.avg} bookings per {busiestDay.day.replace(/s$/, "").toLowerCase()}
          </div>
        </div>

        {/* Service breakdown */}
        <div className="mb-5">
          <div className="text-xs font-bold text-slate-500 mb-2">
            Services
          </div>
          {serviceBreakdown.map((svc) => {
            const pct = serviceBreakdown[0]?.count > 0
              ? (svc.count / serviceBreakdown[0].count) * 100
              : 0;
            return (
              <div key={svc.name} className="flex items-center gap-2.5 mb-1.5">
                <span className="text-[13px] font-semibold text-slate-800 w-[110px] shrink-0">
                  {svc.name}
                </span>
                <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-brand-blue rounded"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs font-extrabold text-slate-800 w-[30px] text-right">
                  {svc.count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Top customers */}
        <div className="mb-5">
          <div className="text-xs font-bold text-slate-500 mb-2">
            Top Customers
          </div>
          {topCustomers.map((c, i) => (
            <div key={c.name} className="flex justify-between py-1">
              <span className="text-[13px] font-semibold text-slate-800">
                {i + 1}. {c.name}
              </span>
              <span className="text-xs font-extrabold text-brand-blue">
                {c.count} booking{c.count !== 1 ? "s" : ""}
              </span>
            </div>
          ))}
          {topCustomers.length === 0 && (
            <div className="text-xs text-slate-500">No booking data yet</div>
          )}
        </div>

        {/* Daily averages */}
        <div className="flex gap-6">
          <div>
            <span className="text-xs font-semibold text-slate-500">This week: </span>
            <span className="text-sm font-extrabold text-slate-800">{thisWeekAvg}/day</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">Last week: </span>
            <span className="text-sm font-extrabold text-slate-800">{lastWeekAvg}/day</span>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
