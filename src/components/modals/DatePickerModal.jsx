import { useState } from "react";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { toDateStr } from "../../supabase/transforms.js";
import { getDefaultOpenForDate } from "../../engine/utils.js";

export function DatePickerModal({
  currentDate,
  onSelectDate,
  onClose,
  dayOpenState,
}) {
  const [viewYear, setViewYear] = useState(currentDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const monthName = new Date(viewYear, viewMonth).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const isToday = (d) => {
    const t = new Date();
    return d === t.getDate() && viewMonth === t.getMonth() && viewYear === t.getFullYear();
  };

  const isSelected = (d) => {
    return d === currentDate.getDate() && viewMonth === currentDate.getMonth() && viewYear === currentDate.getFullYear();
  };

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="date-picker-title"
      className="bg-white rounded-2xl w-[min(320px,90vw)] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
      zIndex={1200}
    >
        {/* Header */}
        <div className="bg-gradient-to-br from-brand-blue to-brand-blue-dark px-4 py-3.5 flex items-center justify-between">
          <button onClick={prevMonth} className="bg-white/20 border-none rounded-md w-8 h-8 cursor-pointer flex items-center justify-center">
            <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3l-5 5 5 5" />
            </svg>
          </button>
          <div id="date-picker-title" className="text-base font-bold text-white">{monthName}</div>
          <button onClick={nextMonth} className="bg-white/20 border-none rounded-md w-8 h-8 cursor-pointer flex items-center justify-center">
            <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
          <button onClick={onClose} className="bg-white/20 border-none rounded-md w-8 h-8 cursor-pointer flex items-center justify-center text-sm text-white font-bold ml-2">{"\u00D7"}</button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 px-3 pt-2.5 pb-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="text-center text-[11px] font-bold text-slate-500 py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 px-3 pb-3.5 gap-0.5">
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} />;

            const cellDate = new Date(viewYear, viewMonth, d);
            const dateStr = toDateStr(cellDate);
            const isOpen = dayOpenState?.[dateStr] !== undefined
              ? dayOpenState[dateStr]
              : getDefaultOpenForDate(cellDate);
            const disabled = !isOpen;
            const selected = isSelected(d);
            const today = isToday(d);

            let bgCls = "bg-transparent hover:bg-slate-50";
            let textCls = "text-slate-800";
            if (selected) { bgCls = "bg-brand-blue"; textCls = "text-white"; }
            else if (today) { bgCls = "bg-sky-50 hover:bg-sky-100"; textCls = "text-brand-blue"; }
            if (disabled) { textCls = "text-slate-300"; bgCls = "bg-transparent"; }

            return (
              <button
                key={d}
                onClick={() => { if (!disabled) onSelectDate(new Date(viewYear, viewMonth, d)); }}
                disabled={disabled}
                className={`w-full aspect-square border-none rounded-lg text-sm cursor-pointer font-[inherit] transition-all ${bgCls} ${textCls} ${selected ? "font-extrabold" : "font-semibold"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {d}
              </button>
            );
          })}
        </div>

        {/* Today button */}
        <div className="px-3 pb-3.5 text-center">
          <button
            onClick={() => {
              const today = new Date();
              const todayStr = toDateStr(today);
              const isOpen = dayOpenState?.[todayStr] !== undefined
                ? dayOpenState[todayStr]
                : getDefaultOpenForDate(today);
              if (isOpen) onSelectDate(today);
            }}
            className="bg-transparent border-[1.5px] border-brand-blue rounded-lg px-5 py-2 text-[13px] font-semibold text-brand-blue cursor-pointer font-[inherit] hover:bg-sky-50"
          >
            Today
          </button>
        </div>
    </AccessibleModal>
  );
}
