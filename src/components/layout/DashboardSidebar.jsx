import { useMemo } from "react";
import { toDateStr } from "../../supabase/transforms.js";
import { getDefaultOpenForDate } from "../../engine/utils.js";
import { PRICING } from "../../constants/index.js";
import { useMonthBookings } from "../../supabase/hooks/useMonthBookings.js";
import { useMonthDaySettings } from "../../supabase/hooks/useMonthDaySettings.js";
import { SidebarTodos } from "./SidebarTodos.jsx";
import { DashboardWhatsAppCard } from "./DashboardWhatsAppCard.jsx";
import { DashboardWaitlistCard } from "./DashboardWaitlistCard.jsx";

function computeRevenue(bookings, dogs) {
  let total = 0;
  for (const b of bookings) {
    const dog = dogs ? Object.values(dogs).find(d => d.id === b._dogId) : null;
    if (dog?.customPrice != null && dog.customPrice > 0) {
      total += dog.customPrice;
    } else {
      const priceStr = PRICING[b.service]?.[b.size] || "";
      const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
      if (!isNaN(num)) total += num;
    }
  }
  return total;
}

export function DashboardSidebar({
  currentDateObj,
  bookings,
  dogs,
  onSelectDate,
}) {
  const year = currentDateObj.getFullYear();
  const month = currentDateObj.getMonth();
  const todayStr = toDateStr(new Date());
  const selectedStr = toDateStr(currentDateObj);

  const { monthBookingsByDate } = useMonthBookings(year, month);
  const { monthDayOpenState } = useMonthDaySettings(year, month);

  const revenue = useMemo(() => computeRevenue(bookings || [], dogs), [bookings, dogs]);
  const bookingCount = (bookings || []).length;

  const { weeks, monthName } = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const mName = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

    const rows = [];
    let week = new Array(startDay).fill(null);
    for (let d = 1; d <= last.getDate(); d++) {
      week.push(new Date(year, month, d));
      if (week.length === 7) { rows.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      rows.push(week);
    }
    return { weeks: rows, monthName: mName };
  }, [year, month]);

  return (
    <div className="flex flex-col gap-4">
      {/* WhatsApp summary — awaiting-reply first. Placed at top so
          inbound customer messages get visual priority over revenue. */}
      <DashboardWhatsAppCard />

      {/* Waitlist summary — total + this week (not day-scoped; that would
          duplicate WaitlistPanel in the main content area). */}
      <DashboardWaitlistCard />

      {/* Revenue card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
          {selectedStr === todayStr ? "Today" : "Viewing"} &mdash; {currentDateObj.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
        </div>
        <div className="flex items-baseline gap-3">
          <div>
            <div className="text-2xl font-black text-slate-800 font-display">&pound;{revenue}</div>
            <div className="text-xs font-semibold text-slate-500">revenue</div>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div>
            <div className="text-2xl font-black text-brand-cyan font-display">{bookingCount}</div>
            <div className="text-xs font-semibold text-slate-500">{bookingCount === 1 ? "dog" : "dogs"}</div>
          </div>
        </div>
      </div>

      {/* Mini month calendar */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        {/* Navy header — intentionally not cyan so the sidebar has a
            visual anchor distinct from the day header above. */}
        <div className="bg-brand-purple px-4 py-2.5">
          <div className="text-sm font-extrabold text-white font-display">{monthName}</div>
        </div>

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

      {/* To-do list */}
      <SidebarTodos />
    </div>
  );
}
