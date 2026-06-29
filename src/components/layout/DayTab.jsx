// src/components/layout/DayTab.jsx

import { DAY_CAPACITY } from "../../engine/utilisation";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Status-first colour scheme for the date circle. The colour answers
// one question — "can I book this day?" — rather than encoding busyness
// on a gradient:
//   - closed       → muted grey (not bookable; calm, not alarming)
//   - open + space → green   (lighter when wide open, solid as it fills)
//   - open + full  → blue    (at/over DAY_CAPACITY)
//   - past         → muted grey (history; not a planning surface)
//   - loading      → neutral until the bookings arrive
// "Today" keeps whichever status colour applies and is marked with a
// yellow ring (see below) so it still stands out.
export function dayCircleStyle({ isPast, dogCount, isOpen }) {
  if (isPast) return "bg-slate-200 text-slate-500";
  if (dogCount == null) return "bg-slate-100 text-slate-500";
  if (!isOpen) return "bg-slate-100 text-slate-400";
  if (dogCount >= DAY_CAPACITY) return "bg-sky-500 text-white";
  if (dogCount === 0) return "bg-emerald-100 text-emerald-800";
  return "bg-emerald-500 text-white";
}

export function startOfDay(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function DayTab({ dateObj, dogCount, isOpen, isActive, onClick, id }) {
  const dayName = DAY_NAMES[dateObj.getDay()];
  const dateNum = dateObj.getDate();

  const today = startOfDay(new Date());
  const thisDay = startOfDay(dateObj);
  const isToday = thisDay.getTime() === today.getTime();
  const isPast = thisDay.getTime() < today.getTime();
  const isLoading = dogCount == null;

  // DayTab always renders on a white card — CalendarTabs (the week pills at
  // the top of the page on tablet/mobile) and WeekOverviewCard (the desktop
  // left sidebar). So it uses one light colour scheme at every breakpoint; the
  // bookability status lives on the date circle below.
  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-busy={isLoading || undefined}
      aria-label={`${dayName} ${dateNum}, ${
        !isOpen
          ? "closed"
          : isLoading
            ? "loading"
            : isPast
              ? `completed, ${dogCount} dogs`
              : `${isToday ? "today, " : ""}${dogCount >= DAY_CAPACITY ? "full" : "open"}, ${dogCount} dogs`
      }`}
      tabIndex={isActive ? 0 : -1}
      id={id}
      onClick={onClick}
      className={[
        "flex flex-col items-center gap-1 py-2 px-2 sm:px-2.5 rounded-2xl cursor-pointer transition-all border-none font-[inherit] min-w-[44px] sm:min-w-[52px]",
        isActive
          ? "bg-brand-purple/10"
          : !isOpen
            ? "bg-transparent opacity-60 hover:bg-slate-50 hover:opacity-100"
            : "bg-transparent hover:bg-slate-50",
      ].join(" ")}
    >
      {/* Day name — neutral label; the circle carries the status colour. */}
      <span
        className={`text-[10px] font-bold uppercase tracking-wide leading-none ${
          isActive
            ? "text-brand-purple"
            : "text-slate-500"
        }`}
      >
        {dayName}
      </span>

      {/* Date circle — colour = bookability status (closed/open/full). */}
      <span
        className={[
          "relative w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm sm:text-base font-black font-display leading-none transition-all",
          isActive
            ? "bg-brand-yellow text-brand-purple shadow-[0_2px_10px_rgba(254,204,19,0.45)]"
            : dayCircleStyle({ isPast, dogCount, isOpen }),
          isToday && !isActive ? "ring-2 ring-brand-yellow ring-offset-1" : "",
        ].join(" ")}
      >
        {dateNum}
      </span>

      {/* Dog count or closed — neutral label. */}
      <span
        className={`text-[9px] font-bold leading-none ${
          isActive
            ? "text-brand-purple"
            : "text-slate-600"
        }`}
        aria-hidden={isLoading || undefined}
      >
        {isLoading ? "·" : dogCount === 0 ? "—" : `${dogCount}`}
      </span>
    </button>
  );
}
