import { useEffect, useRef, useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient";
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
import { ArrowRight, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { WizardTick } from "./WizardTick";

interface DateSelectionProps {
  bookingHorizonDays?: number;
  selectedDogs?: WizardDog[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
  onNext: () => void;
  onBack: () => void;
  page?: number;
  onPageChange?: (page: number) => void;
  pageCache?: Map<string, DatePageAvailability>;
  /**
   * Reports how many days on the current page the customer can actually
   * pick. The wizard uses it to record a funnel blocker when the first page
   * offers nothing — it never changes what this component renders.
   */
  onAvailabilitySummary?: (summary: {
    pageIndex: number;
    openDayCount: number;
    complete: boolean;
  }) => void;
}

export interface DatePageAvailability {
  rangeKey: string;
  daySettings: Record<string, { is_open: boolean }>;
  occupancyByDate: Record<string, Booking[]> | null;
  blockedByDate: Record<string, Record<string, SlotOverrides>>;
  complete: boolean;
}

type DayState = "closed" | "full" | "open";

const PAGE_SIZE = 28;
const BLOCKED_SEAT_CHUNK_DAYS = 14;
const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function incompletePage(rangeKey: string): DatePageAvailability {
  return {
    rangeKey,
    daySettings: {},
    occupancyByDate: null,
    blockedByDate: {},
    complete: false,
  };
}

function blockedSeatChunks(
  startDate: string,
  endDate: string,
): Array<{ startDate: string; endDate: string }> {
  const chunks: Array<{ startDate: string; endDate: string }> = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const finalDate = new Date(`${endDate}T00:00:00`);
  while (cursor <= finalDate) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + BLOCKED_SEAT_CHUNK_DAYS - 1);
    if (chunkEnd > finalDate) chunkEnd.setTime(finalDate.getTime());
    chunks.push({
      startDate: toDateStr(chunkStart),
      endDate: toDateStr(chunkEnd),
    });
    cursor.setTime(chunkEnd.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
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
  page: controlledPage,
  onPageChange,
  pageCache: controlledPageCache,
  onAvailabilitySummary,
}: DateSelectionProps) {
  const [today] = useState(startOfToday);
  const pageCount = Math.max(1, Math.ceil(bookingHorizonDays / PAGE_SIZE));
  const [internalPage, setInternalPage] = useState(0);
  const requestedPage = controlledPage ?? internalPage;
  const currentPage = Math.min(requestedPage, pageCount - 1);
  const [pageAvailability, setPageAvailability] = useState<DatePageAvailability | null>(null);
  const [immediate, setImmediate] = useState<{ date: string | null; slots: string[] }>({ date: null, slots: [] });
  const [loading, setLoading] = useState(true);
  const internalPageCache = useRef(new Map<string, DatePageAvailability>());
  const pageCache = controlledPageCache ?? internalPageCache.current;

  useEffect(() => {
    if (requestedPage <= pageCount - 1) return;
    const clampedPage = pageCount - 1;
    if (onPageChange) onPageChange(clampedPage);
    else setInternalPage(clampedPage);
  }, [onPageChange, pageCount, requestedPage]);

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
    const cached = pageCache.get(rangeKey);
    if (cached) {
      setPageAvailability(cached);
      setLoading(false);
      return () => { cancelled = true; };
    }

    void (async () => {
      setLoading(true);
      const client = supabase;
      if (!client) {
        if (!cancelled) {
          setPageAvailability(incompletePage(rangeKey));
          setLoading(false);
        }
        return;
      }

      try {
        const [openRes, occRes, blockedResults] = await Promise.all([
          getOpenDays(client, { startDate: rangeStart, endDate: rangeEnd }),
          listRangeForCapacity(client, rangeStart, rangeEnd),
          Promise.all(
            blockedSeatChunks(rangeStart, rangeEnd).map((chunk) =>
              listBlockedSeats(client, chunk.startDate, chunk.endDate)
            ),
          ),
        ]);
        if (cancelled) return;

        const daySettings: Record<string, { is_open: boolean }> = {};
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

        const blockedByDate: Record<string, Record<string, SlotOverrides>> = {};
        let blockedSeatsComplete = true;
        for (const blockedResult of blockedResults) {
          Object.assign(blockedByDate, blockedResult.byDate);
          if (blockedResult.error) {
            blockedSeatsComplete = false;
            logger.error("Failed to fetch blocked seats", blockedResult.error, {
              tags: { component: "DateSelection", op: "get_blocked_seats" },
            });
          }
        }

        const complete = !openRes.error && !occRes.error && blockedSeatsComplete;
        const nextPage: DatePageAvailability = {
          rangeKey,
          daySettings,
          occupancyByDate,
          blockedByDate,
          complete,
        };
        // A degraded page remains usable, but it is not a completed cache
        // entry: returning to it must retry every required availability read.
        if (complete) pageCache.set(rangeKey, nextPage);
        setPageAvailability(nextPage);
      } catch (requestError) {
        logger.error("Failed to fetch availability page", requestError, {
          tags: { component: "DateSelection", op: "get_page_availability" },
        });
        if (!cancelled) setPageAvailability(incompletePage(rangeKey));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pageCache, rangeEnd, rangeKey, rangeStart]);

  const visibleAvailability =
    pageAvailability?.rangeKey === rangeKey ? pageAvailability : null;
  const displayLoading = loading || visibleAvailability === null;

  const isOpen = (date: Date): boolean => {
    const dateStr = toDateStr(date);
    if (visibleAvailability?.daySettings[dateStr] !== undefined) {
      return visibleAvailability.daySettings[dateStr].is_open;
    }
    return getDefaultOpenForDate(date);
  };

  const dogsForEngine = selectedDogs.map((dog) => ({ id: dog.dogId, size: dog.size }));
  const dayStateFor = (date: Date): DayState => {
    if (!isOpen(date)) return "closed";
    if (visibleAvailability?.occupancyByDate && dogsForEngine.length > 0) {
      const dayBookings = visibleAvailability.occupancyByDate[toDateStr(date)] ?? [];
      const dayOverrides = visibleAvailability.blockedByDate[toDateStr(date)] || {};
      if (findGroupedSlots(dogsForEngine, dayBookings, SALON_SLOTS, DAY_CAPACITY, dayOverrides).length === 0) {
        return "full";
      }
    }
    return "open";
  };

  // Computed once per page and reused by the grid below. dayStateFor runs the
  // capacity engine per day, so counting open days with a second pass would
  // double that work across a 28-day page.
  const dayStates = new Map<string, DayState>();
  for (const date of days) dayStates.set(toDateStr(date), dayStateFor(date));
  const openDayCount = [...dayStates.values()].filter((state) => state === "open").length;

  const summaryComplete = !displayLoading && visibleAvailability?.complete === true;
  const summaryRef = useRef(onAvailabilitySummary);
  summaryRef.current = onAvailabilitySummary;
  useEffect(() => {
    summaryRef.current?.({ pageIndex: currentPage, openDayCount, complete: summaryComplete });
  }, [currentPage, openDayCount, summaryComplete]);

  const todayAvailable = (() => {
    if (displayLoading || currentPage !== 0 || !immediate.date || immediate.slots.length === 0) return false;
    if (visibleAvailability?.occupancyByDate && dogsForEngine.length > 0) {
      const dayBookings = visibleAvailability.occupancyByDate[immediate.date] ?? [];
      const dayOverrides = visibleAvailability.blockedByDate[immediate.date] || {};
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
  const changePage = (nextPage: number) => {
    if (onPageChange) onPageChange(nextPage);
    else setInternalPage(nextPage);
  };

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
        {/* Prev/next live in a fixed-height header row (not below the grid)
            so their position never shifts as the grid grows from 4 to 6
            rows depending which weekday a page happens to start on. */}
        <div className="wizard-calendar-nav" aria-label="Date pages">
          <button
            type="button"
            className="wizard-calendar-nav-btn tap-target"
            onClick={() => changePage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            aria-label="Previous dates"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h2 className="wizard-calendar-month">{monthLabelFor(days)}</h2>
          <button
            type="button"
            className="wizard-calendar-nav-btn tap-target"
            onClick={() => changePage(Math.min(pageCount - 1, currentPage + 1))}
            disabled={currentPage === pageCount - 1}
            aria-label="Next dates"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="wizard-calendar-range" aria-live="polite">
          {bookingHorizonDays === 180
            ? `Days ${firstOffset}–${lastOffset}. Bookings are available up to six months ahead.`
            : `Days ${firstOffset}–${lastOffset} of ${bookingHorizonDays}.`}
        </p>
        {!displayLoading && visibleAvailability.complete ? (
          <div className="wizard-calendar-legend">
            <span className="wizard-calendar-legend-item">
              <span className="wizard-calendar-legend-swatch wizard-calendar-legend-swatch--open" aria-hidden="true" />
              Open
            </span>
            <span className="wizard-calendar-legend-item">
              <span className="wizard-calendar-legend-swatch wizard-calendar-legend-swatch--full" aria-hidden="true" />
              Fully booked
            </span>
            <span className="wizard-calendar-legend-item">
              <span className="wizard-calendar-legend-swatch wizard-calendar-legend-swatch--closed" aria-hidden="true" />
              Closed
            </span>
          </div>
        ) : !displayLoading ? (
          <p className="wizard-calendar-hint" role="status">
            We couldn’t check every date completely. This preview is incomplete, and we’ll check your chosen date again at the next step.
          </p>
        ) : null}

        <div className="wizard-calendar-grid">
          {DAY_HEADERS.map((header) => <div key={header} className="wizard-day-header">{header}</div>)}
        </div>

        {displayLoading ? (
          <div className="wizard-calendar-grid mt-1" aria-busy="true" aria-live="polite">
            {Array.from({ length: days.length }).map((_, index) => <div key={index} className="skeleton-row skeleton-row--sm" />)}
            <span className="sr-only">Loading availability…</span>
          </div>
        ) : (
          <div className="wizard-calendar-grid mt-1">
            {gridCells.map((date, index) => {
              if (!date) return <div key={`empty-${index}`} />;
              const dateStr = toDateStr(date);
              const state = dayStates.get(dateStr) ?? dayStateFor(date);
              const selectable = state === "open";
              const selected = selectedDate === dateStr;
              const longLabel = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
              const ariaLabel = state === "closed" ? `${longLabel}, closed` : state === "full" ? `${longLabel}, fully booked` : longLabel;
              return (
                <button
                  key={dateStr}
                  type="button"
                  className="wizard-day"
                  data-state={state}
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
