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

  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-label={`${dayName} ${dateNum}, ${!isOpen ? "closed" : `${dogCount} dogs`}`}
      tabIndex={isActive ? 0 : -1}
      id={id}
      onClick={onClick}
      className={[
        "flex flex-col items-center gap-0.5 py-1.5 px-1 sm:px-1.5 rounded-xl cursor-pointer transition-all border-none font-[inherit] min-w-[40px] sm:min-w-[46px]",
        isActive
          ? "bg-brand-cyan/10"
          : "bg-transparent hover:bg-slate-50",
      ].join(" ")}
    >
      {/* Day name */}
      <span className={`text-[10px] font-bold uppercase tracking-wide leading-none ${isActive ? "text-brand-cyan" : !isOpen ? "text-red-800" : "text-slate-400"}`}>
        {dayName}
      </span>

      {/* Date circle */}
      <span
        className={[
          "w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm sm:text-base font-black font-display leading-none transition-all",
          isActive
            ? "bg-brand-cyan text-white shadow-[0_2px_10px_rgba(0,122,171,0.35)]"
            : busyStyle(dogCount, isOpen),
        ].join(" ")}
      >
        {dateNum}
      </span>

      {/* Dog count or closed */}
      <span className={`text-[9px] font-bold leading-none ${isActive ? "text-brand-cyan" : "text-slate-500"}`}>
        {dogCount === 0 ? "—" : `${dogCount}`}
      </span>
    </button>
  );
}
