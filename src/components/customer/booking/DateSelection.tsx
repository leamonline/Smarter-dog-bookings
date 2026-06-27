import { useEffect, useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { getOpenDays } from "../../../supabase/rpc";
import { listRangeForCapacity, listBlockedSeats } from "../../../supabase/repositories/bookingsRepo";
import { getDefaultOpenForDate } from "../../../engine/utils";
import { findGroupedSlots } from "../../../engine/capacity";
import { DAY_CAPACITY } from "../../../engine/utilisation";
import { SALON_SLOTS } from "../../../constants/index";
import { logger } from "../../../lib/logger";
import type { Booking, WizardDog, SlotOverrides } from "../../../types/index";
import { ArrowRight } from "lucide-react";

interface DateSelectionProps {
  selectedDogs?: WizardDog[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
  onNext: () => void;
  onBack: () => void;
}

type DayState = "closed" | "full" | "open";

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

export function DateSelection({ selectedDogs = [], selectedDate, onSelect, onNext, onBack }: DateSelectionProps) {
  const [daySettings, setDaySettings] = useState<Record<string, { is_open: boolean }>>({});
  // Per-day non-cancelled occupancy, so a full day can be dimmed up front
  // rather than dead-ending the customer at "Confirm". null = not loaded yet
  // / failed to load — in which case we fall back to open/closed only (the
  // slot step and the DB trigger remain the backstop).
  const [occupancyByDate, setOccupancyByDate] = useState<Record<string, Booking[]> | null>(null);
  // Staff-blocked seats per day (day_settings.overrides), so a day that's full
  // only because of blocks is dimmed consistently with the slot step. Defaults
  // to {} (listBlockedSeats degrades gracefully on error).
  const [blockedByDate, setBlockedByDate] = useState<Record<string, Record<string, SlotOverrides>>>({});
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
        // In parallel: which days are open (day_settings is staff-only via
        // RLS, so go through get_open_days → (setting_date, is_open)), and the
        // non-cancelled occupancy per day (get_occupancy_range) so a full day
        // can be dimmed instead of dead-ending the customer at "Confirm".
        const [openRes, occRes, blockedRes] = await Promise.all([
          getOpenDays(supabase, { startDate: rangeStart, endDate: rangeEnd }),
          listRangeForCapacity(supabase, rangeStart, rangeEnd),
          listBlockedSeats(supabase, rangeStart, rangeEnd),
        ]);
        if (cancelled) return;

        setBlockedByDate(blockedRes.byDate);

        if (openRes.error) {
          logger.error("Failed to fetch day closures", openRes.error, {
            tags: { component: "DateSelection", op: "get_open_days" },
          });
          setDaySettings({});
        } else {
          const map: Record<string, { is_open: boolean }> = {};
          (openRes.data || []).forEach((row: { setting_date: string; is_open: boolean }) => {
            map[row.setting_date] = { is_open: row.is_open };
          });
          setDaySettings(map);
        }

        if (occRes.error) {
          // Don't block the whole step on an occupancy blip — degrade to
          // open/closed only. The slot step and the DB trigger still catch a
          // genuinely full day.
          logger.error("Failed to fetch occupancy", occRes.error, {
            tags: { component: "DateSelection", op: "get_occupancy_range" },
          });
          setOccupancyByDate(null);
        } else {
          setOccupancyByDate(occRes.byDate);
        }
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

  const dogsForEngine = selectedDogs.map((d) => ({ id: d.dogId, size: d.size }));

  // A day is "full" when the selected dogs can't be placed at all — same
  // engine the slot step uses, so a day that stays selectable here always has
  // at least one drop-off time. Only judged once occupancy has loaded and we
  // know what's being booked; otherwise the day stays open (backstopped by the
  // slot step + the DB cap).
  const dayStateFor = (date: Date): DayState => {
    if (!isOpen(date)) return "closed";
    if (occupancyByDate && dogsForEngine.length > 0) {
      const dayBookings = occupancyByDate[toDateStr(date)] ?? [];
      const dayOverrides = blockedByDate[toDateStr(date)] || {};
      if (findGroupedSlots(dogsForEngine, dayBookings, SALON_SLOTS, DAY_CAPACITY, dayOverrides).length === 0) {
        return "full";
      }
    }
    return "open";
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
          Closed and fully-booked days are dimmed — pick any available day.
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
              const state = dayStateFor(d);
              const selectable = state === "open";
              const selected = selectedDate === dateStr;
              const longLabel = d.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              });
              const ariaLabel =
                state === "closed"
                  ? `${longLabel}, closed`
                  : state === "full"
                    ? `${longLabel}, fully booked`
                    : longLabel;
              return (
                <button
                  key={dateStr}
                  type="button"
                  className={`wizard-day${state === "full" ? " wizard-day--full" : ""}`}
                  aria-pressed={selected}
                  aria-label={ariaLabel}
                  disabled={!selectable}
                  onClick={() => selectable && onSelect(dateStr)}
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
