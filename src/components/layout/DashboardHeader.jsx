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

      {/* Right: Action cards */}
      <div className="relative z-[1] flex items-center justify-center md:justify-end self-center md:self-auto">
        {/* Revenue card — teal, tilted left, overlaps Book Now */}
        <div className="-rotate-[3deg] z-[2] -mr-3.5 transition-transform hover:-translate-y-1 hover:scale-[1.04]">
          <div className="bg-gradient-to-br from-brand-teal to-[#236b5d] border-2 border-white/15 rounded-xl py-2.5 px-5 min-w-[110px] text-center text-white relative shadow-[0_4px_16px_rgba(45,139,122,0.4),0_2px_6px_rgba(0,0,0,0.1)]">
            {/* Dashed inner border */}
            <div className="absolute inset-[5px] border-[1.5px] border-dashed border-white/12 rounded-lg pointer-events-none" />
            {/* Corner £ symbols */}
            <span className="absolute top-1.5 left-1.5 text-[7px] font-black text-white/18">&pound;</span>
            <span className="absolute top-1.5 right-1.5 text-[7px] font-black text-white/18">&pound;</span>
            <span className="absolute bottom-1.5 left-1.5 text-[7px] font-black text-white/18">&pound;</span>
            <span className="absolute bottom-1.5 right-1.5 text-[7px] font-black text-white/18">&pound;</span>
            <div className="text-[8px] font-extrabold uppercase tracking-[1px] text-white/55">
              Today&apos;s Revenue
            </div>
            <div className="text-[22px] font-black leading-tight" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.15)" }}>
              &pound;{revenue}
            </div>
          </div>
        </div>

        {/* Book Now card — coral, tilted right, behind revenue */}
        <div
          className="rotate-[3deg] z-[1] transition-transform hover:-translate-y-1 hover:scale-[1.04] cursor-pointer"
          onClick={onNewBooking}
        >
          <div className="bg-gradient-to-br from-brand-coral to-[#c9405f] border-2 border-white/15 rounded-xl py-2.5 px-5 min-w-[110px] text-center text-white relative shadow-[0_4px_16px_rgba(232,86,127,0.35),0_2px_6px_rgba(0,0,0,0.1)]">
            {/* Dashed inner border */}
            <div className="absolute inset-[5px] border-[1.5px] border-dashed border-white/12 rounded-lg pointer-events-none" />
            <div className="text-[8px] font-extrabold uppercase tracking-[1px] text-white/55">
              Smarter Dog
            </div>
            <div className="text-lg font-black leading-tight" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
              Book Now
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
