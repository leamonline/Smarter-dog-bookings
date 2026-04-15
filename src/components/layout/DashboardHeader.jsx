import { useMemo, useRef, useEffect } from "react";
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

export function DashboardHeader({ currentDateObj, bookings, dogs, onNewBooking, searchQuery, onSearchChange }) {
  const revenue = useMemo(() => computeRevenue(bookings || [], dogs), [bookings, dogs]);
  const bookingCount = (bookings || []).length;
  const { weekday, day, month, year } = formatFullDate(currentDateObj);
  const searchRef = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        onSearchChange?.("");
        searchRef.current?.blur();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onSearchChange]);

  return (
    <div className="bg-gradient-to-br from-brand-blue to-brand-blue-dark py-6 px-5 md:px-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-b-xl relative overflow-hidden">
      {/* Paw watermark */}
      <div className="absolute right-10 -top-3.5 text-[100px] opacity-[0.04] -rotate-[15deg] pointer-events-none select-none">
        {"\uD83D\uDC3E"}
      </div>

      {/* Left: Full date + search */}
      <div className="relative z-[1]">
        <div className="text-2xl md:text-[28px] font-black text-white leading-tight">
          {weekday} {day} {month}
        </div>
        <div className="text-sm font-semibold text-white/70 mt-1">
          {year} · {bookingCount} {bookingCount === 1 ? "dog" : "dogs"} booked
        </div>
        {onSearchChange && (
          <div className="relative mt-2.5">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={searchQuery || ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search bookings... (Cmd+K)"
              className="w-full md:w-56 py-1.5 pl-7 pr-2 rounded-lg bg-white/15 border border-white/20 text-white text-xs font-medium placeholder:text-white/40 outline-none focus:bg-white/25 focus:border-white/40 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Right: Revenue stat + Book Now pill */}
      <div className="relative z-[1] flex items-center gap-4 justify-center md:justify-end self-center md:self-auto">
        {/* Revenue stat */}
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
            Today&apos;s revenue
          </div>
          <div className="text-2xl font-black text-white leading-tight">
            &pound;{revenue}
          </div>
        </div>

        {/* Book Now pill */}
        <button
          onClick={onNewBooking}
          className="bg-white text-brand-blue font-semibold rounded-full px-5 py-2 text-sm border-none cursor-pointer transition-all hover:shadow-lg hover:scale-[1.03] active:scale-[0.98] font-[inherit]"
        >
          Book Now
        </button>
      </div>
    </div>
  );
}
