import { useMemo } from "react";
import { PRICING } from "../../constants/index.js";

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

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatFullDate(dateObj) {
  const weekday = dateObj.toLocaleDateString("en-GB", { weekday: "long" });
  const day = ordinal(dateObj.getDate());
  const month = dateObj.toLocaleDateString("en-GB", { month: "long" });
  return { weekday, day, month, year: dateObj.getFullYear() };
}

export function DashboardHeader({ currentDateObj, bookings, dogs, onOpenCalendar }) {
  const revenue = useMemo(() => computeRevenue(bookings || [], dogs), [bookings, dogs]);
  const bookingCount = (bookings || []).length;
  const { weekday, day, month } = formatFullDate(currentDateObj);

  return (
    <div className="bg-gradient-to-br from-brand-cyan to-brand-cyan-dark py-3 px-4 md:px-5 flex items-center gap-3 rounded-b-xl relative overflow-hidden">
      {/* Paw watermark */}
      <svg className="absolute right-6 -top-1 w-20 h-20 opacity-[0.06] -rotate-[15deg] pointer-events-none select-none" viewBox="0 0 24 24" fill="white">
        <ellipse cx="8" cy="6" rx="2.5" ry="3" /><ellipse cx="16" cy="6" rx="2.5" ry="3" /><ellipse cx="4.5" cy="12" rx="2" ry="2.5" /><ellipse cx="19.5" cy="12" rx="2" ry="2.5" /><ellipse cx="12" cy="16.5" rx="5" ry="4" />
      </svg>

      {/* Date */}
      <div className="relative z-[1] min-w-0">
        <div className="text-lg md:text-xl font-black text-white leading-tight truncate font-display">
          {weekday} {day} {month}
        </div>
      </div>

      {/* Stats pills — desktop */}
      <div className="relative z-[1] hidden md:flex items-center gap-2 text-xs font-bold text-white/70 shrink-0">
        <span className="bg-white/15 rounded-full px-2.5 py-1">
          {bookingCount} {bookingCount === 1 ? "dog" : "dogs"}
        </span>
        <span className="bg-white/15 rounded-full px-2.5 py-1">
          £{revenue}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Mobile stats */}
      <div className="relative z-[1] xl:hidden text-right shrink-0">
        <div className="text-xs font-bold text-white/70">
          {bookingCount} dogs · £{revenue}
        </div>
      </div>

      {/* Calendar picker button — mobile/tablet only (xl has sidebar calendar) */}
      {onOpenCalendar && (
        <button
          onClick={onOpenCalendar}
          className="relative z-[1] xl:hidden w-9 h-9 rounded-lg flex items-center justify-center border-none cursor-pointer transition-all shrink-0 bg-white/15 text-white hover:bg-white/25"
          aria-label="Open calendar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="16" y1="2" x2="16" y2="6" />
          </svg>
        </button>
      )}
    </div>
  );
}
