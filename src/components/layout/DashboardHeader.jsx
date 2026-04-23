// ============================================================
// DashboardHeader.jsx
//
// Compact flat-blue day header. Replaces the previous cyan
// gradient hero + watermark — the sidebar is now doing more of
// the "dashboard at a glance" work (WhatsApp + waitlist cards),
// so the header can stop trying to be the star of the page and
// just tell you what day you're looking at.
//
// Kept: month-nav arrows, HandDrawnUnderline on the weekday
// (brand voice), stats pills, grid/list toggle, mobile calendar
// picker. Dropped: DogSilhouette watermark, gradient background.
// ============================================================

import { useMemo } from "react";
import { PRICING } from "../../constants/index.js";
import { HandDrawnUnderline } from "../decor/index.jsx";

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
  const weekdayShort = dateObj.toLocaleDateString("en-GB", { weekday: "short" });
  const day = ordinal(dateObj.getDate());
  const dayShort = String(dateObj.getDate());
  const month = dateObj.toLocaleDateString("en-GB", { month: "long" });
  const monthShort = dateObj.toLocaleDateString("en-GB", { month: "short" });
  return { weekday, weekdayShort, day, dayShort, month, monthShort, year: dateObj.getFullYear() };
}

export function DashboardHeader({ currentDateObj, bookings, dogs, onOpenCalendar, onNavigateMonth, viewMode, setViewMode }) {
  const revenue = useMemo(() => computeRevenue(bookings || [], dogs), [bookings, dogs]);
  const bookingCount = (bookings || []).length;
  const { weekday, weekdayShort, day, dayShort, month, monthShort } = formatFullDate(currentDateObj);

  return (
    <div className="bg-brand-cyan-dark py-2 px-4 md:py-2.5 md:px-5 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 rounded-xl relative shadow-sm">
      {/* Date + month-navigation arrows. Compact inline layout.
          Short format on narrow mobile; full format from sm+. */}
      <div className="relative z-[1] min-w-0 basis-full sm:basis-auto flex items-center gap-2">
        {onNavigateMonth && (
          <button
            type="button"
            onClick={() => onNavigateMonth(-1)}
            aria-label="Previous month"
            title="Previous month"
            className="w-7 h-7 rounded-md flex items-center justify-center border-none cursor-pointer transition-all shrink-0 bg-white/15 text-white hover:bg-white/25"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <div className="text-base md:text-lg font-bold text-white leading-tight font-display flex-1 sm:flex-initial text-center sm:text-left min-w-0">
          <span className="relative inline-block">
            <span className="sm:hidden">{weekdayShort}</span>
            <span className="hidden sm:inline">{weekday}</span>
            <HandDrawnUnderline
              color="var(--color-brand-yellow)"
              className="absolute left-0 right-0 -bottom-1"
            />
          </span>{" "}
          <span className="sm:hidden">{dayShort} {monthShort}</span>
          <span className="hidden sm:inline">{day} {month}</span>
        </div>
        {onNavigateMonth && (
          <button
            type="button"
            onClick={() => onNavigateMonth(1)}
            aria-label="Next month"
            title="Next month"
            className="w-7 h-7 rounded-md flex items-center justify-center border-none cursor-pointer transition-all shrink-0 bg-white/15 text-white hover:bg-white/25"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      {/* Stats pills — desktop. Mustard chip on dog count for emphasis. */}
      <div className="relative z-[1] hidden md:flex items-center gap-2 text-xs font-bold shrink-0">
        <span className="bg-brand-yellow text-brand-purple rounded-full px-3 py-1 shadow-[0_2px_6px_rgba(254,204,19,0.3)]">
          {bookingCount} {bookingCount === 1 ? "dog" : "dogs"}
        </span>
        <span className="bg-white/15 text-white rounded-full px-2.5 py-1">
          £{revenue}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Mobile stats */}
      <div className="relative z-[1] xl:hidden text-right shrink-0">
        <div className="text-xs font-bold text-white/85">
          <span className="text-brand-yellow">{bookingCount}</span> dogs · £{revenue}
        </div>
      </div>

      {/* Grid/list toggle */}
      {setViewMode && (
        <div className="relative z-[1] flex bg-white/15 rounded-lg p-0.5 shrink-0">
          <button
            onClick={() => setViewMode("grid")}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-all cursor-pointer border-none ${
              viewMode === "grid" ? "bg-brand-yellow text-brand-purple shadow-sm" : "bg-transparent text-white/70 hover:text-white"
            }`}
            aria-label="Grid view"
            title="Grid view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-all cursor-pointer border-none ${
              viewMode === "list" ? "bg-brand-yellow text-brand-purple shadow-sm" : "bg-transparent text-white/70 hover:text-white"
            }`}
            aria-label="List view"
            title="List view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Mobile calendar picker (xl+ uses sidebar calendar) */}
      {onOpenCalendar && (
        <button
          onClick={onOpenCalendar}
          className="relative z-[1] xl:hidden w-8 h-8 rounded-md flex items-center justify-center border-none cursor-pointer transition-all shrink-0 bg-white/15 text-white hover:bg-white/25"
          aria-label="Open calendar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
