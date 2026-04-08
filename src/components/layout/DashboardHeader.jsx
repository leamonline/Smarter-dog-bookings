import { useMemo } from "react";
import { PRICING } from "../../constants/index.js";

function computeRevenue(bookings) {
  let total = 0;
  for (const b of bookings) {
    const priceStr = PRICING[b.service]?.[b.size] || "";
    const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) total += num;
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

export function DashboardHeader({ currentDateObj, bookings, onNewBooking }) {
  const revenue = useMemo(() => computeRevenue(bookings || []), [bookings]);
  const bookingCount = (bookings || []).length;
  const { weekday, day, month, year } = formatFullDate(currentDateObj);

  return (
    <div className="bg-gradient-to-br from-brand-blue to-brand-blue-dark py-6 px-5 md:px-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-b-[14px] relative overflow-hidden">
      {/* Paw watermark */}
      <div className="absolute right-10 -top-3.5 text-[100px] opacity-[0.04] -rotate-[15deg] pointer-events-none select-none">
        {"\uD83D\uDC3E"}
      </div>

      {/* Left: Full date */}
      <div className="relative z-[1]">
        <div className="text-2xl md:text-[28px] font-black text-white leading-tight">
          {weekday} {day} {month}
        </div>
        <div className="text-sm font-semibold text-white/70 mt-1">
          {year} · {bookingCount} {bookingCount === 1 ? "dog" : "dogs"} booked
        </div>
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
