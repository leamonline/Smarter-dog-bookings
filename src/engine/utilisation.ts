import { DAILY_DOG_CAP } from "../constants/index";
import { buildSlotGrid } from "./slotGrid";
import { canBookSlot } from "./capacity";
import { isDateOpen } from "./utils";
import { toDateStr } from "../supabase/transforms";
import type {
  Booking,
  BookingsByDate,
  DaySettings,
  DogSize,
} from "../types/index";

export const DAY_CAPACITY = DAILY_DOG_CAP;

export interface WeekDate {
  dateObj: Date;
  dateStr: string;
}

export interface DayCapacity {
  cap: number;
  pct: number;
}

export interface WeekCapacity {
  bookings: number;
  cap: number;
  pct: number;
}

export interface NextAvailable {
  date: Date;
  dateStr: string;
  slot: string;
  slotLabel: string;
  dateLabel: string;
}

// A busy day is a GOOD day for the salon — full reads green, not red.
// Rose is reserved for genuinely over-capacity (count past the cap).
export function utilisationColor(pct: number, over = false): string {
  if (over) return "bg-rose-500";
  if (pct >= 70) return "bg-emerald-500";
  if (pct >= 40) return "bg-amber-400";
  return "bg-sky-400";
}

export function utilisationLabel(pct: number, isOpen: boolean): string {
  if (!isOpen) return "Closed";
  if (pct >= 70) return "Full";
  if (pct >= 40) return "Steady";
  return "Quiet";
}

export function computeDayCapacity(
  bookingCount: number,
  isOpen: boolean,
): DayCapacity {
  const cap = isOpen ? DAY_CAPACITY : 0;
  const pct = cap > 0 ? Math.min(100, Math.round((bookingCount / cap) * 100)) : 0;
  return { cap, pct };
}

export interface CapacityRatio {
  cap: number;
  count: number;
  /** Uncapped count / cap (0 when closed). Lets the bar signal "over". */
  ratio: number;
  over: boolean;
}

/**
 * Wordless capacity signal for the schedule controls. The ratio is deliberately
 * uncapped (unlike computeDayCapacity's pct) so the bar + count/cap number can
 * convey an over-booked day without ever printing the word "OVER".
 */
export function capacityRatio(count: number, isOpen: boolean): CapacityRatio {
  const cap = isOpen ? DAY_CAPACITY : 0;
  const ratio = cap > 0 ? count / cap : 0;
  return { cap, count, ratio, over: cap > 0 && count > cap };
}

const SLOT_MINUTES = 30;

export function slotToMinutes(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Index of the slot currently in progress for the "Now" row, or -1 when `now`
 * is outside salon hours. A slot owns the window [its start, the next slot's
 * start); the final slot gets a 30-minute tail. Callers should only use this
 * when viewing today's date.
 */
export function currentSlotIndex(activeSlots: string[], now: Date): number {
  if (!activeSlots || activeSlots.length === 0) return -1;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const starts = activeSlots.map(slotToMinutes);
  if (nowMins < starts[0]) return -1;
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : starts[i] + SLOT_MINUTES;
    if (nowMins >= starts[i] && nowMins < end) return i;
  }
  return -1;
}

/**
 * Reporting fill/capacity rate: bookings as a percentage of the salon's real
 * throughput limit (DAILY_DOG_CAP per open day), capped at 100. This is the
 * SAME denominator the weekly calendar's Full/Steady/Quiet badge uses
 * (computeWeekCapacity), so the reports "Capacity %" reads on the same scale as
 * the calendar — not against a theoretical slots×2 ceiling the salon can never
 * reach. Flat dog count, exactly like DAY_CAPACITY: do NOT seat-weight large
 * dogs here or the reports re-diverge from the calendar.
 */
export function computeFillRate(
  bookingCount: number,
  openDays: number,
): number {
  const cap = openDays * DAY_CAPACITY;
  return cap > 0 ? Math.min(100, (bookingCount / cap) * 100) : 0;
}

export function computeWeekCapacity(
  dates: WeekDate[] | null | undefined,
  bookingsByDate: BookingsByDate | null | undefined,
  dayOpenState: Record<string, boolean> | null | undefined,
): WeekCapacity {
  let bookings = 0;
  let openDays = 0;
  (dates || []).forEach((d) => {
    bookings += (bookingsByDate?.[d.dateStr] || []).length;
    const isOpen = isDateOpen(d.dateStr, dayOpenState);
    if (isOpen) openDays += 1;
  });
  const cap = openDays * DAY_CAPACITY;
  const pct = cap > 0 ? Math.min(100, Math.round((bookings / cap) * 100)) : 0;
  return { bookings, cap, pct };
}

function formatSlot(slot: string): string {
  const [h, m] = slot.split(":");
  const hour = parseInt(h, 10);
  return `${hour}:${m}`;
}

export interface FindNextAvailableArgs {
  fromDate?: Date | null;
  bookingsByDate?: BookingsByDate | null;
  dayOpenState?: Record<string, boolean> | null;
  daySettings?: Record<string, DaySettings> | null;
  maxDaysAhead?: number;
  size?: DogSize;
  now?: Date;
}

export function findNextAvailable({
  fromDate,
  bookingsByDate,
  dayOpenState,
  daySettings,
  maxDaysAhead = 28,
  size = "small",
  now = new Date(),
}: FindNextAvailableArgs = {}): NextAvailable | null {
  if (!fromDate) return null;
  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  // Never advertise a slot in the past. If the caller is looking at a
  // past day (e.g., the user clicked back through the calendar), bump
  // the search start to today so we don't suggest "Mon 11 May" when
  // today is the 17th.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (start < today) start.setTime(today.getTime());
  for (let i = 0; i < maxDaysAhead; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = toDateStr(d);
    const isOpen = isDateOpen(dateStr, dayOpenState);
    if (!isOpen) continue;
    const settings = daySettings?.[dateStr];
    const extraSlots = settings?.extraSlots ?? [];
    const overridesForSlot = settings?.overrides ?? {};
    const slots = buildSlotGrid(extraSlots);
    const dayBookings: Booking[] = bookingsByDate?.[dateStr] || [];
    for (const slot of slots) {
      const overrides = overridesForSlot[slot] || {};
      const check = canBookSlot(dayBookings, slot, size, slots, { overrides });
      if (check.allowed) {
        return {
          date: d,
          dateStr,
          slot,
          slotLabel: formatSlot(slot),
          dateLabel: d.toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
          }),
        };
      }
    }
  }
  return null;
}
