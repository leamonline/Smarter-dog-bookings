// src/components/layout/DayTab.jsx

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Style the date circle based on three temporal buckets:
//   - past:    blue (the day has happened — "completed")
//   - today:   green (we're here)
//   - future:  colour-coded by how busy the day looks
//
// All three buckets use high-contrast text so the date number is
// readable at a glance, especially on the muted "no bookings / closed"
// surfaces where the previous slate-100/slate-500 combo was too washed
// out to read.
function dateCircleStyle({ isPast, isToday, dogCount, isOpen }) {
  if (isToday) return "bg-emerald-500 text-white";
  if (isPast) return "bg-sky-500 text-white";

  // Future days
  if (!isOpen) return "bg-rose-100 text-rose-700";
  // Bookings still loading — keep the circle neutral so it doesn't
  // assert "empty day" before the data arrives.
  if (dogCount == null) return "bg-slate-100 text-slate-500";
  if (dogCount === 0) return "bg-slate-200 text-slate-700";
  if (dogCount <= 3) return "bg-emerald-500 text-white";
  if (dogCount <= 6) return "bg-amber-500 text-white";
  return "bg-rose-500 text-white";
}

function startOfDay(d) {
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

  // Two display modes: light (mobile/tablet, on white CalendarTabs bg) and
  // dark (xl+ inside the purple AppToolbar). Mode selected via Tailwind's xl: prefix.
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
              : isToday
                ? `today, ${dogCount} dogs`
                : `${dogCount} dogs`
      }`}
      tabIndex={isActive ? 0 : -1}
      id={id}
      onClick={onClick}
      className={[
        "flex flex-col items-center gap-0.5 py-1.5 px-2 sm:px-2.5 rounded-full cursor-pointer transition-all border-none font-[inherit] min-w-[44px] sm:min-w-[50px]",
        isActive
          ? "bg-brand-purple/10 xl:bg-white/15"
          : "bg-transparent hover:bg-slate-50 xl:hover:bg-white/10",
      ].join(" ")}
    >
      {/* Day name */}
      <span
        className={`text-[10px] font-bold uppercase tracking-wide leading-none ${
          isActive
            ? "text-brand-purple xl:text-brand-yellow"
            : isToday
              ? "text-emerald-700 xl:text-emerald-300"
              : isPast
                ? "text-sky-700 xl:text-sky-200"
                : !isOpen
                  ? "text-rose-500 xl:text-rose-200"
                  : "text-slate-500 xl:text-white/70"
        }`}
      >
        {dayName}
      </span>

      {/* Date circle */}
      <span
        className={[
          "relative w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm sm:text-base font-black font-display leading-none transition-all",
          isActive
            ? "bg-brand-yellow text-brand-purple shadow-[0_2px_10px_rgba(254,204,19,0.45)]"
            : dateCircleStyle({ isPast, isToday, dogCount, isOpen }),
          isToday && !isActive ? "ring-2 ring-emerald-300 ring-offset-1 xl:ring-offset-brand-purple" : "",
        ].join(" ")}
      >
        {dateNum}
      </span>

      {/* Dog count or closed */}
      <span
        className={`text-[9px] font-bold leading-none ${
          isActive
            ? "text-brand-purple xl:text-brand-yellow"
            : isToday
              ? "text-emerald-700 xl:text-emerald-300"
              : isPast
                ? "text-sky-700 xl:text-sky-200"
                : "text-slate-600 xl:text-white/70"
        }`}
        aria-hidden={isLoading || undefined}
      >
        {isLoading ? "·" : dogCount === 0 ? "—" : `${dogCount}`}
      </span>
    </button>
  );
}
