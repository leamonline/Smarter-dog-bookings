import { useEffect, useRef, useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { getOpenDays } from "../../../supabase/rpc";
import { listRangeForCapacity, listBlockedSeats, listImmediateSlots } from "../../../supabase/repositories/bookingsRepo";
import { getDefaultOpenForDate } from "../../../engine/utils";
import { findGroupedSlots } from "../../../engine/capacity";
import { allocationIsImmediate } from "../../../engine/immediateBooking";
import { buildSlotGrid } from "../../../engine/slotGrid";
import { DAY_CAPACITY } from "../../../engine/utilisation";
import { SALON_SLOTS } from "../../../constants/index";
import { logger } from "../../../lib/logger";
import type { Booking, WizardDog, SlotOverrides } from "../../../types/index";
import { ArrowLeft, ArrowRight, Zap } from "lucide-react";
import { WizardTick } from "./WizardTick";

interface DateSelectionProps {
  bookingHorizonDays?: number;
  selectedDogs?: WizardDog[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
  onNext: () => void;
  onBack: () => void;
}

interface PageAvailability {
  daySettings: Record<string, { is_open: boolean }>;
  occupancyByDate: Record<string, Booking[]> | null;
  blockedByDate: Record<string, Record<string, SlotOverrides>>;
}

type DayState = "closed" | "full" | "open";

const PAGE_SIZE = 28;
const EMPTY_PAGE: PageAvailability = {
  daySettings: {},
  occupancyByDate: null,
  blockedByDate: {},
};
const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
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

export function DateSelection({
  bookingHorizonDays = PAGE_SIZE,
  selectedDogs = [],
  selectedDate,
  onSelect,
  onNext,
  onBack,
}: DateSelectionProps) {
  const [today] = useState(startOfToday);
  const pageCount = Math.max(1, Math.ceil(bookingHorizonDays / PAGE_SIZE));
  const [page, setPage] = useState(0);
  const currentPage = Math.min(page, pageCount - 1);
  const [pageAvailability, setPageAvailability] = useState<PageAvailability>(EMPTY_PAGE);
  const [immediate, setImmediate] = useState<{ date: string | null; slots: string[] }>({ date: null, slots: [] });
  const [loading, setLoading] = useState(true);
  const pageCache = useRef(new Map<string, PageAvailability>());

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const firstOffset = currentPage * PAGE_SIZE + 1;
  const lastOffset = Math.min(bookingHorizonDays, firstOffset + PAGE_SIZE - 1);
  const days: Date[] = [];
  for (let offset = firstOffset; offset <= lastOffset; offset += 1) {
    const day = new Date(today);
    day.setDate(today.getDate() + offset);
    days.push(day);
  }

  // The first page includes today only for the immediate-slot engine. Every
  // later request starts on its first customer-facing date.
  const rangeStart = toDateStr(currentPage === 0 ? today : days[0]);
  const rangeEnd = toDateStr(days[days.length - 1]);
  const rangeKey = `${rangeStart}:${rangeEnd}`;

  // Today is independent of whichever calendar page is visible. Fetch it
  // once per mounted date step so paging cannot multiply RPC traffic.
  useEffect(() => {
    let cancelled = false;
    if (!supabase) return;
    void listImmediateSlots(supabase).then((result) => {
      if (!cancelled) setImmediate(result);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = pageCache.current.get(rangeKey);
    if (cached) {
      setPageAvailability(cached);
      setLoading(false);
      return () => { cancelled = true; };
    }

    void (async () => {
      setLoading(true);
      if (!supabase) {
        if (!cancelled) {
          setPageAvailability(EMPTY_PAGE);
          setLoading(false);
        }
        return;
      }

      try {
        const [openRes, occRes, blockedRes] = await Promise.all([
          getOpenDays(supabase, { startDate: rangeStart, endDate: rangeEnd }),
          listRangeForCapacity(supabase, rangeStart, rangeEnd),
          listBlockedSeats(supabase, rangeStart, rangeEnd),
        ]);
        if (cancelled) return;

        let daySettings: Record<string, { is_open: boolean }> = {};
        if (openRes.error) {
          logger.error("Failed to fetch day closures", openRes.error, {
            tags: { component: "DateSelection", op: "get_open_days" },
          });
        } else {
          (openRes.data || []).forEach((row: { setting_date: string; is_open: boolean }) => {
            daySettings[row.setting_date] = { is_open: row.is_open };
          });
        }

        let occupancyByDate: Record<string, Booking[]> | null = null;
        if (occRes.error) {
          // Preserve the existing open/closed-only fallback if this optional
          // preflight fails; the slot step and database remain authoritative.
          logger.error("Failed to fetch occupancy", occRes.error, {
            tags: { component: "DateSelection", op: "get_occupancy_range" },
          });
        } else {
          occupancyByDate = occRes.byDate;
        }

        const nextPage = {
          daySettings,
          occupancyByDate,
          blockedByDate: blockedRes.byDate,
        };
        // A degraded page remains usable, but it is not a completed cache
        // entry: returning to it must retry either required availability read.
        if (!openRes.error && !occRes.error) {
          pageCache.current.set(rangeKey, nextPage);
        }
        setPageAvailability(nextPage);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [rangeEnd, rangeKey, rangeStart]);

  const isOpen = (date: Date): boolean => {
    const dateStr = toDateStr(date);
    if (pageAvailability.daySettings[dateStr] !== undefined) {
      return pageAvailability.daySettings[dateStr].is_open;
    }
    return getDefaultOpenForDate(date);
  };

  const dogsForEngine = selectedDogs.map((dog) => ({ id: dog.dogId, size: dog.size }));
  const dayStateFor = (date: Date): DayState => {
    if (!isOpen(date)) return "closed";
    if (pageAvailability.occupancyByDate && dogsForEngine.length > 0) {
      const dayBookings = pageAvailability.occupancyByDate[toDateStr(date)] ?? [];
      const dayOverrides = pageAvailability.blockedByDate[toDateStr(date)] || {};
      if (findGroupedSlots(dogsForEngine, dayBookings, SALON_SLOTS, DAY_CAPACITY, dayOverrides).length === 0) {
        return "full";
      }
    }
    return "open";
  };

  const todayAvailable = (() => {
    if (currentPage !== 0 || !immediate.date || immediate.slots.length === 0) return false;
    if (pageAvailability.occupancyByDate && dogsForEngine.length > 0) {
      const dayBookings = pageAvailability.occupancyByDate[immediate.date] ?? [];
      const dayOverrides = pageAvailability.blockedByDate[immediate.date] || {};
      const flagged = new Set(immediate.slots);
      return findGroupedSlots(dogsForEngine, dayBookings, buildSlotGrid(immediate.slots), DAY_CAPACITY, dayOverrides)
        .some((allocation) => allocationIsImmediate(allocation, flagged));
    }
    return true;
  })();

  const firstDay = days[0];
  const jsDay = firstDay.getDay();
  const offset = jsDay === 0 ? 6 : jsDay - 1;
  const gridCells: (Date | null)[] = [...Array(offset).fill(null), ...days];
  while (gridCells.length % 7 !== 0) gridCells.push(null);

  return (
    <>
      <p className="wizard-helper">
        Pick a date for your visit.
      </p>

      {!loading && todayAvailable && immediate.date && (
        <button
          type="button"
          aria-pressed={selectedDate === immediate.date}
          onClick={() => onSelect(immediate.date as string)}
          className="wizard-option"
        >
          <span className="inline-flex flex-col items-start gap-0.5 min-w-0">
            <span className="inline-flex items-center gap-2">
              <Zap size={16} aria-hidden="true" className="text-[var(--sd-cyan-dark)]" />
              <span className="font-['Quicksand',sans-serif] text-[15px] font-bold">Today — last minute</span>
            </span>
            <span className="text-[12px] text-[var(--sd-ink-light)]">A time has come free today — book up to 30 minutes before</span>
          </span>
          <WizardTick selected={selectedDate === immediate.date} />
        </button>
      )}

      <div className="wizard-calendar">
        <h2 className="wizard-calendar-month">{monthLabelFor(days)}</h2>
        <p className="wizard-calendar-range" aria-live="polite">Days {firstOffset}–{lastOffset} of {bookingHorizonDays}</p>
        <p className="wizard-calendar-hint">Closed and fully-booked days are dimmed — pick any available day.</p>

        <div className="wizard-calendar-grid">
          {DAY_HEADERS.map((header) => <div key={header} className="wizard-day-header">{header}</div>)}
        </div>

        {loading ? (
          <div className="wizard-calendar-grid mt-1" aria-busy="true" aria-live="polite">
            {Array.from({ length: days.length }).map((_, index) => <div key={index} className="skeleton-row skeleton-row--sm" />)}
            <span className="sr-only">Loading availability…</span>
          </div>
        ) : (
          <div className="wizard-calendar-grid mt-1">
            {gridCells.map((date, index) => {
              if (!date) return <div key={`empty-${index}`} />;
              const dateStr = toDateStr(date);
              const state = dayStateFor(date);
              const selectable = state === "open";
              const selected = selectedDate === dateStr;
              const longLabel = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
              const ariaLabel = state === "closed" ? `${longLabel}, closed` : state === "full" ? `${longLabel}, fully booked` : longLabel;
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
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        )}

        <div className="wizard-calendar-pages" aria-label="Date pages">
          <button type="button" className="wizard-btn wizard-btn--back" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={currentPage === 0} aria-label="Previous dates">
            <ArrowLeft size={16} aria-hidden="true" /> Previous
          </button>
          <button type="button" className="wizard-btn wizard-btn--back" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={currentPage === pageCount - 1} aria-label="Next dates">
            Next <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="wizard-actions">
        <button type="button" className="wizard-btn wizard-btn--back" onClick={onBack}>Back</button>
        <button type="button" className="wizard-btn wizard-btn--primary" onClick={onNext} disabled={!selectedDate}>
          Continue <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
