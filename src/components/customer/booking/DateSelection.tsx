import { useEffect, useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { getOpenDays } from "../../../supabase/rpc";
import { getDefaultOpenForDate } from "../../../engine/utils";
import { logger } from "../../../lib/logger";
import { ArrowRight } from "lucide-react";

interface DateSelectionProps {
  selectedDate: string | null;
  onSelect: (date: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthLabelFor(days: Date[]): string {
  if (days.length === 0) return "";
  const first = days[0];
  const last = days[days.length - 1];
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
  if (sameMonth) {
    return first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  const firstLabel = first.toLocaleDateString("en-GB", { month: "short" });
  const lastLabel = last.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  return `${firstLabel} → ${lastLabel}`;
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
        // day_settings is staff-only via RLS, so go through the
        // get_open_days RPC which returns just (setting_date, is_open).
        const { data, error } = await getOpenDays(supabase, {
          startDate: rangeStart,
          endDate: rangeEnd,
        });
        if (cancelled) return;
        if (error) {
          logger.error("Failed to fetch day closures", error, {
            tags: { component: "DateSelection", op: "get_open_days" },
          });
          setDaySettings({});
          return;
        }
        const map: Record<string, { is_open: boolean }> = {};
        (data || []).forEach((row: { setting_date: string; is_open: boolean }) => {
          map[row.setting_date] = { is_open: row.is_open };
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
    <>
      <p className="wizard-helper">
        Pick a date for your visit (next 28 days).
      </p>

      <div className="wizard-calendar">
        <h2 className="wizard-calendar-month">{monthLabelFor(days)}</h2>
        <p className="wizard-calendar-hint">
          Closed days are dimmed — pick any available day.
        </p>

        <div className="wizard-calendar-grid">
          {DAY_HEADERS.map((h) => (
            <div key={h} className="wizard-day-header">{h}</div>
          ))}
        </div>

        {loading ? (
          <div className="wizard-calendar-grid mt-1" aria-busy="true" aria-live="polite">
            {Array.from({ length: 28 }).map((_, i) => (
              <div key={i} className="skeleton-row skeleton-row--sm" />
            ))}
            <span className="sr-only">Loading availability…</span>
          </div>
        ) : (
          <div className="wizard-calendar-grid mt-1">
            {gridCells.map((d, i) => {
              if (!d) return <div key={`empty-${i}`} />;
              const dateStr = toDateStr(d);
              const open = isOpen(d);
              const selected = selectedDate === dateStr;
              return (
                <button
                  key={dateStr}
                  type="button"
                  className="wizard-day"
                  aria-pressed={selected}
                  disabled={!open}
                  onClick={() => open && onSelect(dateStr)}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="wizard-actions">
        <button type="button" className="wizard-btn wizard-btn--back" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="wizard-btn wizard-btn--primary"
          onClick={onNext}
          disabled={!selectedDate}
        >
          Continue
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
