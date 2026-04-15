// src/components/layout/DayTab.jsx

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DayTab({ dateObj, dogCount, isOpen, isActive, onClick, id }) {
  const dayName = DAY_NAMES[dateObj.getDay()];
  const dateNum = dateObj.getDate();
  const monthName = dateObj.toLocaleDateString("en-GB", { month: "long" });

  let dogCountText;
  if (!isOpen) {
    dogCountText = "Closed";
  } else if (dogCount === 1) {
    dogCountText = "1 dog";
  } else {
    dogCountText = `${dogCount} dogs`;
  }

  return (
    <div
      role="tab"
      aria-selected={isActive}
      aria-label={`${dayName} ${dateNum} ${monthName}, ${dogCountText}`}
      tabIndex={isActive ? 0 : -1}
      id={id}
      className={[
        "flex-1 min-w-[56px] md:min-w-[72px] rounded-t-[10px] text-center border-[1.5px] border-b-0 select-none py-2 cursor-pointer transition-all snap-center shrink-0",
        isActive
          ? "bg-gradient-to-b from-brand-blue to-brand-blue-dark border-brand-blue opacity-100 -translate-y-[3px] z-[2] shadow-[0_-4px_16px_rgba(14,165,233,0.25),0_4px_12px_rgba(14,165,233,0.15)]"
          : "bg-white border-slate-200 opacity-80 hover:opacity-100 hover:-translate-y-0.5 z-[1] shadow-[0_-2px_8px_rgba(0,0,0,0.04)]",
      ].join(" ")}
      onClick={onClick}
    >
      {/* Day name */}
      <div className={`text-[10px] font-bold uppercase tracking-wide ${isActive ? "text-white/80" : "text-slate-500"}`}>
        {dayName}
      </div>

      {/* Date number */}
      <div className={`text-lg md:text-2xl font-black leading-none mt-0.5 ${isActive ? "text-white" : "text-slate-800"}`}>
        {dateNum}
      </div>

      {/* Month name */}
      <div className={`text-[10px] md:text-[13px] font-extrabold leading-none mt-px ${isActive ? "text-white/90" : "text-slate-600"}`}>
        {monthName}
      </div>

      {/* Dog count */}
      <div className={`text-[10px] font-extrabold mt-[3px] leading-none ${
        isActive
          ? "text-white/80"
          : !isOpen
            ? "text-slate-400 italic font-semibold"
            : "text-brand-blue"
      }`}>
        {dogCountText}
      </div>
    </div>
  );
}
