// src/components/layout/DayTab.jsx

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DayTab({ dateObj, dogCount, isOpen, isActive, onClick, id }) {
  const dayName = DAY_NAMES[dateObj.getDay()];
  const dateNum = dateObj.getDate();
  const monthName = dateObj.toLocaleDateString("en-GB", { month: "long" });

  const stripBg = isOpen ? "bg-brand-green" : "bg-brand-red";
  const textCls = isOpen ? "text-slate-800" : "text-slate-400";

  let dogCountCls;
  if (!isOpen) {
    dogCountCls = "text-brand-red";
  } else if (isActive) {
    dogCountCls = "text-brand-blue-dark";
  } else {
    dogCountCls = "text-brand-blue";
  }

  let dogCountText;
  if (!isOpen) {
    dogCountText = "Closed";
  } else if (dogCount === 1) {
    dogCountText = "1 dog";
  } else {
    dogCountText = `${dogCount} dogs`;
  }

  const activeStripBg = isActive ? "bg-white/20" : stripBg;
  const activeTextCls = isActive ? "text-white" : textCls;
  const activeMonthCls = isActive ? "text-white/90" : textCls;
  const activeDogCls = isActive ? "text-white/80" : dogCountCls;

  const activeGradient = isOpen
    ? "bg-gradient-to-b from-brand-blue to-brand-blue-dark border-brand-blue shadow-[0_-4px_16px_rgba(14,165,233,0.25),0_4px_12px_rgba(14,165,233,0.15)]"
    : "bg-gradient-to-b from-brand-red to-[#B91C1C] border-brand-red shadow-[0_-4px_16px_rgba(220,38,38,0.25),0_4px_12px_rgba(220,38,38,0.15)]";

  return (
    <div
      role="tab"
      aria-selected={isActive}
      aria-label={`${dayName} ${dateNum} ${monthName}, ${dogCountText}`}
      tabIndex={isActive ? 0 : -1}
      id={id}
      className={[
        "flex-1 min-w-[56px] md:min-w-[72px] rounded-t-[10px] text-center border-[1.5px] border-b-0 select-none pb-1.5 cursor-pointer transition-all snap-center shrink-0",
        isActive
          ? `${activeGradient} opacity-100 -translate-y-[3px] z-[2]`
          : "bg-white opacity-70 hover:opacity-90 hover:-translate-y-0.5 z-[1] shadow-[0_-2px_8px_rgba(0,0,0,0.04)] border-slate-200",
      ].join(" ")}
      onClick={onClick}
    >
      {/* Coloured strip */}
      <div className={`py-[3px] text-[8px] font-extrabold text-white uppercase tracking-[0.8px] rounded-t-lg ${activeStripBg}`}>
        {dayName}
      </div>

      {/* Date number */}
      <div className={`text-lg md:text-2xl font-black leading-none mt-0.5 ${activeTextCls}`}>
        {dateNum}
      </div>

      {/* Month name */}
      <div className={`text-[10px] md:text-[13px] font-extrabold leading-none mt-px ${activeMonthCls}`}>
        {monthName}
      </div>

      {/* Dog count */}
      <div className={`text-[10px] font-extrabold mt-[3px] leading-none ${activeDogCls}`}>
        {dogCountText}
      </div>
    </div>
  );
}
