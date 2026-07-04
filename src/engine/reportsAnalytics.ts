// ============================================================
// Decision-report analytics — pure TS, zero React.
//
// The reports answer operational questions from real booking data:
//   2A hardest days/slots to fill · 2B value per booked hour by service
//   2C reschedules/cancellations/no-shows · 2E booking source & self-service
//   2D due-back-but-not-booked (retention)
//
// Every function is pure and windowed on the same (cutoff, today] convention as
// useReportsData, excludes cancelled bookings from counts via isCountableBooking,
// and prices only through computeBookingPricing so money never has a second
// source. Insights/caveats are template-driven from these numbers by the
// components; nothing here fabricates interpretation.
// ============================================================

import {
  SERVICES,
  SALON_SLOTS,
  ALL_DAYS,
  DAILY_DOG_CAP,
  BOOKING_STATUS,
} from "../constants/index";
import { computeBookingPricing, isCountableBooking } from "./bookingRules";
import { londonWallClockToUtcMs } from "./today";

/** Event history only starts accruing from this date (booking_events backfill
 *  seeded created/cancelled; reschedules/completions accrue forward). Reports
 *  render this as a caveat so trends don't imply older coverage. */
export const OUTCOME_HISTORY_START = "2026-05-20";

/** A completed booking counts as "rebooked" if the same dog has another
 *  completed booking within this many days after it (12 weeks). */
export const REBOOK_WINDOW_DAYS = 84;

/** A cancellation is "late" if it lands within this many hours before the slot. */
const LATE_CANCEL_HOURS = 24;

const SLOT_HOURS = 0.5; // the canonical grid is 30-minute slots

export interface AnalyticsBooking {
  id: string;
  booking_date: string;
  slot: string;
  service: string;
  size: string;
  status: string;
  payment: string;
  addons: string[];
  deposit_amount: number | null;
  dog_id: string;
  cancel_reason?: string | null;
  created_by_role?: string | null;
  source?: string | null;
  reminder_confirmed_at?: string | null;
  checked_in_at?: string | null;
  ready_at?: string | null;
}

/** Longest a single groom could plausibly take; a gap beyond this is bad data
 *  (e.g. a dog left "checked in" overnight), not a real duration. */
const MAX_GROOM_MINUTES = 12 * 60;

/**
 * Actual groom time in minutes = ready_at − checked_in_at, when both stamps
 * exist and the gap is sane. Null otherwise (no timing / bad data). Timings
 * only accrue from 2026-07-02, so most historical grooms return null.
 */
export function actualGroomMinutes(b: { checked_in_at?: string | null; ready_at?: string | null }): number | null {
  if (!b.checked_in_at || !b.ready_at) return null;
  const start = Date.parse(b.checked_in_at);
  const end = Date.parse(b.ready_at);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const mins = (end - start) / 60000;
  if (mins <= 0 || mins > MAX_GROOM_MINUTES) return null;
  return mins;
}

export interface AnalyticsEvent {
  event_type: string;
  occurred_at: string | null;
  booking_date: string | null;
  slot: string | null;
  service?: string | null;
  cancel_reason?: string | null;
  previous_booking_date?: string | null;
  previous_slot?: string | null;
}

export type IsOpenDate = (dateStr: string) => boolean;

type DogCustomPriceMap = Record<string, { customPrice?: number | null }>;

// -- date helpers (UTC, so window bounds don't drift with the runner's tz) -----

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function daysBetween(fromStr: string, toStr: string): number {
  const a = Date.parse(fromStr + "T00:00:00Z");
  const b = Date.parse(toStr + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

/** Mon=0 … Sun=6 for a "YYYY-MM-DD". Weekday is timezone-independent. */
function weekdayIndex(dateStr: string): number {
  const day = new Date(dateStr + "T00:00:00Z").getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function windowDates(days: number, today: Date): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(ymd(addDays(today, -i)));
  return out;
}

function slotLabel(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hh}:${String(m).padStart(2, "0")}${suffix}`;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function windowBounds(days: number, today: Date) {
  return { todayStr: ymd(today), cutoffStr: ymd(addDays(today, -days)) };
}

function inCurrentWindow(b: { booking_date: string }, cutoffStr: string, todayStr: string): boolean {
  return b.booking_date > cutoffStr && b.booking_date <= todayStr;
}

function priceOf(b: AnalyticsBooking, dogMap: DogCustomPriceMap): number {
  return computeBookingPricing({
    service: b.service,
    size: b.size,
    addons: b.addons,
    payment: b.payment,
    depositAmount: b.deposit_amount,
    customPrice: dogMap[b.dog_id]?.customPrice,
  }).subtotal;
}

// -- 2A: hardest days & slots to fill -----------------------------------------

export interface SlotFillRow {
  slot: string;
  label: string;
  n: number;
  capacity: number;
  fillPct: number;
}
export interface WeekdayFillRow {
  label: string;
  open: boolean;
  n: number;
  capacity: number;
  fillPct: number;
}

export function computeSlotFill(
  bookings: AnalyticsBooking[],
  days: number,
  today: Date,
  isOpen: IsOpenDate,
) {
  const { todayStr, cutoffStr } = windowBounds(days, today);
  const cur = bookings.filter(
    (b) => inCurrentWindow(b, cutoffStr, todayStr) && isCountableBooking(b) && isOpen(b.booking_date),
  );

  const openDayDates = windowDates(days, today).filter(isOpen);
  const openDays = openDayDates.length;
  const weekdayOpenDays = Array(7).fill(0) as number[];
  openDayDates.forEach((d) => weekdayOpenDays[weekdayIndex(d)]++);

  const slotN: Record<string, number> = {};
  const weekdayN = Array(7).fill(0) as number[];
  cur.forEach((b) => {
    if (b.slot) slotN[b.slot] = (slotN[b.slot] || 0) + 1;
    weekdayN[weekdayIndex(b.booking_date)]++;
  });

  const bySlot: SlotFillRow[] = SALON_SLOTS.map((slot) => {
    const n = slotN[slot] || 0;
    const capacity = openDays * 2; // 2 seats per slot
    return { slot, label: slotLabel(slot), n, capacity, fillPct: capacity > 0 ? (n / capacity) * 100 : 0 };
  });

  const byWeekday: WeekdayFillRow[] = DAY_LABELS.map((label, i) => {
    const capacity = weekdayOpenDays[i] * DAILY_DOG_CAP;
    const n = weekdayN[i];
    return { label, open: ALL_DAYS[i]?.defaultOpen ?? false, n, capacity, fillPct: capacity > 0 ? (n / capacity) * 100 : 0 };
  });

  const busiestSlot = bySlot.reduce((best, s) => (s.n > best.n ? s : best), bySlot[0]);
  const fillable = bySlot.filter((s) => s.capacity > 0);
  const hardestSlot = (fillable.length ? fillable : bySlot).reduce(
    (worst, s) => (s.fillPct < worst.fillPct ? s : worst),
    fillable[0] ?? bySlot[0],
  );
  const openWeekdays = byWeekday.filter((d) => d.open && d.capacity > 0);
  const quietestWeekday = openWeekdays.length
    ? openWeekdays.reduce((q, d) => (d.fillPct < q.fillPct ? d : q), openWeekdays[0])
    : null;

  return { bySlot, byWeekday, busiestSlot, hardestSlot, quietestWeekday, openDays };
}

// -- 2A: extra/immediate-slot uptake (levers staff pulled but didn't fill) -----

interface DaySettingsLite {
  extra_slots?: string[] | null;
  immediate_slots?: string[] | null;
}

export function computeSlotLevers(
  daySettingsByDate: Record<string, DaySettingsLite>,
  bookings: AnalyticsBooking[],
  days: number,
  today: Date,
) {
  const { todayStr, cutoffStr } = windowBounds(days, today);
  const booked = new Set<string>();
  bookings.forEach((b) => {
    if (isCountableBooking(b) && inCurrentWindow(b, cutoffStr, todayStr) && b.slot) {
      booked.add(`${b.booking_date}|${b.slot}`);
    }
  });

  let extraOpened = 0;
  let extraBooked = 0;
  let immediateFlagged = 0;
  let immediateBooked = 0;
  Object.entries(daySettingsByDate || {}).forEach(([date, ds]) => {
    if (!(date > cutoffStr && date <= todayStr)) return;
    (ds.extra_slots || []).forEach((slot) => {
      extraOpened++;
      if (booked.has(`${date}|${slot}`)) extraBooked++;
    });
    (ds.immediate_slots || []).forEach((slot) => {
      immediateFlagged++;
      if (booked.has(`${date}|${slot}`)) immediateBooked++;
    });
  });
  return { extraOpened, extraBooked, immediateFlagged, immediateBooked };
}

// -- 2B: value per booked hour by service -------------------------------------

export interface ServiceValueRow {
  id: string;
  name: string;
  n: number;
  completedN: number;
  revenue: number;
  valuePerHour: number;
  rebookRatePct: number;
  cancelRatePct: number;
  /** Completed grooms of this service that have a real check-in→ready timing. */
  timedN: number;
  /** Mean actual groom time (minutes) across the timed grooms; null if none. */
  avgActualMinutes: number | null;
  /** Value per hour from real durations only; null until timings accrue. */
  actualValuePerHour: number | null;
}

export function computeServiceValue(
  bookings: AnalyticsBooking[],
  dogMap: DogCustomPriceMap,
  days: number,
  today: Date,
  isOpen: IsOpenDate,
): ServiceValueRow[] {
  const { todayStr, cutoffStr } = windowBounds(days, today);
  const windowRows = bookings.filter((b) => inCurrentWindow(b, cutoffStr, todayStr) && isOpen(b.booking_date));

  // Completed dates per dog across ALL history (not just the window) so a
  // booking near the window edge can still see its rebooking.
  const completedByDog: Record<string, string[]> = {};
  bookings
    .filter((b) => b.status === BOOKING_STATUS.COMPLETED)
    .forEach((b) => {
      (completedByDog[b.dog_id] ||= []).push(b.booking_date);
    });
  Object.values(completedByDog).forEach((arr) => arr.sort());

  return SERVICES.map((s) => {
    const svcWindow = windowRows.filter((b) => b.service === s.id);
    const completed = svcWindow.filter((b) => b.status === BOOKING_STATUS.COMPLETED);
    const cancelled = svcWindow.filter((b) => !isCountableBooking(b));
    const revenue = completed.reduce((sum, b) => sum + priceOf(b, dogMap), 0);
    const completedN = completed.length;
    const hours = completedN * SLOT_HOURS;
    let rebooked = 0;
    let timedN = 0;
    let timedMinutes = 0;
    let timedRevenue = 0;
    completed.forEach((b) => {
      const later = (completedByDog[b.dog_id] || []).some(
        (d) => d > b.booking_date && daysBetween(b.booking_date, d) <= REBOOK_WINDOW_DAYS,
      );
      if (later) rebooked++;
      const mins = actualGroomMinutes(b);
      if (mins != null) {
        timedN++;
        timedMinutes += mins;
        timedRevenue += priceOf(b, dogMap);
      }
    });
    return {
      id: s.id,
      name: s.name,
      n: svcWindow.length,
      completedN,
      revenue,
      valuePerHour: hours > 0 ? revenue / hours : 0,
      rebookRatePct: completedN > 0 ? (rebooked / completedN) * 100 : 0,
      cancelRatePct: svcWindow.length > 0 ? (cancelled.length / svcWindow.length) * 100 : 0,
      timedN,
      avgActualMinutes: timedN > 0 ? timedMinutes / timedN : null,
      actualValuePerHour: timedN > 0 && timedMinutes > 0 ? timedRevenue / (timedMinutes / 60) : null,
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

// -- 2C: reschedules, cancellations & no-shows --------------------------------

export function computeOutcomes(
  bookings: AnalyticsBooking[],
  events: AnalyticsEvent[],
  days: number,
  today: Date,
  isOpen: IsOpenDate,
) {
  const { todayStr, cutoffStr } = windowBounds(days, today);

  const evInWindow = events.filter((e) => {
    if (!e.occurred_at) return false;
    const d = ymd(new Date(e.occurred_at));
    return d > cutoffStr && d <= todayStr;
  });
  const rescheduleCount = evInWindow.filter((e) => e.event_type === "rescheduled").length;
  const cancels = evInWindow.filter((e) => e.event_type === "cancelled");
  const noShowConfirmedCount = cancels.filter((e) => (e.cancel_reason || "").toLowerCase() === "no-show").length;
  const lateCancelCount = cancels.filter((e) => {
    if (!e.booking_date || !e.slot || !e.occurred_at) return false;
    // The slot is a Europe/London wall-clock time; occurred_at is a real UTC
    // instant. Resolve the slot to a true instant so the 24h window is correct
    // year-round (BST included), not an hour out.
    const slotTs = londonWallClockToUtcMs(e.booking_date, e.slot);
    const occ = Date.parse(e.occurred_at);
    if (Number.isNaN(slotTs) || Number.isNaN(occ)) return false;
    return occ <= slotTs && slotTs - occ <= LATE_CANCEL_HOURS * 3600 * 1000;
  }).length;

  const bWindow = bookings.filter((b) => inCurrentWindow(b, cutoffStr, todayStr) && isOpen(b.booking_date));
  const confirmed = bWindow.filter((b) => b.reminder_confirmed_at);
  const unconfirmed = bWindow.filter((b) => !b.reminder_confirmed_at);
  const cancelRate = (list: AnalyticsBooking[]) =>
    list.length > 0 ? (list.filter((b) => !isCountableBooking(b)).length / list.length) * 100 : 0;

  // Legacy proxy: a past-dated booking still sitting in "Booked".
  const noShowProxyCount = bWindow.filter(
    (b) => b.status === BOOKING_STATUS.BOOKED && b.booking_date < todayStr,
  ).length;

  return {
    rescheduleCount,
    cancelCount: cancels.length,
    noShowConfirmedCount,
    lateCancelCount,
    noShowProxyCount,
    confirmedN: confirmed.length,
    unconfirmedN: unconfirmed.length,
    confirmedCancelRatePct: cancelRate(confirmed),
    unconfirmedCancelRatePct: cancelRate(unconfirmed),
    historyStart: OUTCOME_HISTORY_START,
  };
}

// -- 2E: booking source & self-service adoption -------------------------------

const ROLE_LABELS: Record<string, string> = {
  staff: "Staff",
  customer: "Customer (self-service)",
  ai: "WhatsApp AI",
  system: "System",
  unknown: "Unknown",
};

export interface SourceRow {
  role: string;
  label: string;
  n: number;
  pct: number;
  avgValue: number;
  cancelRatePct: number;
}

export function computeSourceMix(
  bookings: AnalyticsBooking[],
  dogMap: DogCustomPriceMap,
  days: number,
  today: Date,
  isOpen: IsOpenDate,
) {
  const { todayStr, cutoffStr } = windowBounds(days, today);
  const bWindow = bookings.filter((b) => inCurrentWindow(b, cutoffStr, todayStr) && isOpen(b.booking_date));

  const acc: Record<string, { all: AnalyticsBooking[]; countable: AnalyticsBooking[] }> = {};
  bWindow.forEach((b) => {
    const role = b.created_by_role || "unknown";
    (acc[role] ||= { all: [], countable: [] }).all.push(b);
    if (isCountableBooking(b)) acc[role].countable.push(b);
  });
  const totalCountable = bWindow.filter(isCountableBooking).length;

  const bySource: SourceRow[] = Object.entries(acc)
    .map(([role, g]) => {
      const n = g.countable.length;
      const rev = g.countable.reduce((s, b) => s + priceOf(b, dogMap), 0);
      return {
        role,
        label: ROLE_LABELS[role] || role,
        n,
        pct: totalCountable > 0 ? (n / totalCountable) * 100 : 0,
        avgValue: n > 0 ? rev / n : 0,
        cancelRatePct: g.all.length > 0 ? (g.all.filter((x) => !isCountableBooking(x)).length / g.all.length) * 100 : 0,
      };
    })
    .sort((a, b) => b.n - a.n);

  const selfServicePct = totalCountable > 0 ? ((acc["customer"]?.countable.length || 0) / totalCountable) * 100 : 0;
  return { bySource, selfServicePct, totalCountable };
}

// -- 2D: due back but not booked (retention) ----------------------------------

export interface RetentionInterval {
  visitCount: number;
  medianIntervalDays: number | null;
  lastGroomedDate: string | null;
  lastService: string | null;
}
export interface RetentionDog {
  id: string;
  name: string;
  size?: string;
  humanId: string;
  archivedAt?: string | null;
}
export interface RetentionHuman {
  id: string;
  name: string;
  archivedAt?: string | null;
  smsOptedOut?: boolean;
  whatsappOptedOut?: boolean;
  emailOptedOut?: boolean;
}
export interface RetentionMark {
  dog_id: string;
  kind: "snoozed" | "excluded";
  until?: string | null;
  createdAt?: string | null;
}
export type RetentionStatus = "overdue" | "due-soon" | "not-due";

export interface RetentionCandidate {
  dogId: string;
  dogName: string;
  owner: string;
  ownerId: string;
  size?: string;
  lastGroomedDate: string;
  lastService: string | null;
  typicalIntervalDays: number;
  daysSince: number;
  overdueDays: number;
  dueInDays: number;
  status: RetentionStatus;
  recentlyContacted: boolean;
}

/** How close to due (days) still counts as "due soon" rather than "not due". */
const DUE_SOON_WINDOW_DAYS = 14;

export function computeRetentionCandidates(args: {
  intervals: Record<string, RetentionInterval>;
  dogs: Record<string, RetentionDog>;
  humans: Record<string, RetentionHuman>;
  marks: RetentionMark[];
  recentContactByDog?: Record<string, string | null>;
  today: Date;
  defaultBandDays?: number;
}): { candidates: RetentionCandidate[]; excludedCount: number; overdueCount: number } {
  const { intervals, dogs, humans, marks, recentContactByDog = {}, today, defaultBandDays = 70 } = args;
  const todayStr = ymd(today);
  // Most-recent mark per dog wins, independent of the fetch order (a dog can
  // legitimately accumulate marks — e.g. snooze then later exclude).
  const markByDog: Record<string, RetentionMark> = {};
  (marks || []).forEach((m) => {
    const current = markByDog[m.dog_id];
    if (!current || (m.createdAt || "") >= (current.createdAt || "")) {
      markByDog[m.dog_id] = m;
    }
  });

  let excludedCount = 0;
  const candidates: RetentionCandidate[] = [];

  Object.entries(dogs).forEach(([dogId, dog]) => {
    const iv = intervals[dogId];
    if (!iv || !iv.lastGroomedDate) return; // no groom history => no retention baseline

    const human = humans[dog.humanId] || null;
    const mark = markByDog[dogId];
    const optedOutEverything = !!human && !!human.smsOptedOut && !!human.whatsappOptedOut && !!human.emailOptedOut;
    const snoozed = !!mark && mark.kind === "snoozed" && (!mark.until || mark.until > todayStr);
    const excluded = !!mark && mark.kind === "excluded";
    if (dog.archivedAt || human?.archivedAt || optedOutEverything || snoozed || excluded) {
      excludedCount++;
      return;
    }

    const typicalIntervalDays =
      iv.visitCount >= 3 && iv.medianIntervalDays != null ? Math.round(iv.medianIntervalDays) : defaultBandDays;
    const daysSince = daysBetween(iv.lastGroomedDate, todayStr);
    const overdueDays = daysSince - typicalIntervalDays;
    const status: RetentionStatus =
      overdueDays > 0 ? "overdue" : overdueDays >= -DUE_SOON_WINDOW_DAYS ? "due-soon" : "not-due";

    candidates.push({
      dogId,
      dogName: dog.name,
      owner: human?.name || "",
      ownerId: dog.humanId,
      size: dog.size,
      lastGroomedDate: iv.lastGroomedDate,
      lastService: iv.lastService,
      typicalIntervalDays,
      daysSince,
      overdueDays,
      dueInDays: -overdueDays,
      status,
      recentlyContacted: !!recentContactByDog[dogId],
    });
  });

  candidates.sort((a, b) => b.overdueDays - a.overdueDays);
  return { candidates, excludedCount, overdueCount: candidates.filter((c) => c.status === "overdue").length };
}
