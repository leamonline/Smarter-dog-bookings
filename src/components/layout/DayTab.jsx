// src/components/layout/DayTab.jsx

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DayTab({ dateObj, dogCount, isOpen, isActive, onClick }) {
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

  return (
    <div
      className={[
        "flex-1 min-w-[56px] md:min-w-[72px] rounded-t-[10px] bg-white text-center border-[1.5px] border-b-0 select-none pb-1.5 cursor-pointer transition-all snap-center shrink-0",
        isActive
          ? "border-brand-blue opacity-100 -translate-y-[3px] z-[2] shadow-[0_-4px_14px_rgba(0,184,224,0.12)]"
          : "opacity-70 hover:opacity-90 hover:-translate-y-0.5 z-[1] shadow-[0_-2px_8px_rgba(0,0,0,0.04)] border-slate-200",
      ].join(" ")}
      onClick={onClick}
    >
      {/* Coloured strip */}
      <div className={`py-[3px] text-[8px] font-extrabold text-white uppercase tracking-[0.8px] rounded-t-lg ${stripBg}`}>
        {dayName}
      </div>

      {/* Date number */}
      <div className={`text-lg md:text-2xl font-black leading-none mt-0.5 ${textCls}`}>
        {dateNum}
      </div>

      {/* Month name */}
      <div className={`text-[10px] md:text-[13px] font-extrabold leading-none mt-px ${textCls}`}>
        {monthName}
      </div>

      {/* Dog count */}
      <div className={`text-[9px] font-extrabold mt-[3px] leading-none ${dogCountCls}`}>
        {dogCountText}
      </div>
    </div>
  );
}
