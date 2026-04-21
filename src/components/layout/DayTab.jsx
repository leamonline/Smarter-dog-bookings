// src/components/layout/DayTab.jsx

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function busyStyle(count, isOpen) {
  if (!isOpen) return "bg-red-100 text-red-800";
  if (count === 0) return "bg-slate-100 text-slate-500";
  if (count <= 3) return "bg-emerald-500 text-white";
  if (count <= 6) return "bg-amber-500 text-white";
  return "bg-rose-500 text-white";
}

export function DayTab({ dateObj, dogCount, isOpen, isActive, onClick, id }) {
  const dayName = DAY_NAMES[dateObj.getDay()];
  const dateNum = dateObj.getDate();
  const today = new Date();
  const isToday =
    dateObj.getFullYear() === today.getFullYear() &&
    dateObj.getMonth() === today.getMonth() &&
    dateObj.getDate() === today.getDate();

  // Two display modes: light (mobile/tablet, on white CalendarTabs bg) and
  // dark (xl+ inside the purple AppToolbar). Mode selected via Tailwind's xl: prefix.
  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-label={`${dayName} ${dateNum}, ${!isOpen ? "closed" : `${dogCount} dogs`}`}
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
            : !isOpen
              ? "text-red-700 xl:text-red-300"
              : "text-slate-400 xl:text-white/60"
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
            : busyStyle(dogCount, isOpen),
          isToday && !isActive ? "ring-2 ring-brand-yellow ring-offset-1 xl:ring-offset-brand-purple" : "",
        ].join(" ")}
      >
        {dateNum}
      </span>

      {/* Dog count or closed */}
      <span
        className={`text-[9px] font-bold leading-none ${
          isActive
            ? "text-brand-purple xl:text-brand-yellow"
            : "text-slate-500 xl:text-white/60"
        }`}
      >
        {dogCount === 0 ? "—" : `${dogCount}`}
      </span>
    </button>
  );
}
