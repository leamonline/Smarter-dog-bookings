import { useEffect, useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { getDefaultOpenForDate } from "../../../engine/utils.js";

interface DateSelectionProps {
  selectedDate: string | null;
  onSelect: (date: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const DAY_HEADERS = ["M", "T", "W", "T", "F", "S", "S"];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DateSelection({ selectedDate, onSelect, onNext, onBack }: DateSelectionProps) {
  const [daySettings, setDaySettings] = useState<Record<string, { is_open: boolean }>>({});
  const [loading, setLoading] = useState(true);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const days: Date[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(tomorrow);
    d.setDate(tomorrow.getDate() + i);
    days.push(d);
  }

  const rangeStart = toDateStr(days[0]);
  const rangeEnd = toDateStr(days[days.length - 1]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (!supabase) return;
        const { data } = await supabase
          .from("day_settings")
          .select("date, is_open")
          .gte("date", rangeStart)
          .lte("date", rangeEnd);
        if (cancelled) return;
        const map: Record<string, { is_open: boolean }> = {};
        (data || []).forEach((row: { date: string; is_open: boolean }) => {
          map[row.date] = { is_open: row.is_open };
        });
        setDaySettings(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rangeStart, rangeEnd]);

  const isOpen = (date: Date): boolean => {
    const str = toDateStr(date);
    if (daySettings[str] !== undefined) return daySettings[str].is_open;
    return getDefaultOpenForDate(date);
  };

  const firstDay = days[0];
  const jsDay = firstDay.getDay();
  const offset = jsDay === 0 ? 6 : jsDay - 1;

  const gridCells: (Date | null)[] = [
    ...Array(offset).fill(null),
    ...days,
  ];

  while (gridCells.length % 7 !== 0) gridCells.push(null);

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-slate-500 text-sm">
        Pick a date for your visit (next 28 days).
      </p>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_HEADERS.map((h, i) => (
          <div key={i} className="text-xs font-semibold text-slate-500 py-1">
            {h}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <p className="text-slate-500 text-sm">Loading availability\u2026</p>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {gridCells.map((d, i) => {
            if (!d) {
              return <div key={`empty-${i}`} />;
            }
            const dateStr = toDateStr(d);
            const open = isOpen(d);
            const selected = selectedDate === dateStr;

            return (
              <button
                key={dateStr}
                disabled={!open}
                onClick={() => open && onSelect(dateStr)}
                className={`py-2 px-1 rounded-md text-[13px] text-center ${
                  selected
                    ? "border-2 border-brand-teal bg-emerald-50 font-bold"
                    : open
                      ? "border border-slate-200 bg-white font-normal"
                      : "border border-transparent bg-slate-50 font-normal"
                } ${
                  open ? "text-slate-800 cursor-pointer" : "text-slate-200 cursor-default"
                }`}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2.5 mt-2">
        <button
          onClick={onBack}
          className="py-[11px] px-5 rounded-lg border border-slate-200 bg-white text-slate-500 font-semibold text-sm cursor-pointer"
        >
          {"\u2190"} Back
        </button>
        <button
          onClick={onNext}
          disabled={!selectedDate}
          className={`flex-1 py-[11px] px-5 rounded-lg border-none font-bold text-[15px] ${
            selectedDate
              ? "bg-brand-teal text-white cursor-pointer"
              : "bg-slate-200 text-slate-500 cursor-not-allowed"
          }`}
        >
          Next {"\u2192"}
        </button>
      </div>
    </div>
  );
}
