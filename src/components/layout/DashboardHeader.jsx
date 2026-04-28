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

export function DashboardHeader({ currentDateObj, bookings, dogs, onOpenCalendar, onNavigateDay, viewMode, setViewMode, onOpenWaitlist, waitlistCount = 0, onOpenTodos, todoCount = 0 }) {
  const revenue = useMemo(() => computeRevenue(bookings || [], dogs), [bookings, dogs]);
  const bookingCount = (bookings || []).length;
  const { weekday, weekdayShort, day, dayShort, month, monthShort } = formatFullDate(currentDateObj);

  return (
    <div className="bg-brand-cyan-dark py-2 px-4 md:py-2.5 md:px-5 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 rounded-xl relative shadow-sm">
      {/* Date + month-navigation arrows. Compact inline layout.
          Short format on narrow mobile; full format from sm+. */}
      <div className="relative z-[1] min-w-0 basis-full sm:basis-auto flex items-center gap-2">
        {onNavigateDay && (
          <button
            type="button"
            onClick={() => onNavigateDay(-1)}
            aria-label="Previous day"
            title="Previous day"
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
        {onNavigateDay && (
          <button
            type="button"
            onClick={() => onNavigateDay(1)}
            aria-label="Next day"
            title="Next day"
            className="w-7 h-7 rounded-md flex items-center justify-center border-none cursor-pointer transition-all shrink-0 bg-white/15 text-white hover:bg-white/25"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      {/* Stats pills — show on every breakpoint so phones still see
          dog count + revenue without needing the sidebar. Mustard chip
          on dog count for emphasis. */}
      <div className="relative z-[1] flex items-center gap-2 text-[11px] font-bold shrink-0">
        <span className="bg-brand-yellow text-brand-purple rounded-md px-2 py-1 border border-brand-yellow/60 shadow-[0_2px_6px_rgba(254,204,19,0.3)]">
          {bookingCount} {bookingCount === 1 ? "dog" : "dogs"}
        </span>
        <span className="bg-white/15 text-white rounded-md px-2 py-1 border border-white/30">
          £{revenue}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Waitlist + To-do buttons — both open modals, both show a
          numbered badge when there's anything on the list. Sit
          before the view-toggle so they're adjacent to the date
          stats rather than buried among icon controls. */}
      {onOpenWaitlist && (
        <button
          type="button"
          onClick={onOpenWaitlist}
          aria-label={`Open waitlist (${waitlistCount} waiting)`}
          className="relative z-[1] flex items-center gap-1.5 text-[11px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-md px-2 py-1 border border-emerald-600 cursor-pointer transition-colors shrink-0"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Waitlist
          {waitlistCount > 0 && (
            <span className="ml-0.5 bg-white text-emerald-700 rounded px-1 text-[10px] font-black tabular-nums">
              {waitlistCount}
            </span>
          )}
        </button>
      )}

      {onOpenTodos && (
        <button
          type="button"
          onClick={onOpenTodos}
          aria-label={`Open to-do list (${todoCount} ${todoCount === 1 ? "task" : "tasks"})`}
          className="relative z-[1] flex items-center gap-1.5 text-[11px] font-bold text-brand-purple bg-brand-yellow hover:brightness-95 rounded-md px-2 py-1 border border-amber-500 cursor-pointer transition-all shrink-0"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          To-do
          {todoCount > 0 && (
            <span className="ml-0.5 bg-brand-purple text-brand-yellow rounded px-1 text-[10px] font-black tabular-nums">
              {todoCount}
            </span>
          )}
        </button>
      )}

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
