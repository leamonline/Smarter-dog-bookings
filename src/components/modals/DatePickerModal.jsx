import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ModalShell, HeaderIconButton } from "./shell/index.js";
import { toDateStr } from "../../supabase/transforms";
import { isDateOpen } from "../../engine/utils";

export function DatePickerModal({
  currentDate,
  onSelectDate,
  onClose,
  dayOpenState,
  allowClosedDates = false,
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

  const canSelect = (dateStr) => allowClosedDates || isDateOpen(dateStr, dayOpenState);

  // Always render 6 rows (42 cells) so the header never shifts position
  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length < 42) cells.push(null);

  return (
    <ModalShell
      onClose={onClose}
      titleId="date-picker-title"
      accent="var(--color-brand-cyan)"
      widthClass="w-[min(340px,90vw)]"
      maxHeightClass="max-h-[90vh]"
      zIndex={1200}
      header={
        <header className="flex items-center gap-1.5 px-3 pt-4 pb-3 bg-[var(--color-brand-paper)]">
          <HeaderIconButton label="Previous month" onClick={prevMonth}>
            <ChevronLeft size={18} strokeWidth={2.5} aria-hidden="true" />
          </HeaderIconButton>
          <h2
            id="date-picker-title"
            className="flex-1 text-center text-base font-bold font-display text-brand-purple"
          >
            {monthName}
          </h2>
          <HeaderIconButton label="Next month" onClick={nextMonth}>
            <ChevronRight size={18} strokeWidth={2.5} aria-hidden="true" />
          </HeaderIconButton>
          <HeaderIconButton label="Close date picker" onClick={onClose}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
      footer={
        <div className="border-t border-slate-100 bg-white px-3 py-3 flex justify-center">
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              const todayStr = toDateStr(today);
              if (canSelect(todayStr)) onSelectDate(today);
            }}
            className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-full border-[1.5px] border-slate-200 bg-white text-sm font-bold text-brand-purple cursor-pointer font-[inherit] hover:bg-slate-50 transition-colors"
          >
            Today
          </button>
        </div>
      }
    >
        {/* Day headers */}
        <div className="grid grid-cols-7 px-3 pt-2.5 pb-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="text-center text-[11px] font-bold text-slate-500 py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 px-3 pb-3.5 gap-0.5">
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} className="aspect-square" />;

            const cellDate = new Date(viewYear, viewMonth, d);
            const dateStr = toDateStr(cellDate);
            const isOpen = isDateOpen(dateStr, dayOpenState);
            const disabled = !allowClosedDates && !isOpen;
            const selected = isSelected(d);
            const today = isToday(d);

            let bgCls = "bg-transparent hover:bg-slate-50";
            let textCls = "text-slate-800";
            if (selected) { bgCls = "bg-brand-cyan"; textCls = "text-white"; }
            else if (today) { bgCls = "bg-sky-50 hover:bg-sky-100"; textCls = "text-brand-cyan"; }
            if (disabled) { textCls = "text-slate-300"; bgCls = "bg-transparent"; }

            const cellLabel = cellDate.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }) + (!isOpen ? ", salon closed" : "");

            return (
              <button
                key={d}
                type="button"
                onClick={() => { if (!disabled) onSelectDate(cellDate); }}
                disabled={disabled}
                aria-label={cellLabel}
                aria-current={today ? "date" : undefined}
                aria-pressed={selected || undefined}
                className={`w-full aspect-square border-none rounded-lg text-sm cursor-pointer font-[inherit] transition-all ${bgCls} ${textCls} ${selected ? "font-extrabold" : "font-semibold"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {d}
              </button>
            );
          })}
        </div>
    </ModalShell>
  );
}
