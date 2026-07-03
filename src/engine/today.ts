// ============================================================
// Today view selectors — pure TS business logic, zero React.
//
// The Today command centre turns the day's bookings into an operational work
// queue: who is late, who still needs to confirm, who is waiting to be
// collected, what is owed, and which slots are genuinely fillable. Everything
// here is a pure function so it can be unit-tested (incl. Europe/London time
// and DST) and kept out of the components.
//
// Time: the salon runs on Europe/London. The DB is the authority for booking
// cutoffs (validate_booking_calendar / get_immediate_slots); these helpers just
// drive the UI, but unlike currentSlotIndex / immediateBooking they compute the
// London wall clock explicitly (Intl) so a mis-set device clock can't skew
// "now". Capacity/pricing are NOT reimplemented here — we call the existing
// engine (computeSlotCapacities, getBookableSeatCount, canBookSlot,
// computeBookingPricing, computeRevenue) so the four sources stay in sync.
// ============================================================

import { slotToMinutes, DAY_CAPACITY } from "./utilisation";
import { getBookableSeatCount, canBookSlot } from "./capacity";
import { computeBookingPricing, isCountableBooking } from "./bookingRules";
import { computeRevenue } from "./pricing";
import {
  BOOKING_STATUS,
  DOG_SIZE,
  IMMEDIATE_CUTOFF_MINUTES,
  LATE_ARRIVAL_GRACE_MINUTES,
} from "../constants/salon";
import type { Booking, Dog, SlotOverrides } from "../types/index";

// SALON_SLOTS is a 30-minute grid; utilisation.ts keeps this private so we
// restate it here (a report/opportunity needs the slot length).
const SLOT_LENGTH_MINUTES = 30;

/**
 * The subset of booking fields the Today selectors read. The full `Booking`
 * object is structurally assignable, and light test fixtures stay small.
 */
export interface TodayBooking {
  status?: string | null;
  slot?: string;
  service?: string;
  size?: string;
  payment?: string | null;
  addons?: string[] | null;
  depositAmount?: number | null;
  reminderState?: string;
  confirmationChannel?: string | null;
  readyAt?: string | null;
  checkedInAt?: string | null;
  _bookingDate?: string;
  _dogId?: string | null;
  dogName?: string;
}

// ---- Europe/London wall clock -----------------------------------------------

export interface LondonParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** Minutes since London midnight (hour*60 + minute). */
  minutesOfDay: number;
  /** London calendar date as "YYYY-MM-DD". */
  dateStr: string;
}

// hourCycle 'h23' guarantees 00-23 (avoids the "24:00" edge that hour12:false
// can emit at midnight, which would desync the hour from the date).
const LONDON_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function londonNowParts(now: Date = new Date()): LondonParts {
  const parts = LONDON_FMT.formatToParts(now);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // defensive; h23 should never produce 24
  const minute = Number(get("minute"));
  return {
    year,
    month,
    day,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export function londonDateStr(now: Date = new Date()): string {
  return londonNowParts(now).dateStr;
}

// ---- Status ranking ----------------------------------------------------------

/** Position of a status along the linear progression; Cancelled/unknown = -1. */
export const BOOKING_STATUS_RANK: Record<string, number> = {
  [BOOKING_STATUS.BOOKED]: 0,
  [BOOKING_STATUS.CHECKED_IN]: 1,
  [BOOKING_STATUS.IN_BATH]: 2,
  [BOOKING_STATUS.READY_FOR_PICKUP]: 3,
  [BOOKING_STATUS.COMPLETED]: 4,
};

export function statusRank(status?: string | null): number {
  if (!status) return -1;
  const rank = BOOKING_STATUS_RANK[status];
  return rank === undefined ? -1 : rank;
}

// ---- Late arrivals -----------------------------------------------------------

/** Signed minutes since the slot started, on the London clock. */
export function minutesPastSlotStart(slot: string, now: Date): number {
  return londonNowParts(now).minutesOfDay - slotToMinutes(slot);
}

/**
 * A dog is a "late arrival" when it's booked today, still only "Booked" (never
 * checked in / cancelled), and its slot started more than `graceMinutes` ago.
 */
export function isLateArrival(
  b: TodayBooking,
  now: Date,
  graceMinutes: number = LATE_ARRIVAL_GRACE_MINUTES,
): boolean {
  if (statusRank(b.status) !== 0) return false;
  if (!b.slot) return false;
  if (b._bookingDate && b._bookingDate !== londonNowParts(now).dateStr) return false;
  return minutesPastSlotStart(b.slot, now) > graceMinutes;
}

/** Minutes a still-Booked dog is overdue (0 if not past its slot). */
export function minutesOverdue(b: TodayBooking, now: Date): number {
  if (!b.slot) return 0;
  return Math.max(0, minutesPastSlotStart(b.slot, now));
}

// ---- Confirmation ------------------------------------------------------------

/**
 * Needs chasing to confirm ONLY when a reminder was actually sent and not yet
 * confirmed (reminderState === "sent" — "confirmed" wins over "sent" in the
 * transform), and the booking wasn't set to skip confirmation
 * (confirmation_channel !== "none"). Never flags a booking that was never asked.
 */
export function needsConfirmation(b: TodayBooking): boolean {
  return b.reminderState === "sent" && b.confirmationChannel !== "none";
}

// ---- Wait times --------------------------------------------------------------

function minutesSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 60000));
}

/** Minutes since the dog was marked Ready (null if no ready_at / not ready). */
export function collectionWaitMinutes(b: TodayBooking, now: Date): number | null {
  return minutesSince(b.readyAt, now);
}

/** Minutes since the dog was checked in (null if no checked_in_at). */
export function timeInSalonMinutes(b: TodayBooking, now: Date): number | null {
  return minutesSince(b.checkedInAt, now);
}

// ---- Payments (G4 mapping) ---------------------------------------------------

export type PaymentKind = "paid" | "deposit" | "due" | "other";

export interface PaymentInfo {
  kind: PaymentKind;
  /** Human label; for "other" it is the raw payment string, rendered neutrally. */
  label: string;
  /** Amount still due (£). Null for "other" — we never imply a balance. */
  amountDue: number | null;
  depositPaid: number;
  subtotal: number;
}

export function paymentState(b: TodayBooking, customPrice: number | null = null): PaymentInfo {
  const pricing = computeBookingPricing({
    service: b.service ?? "",
    size: b.size ?? DOG_SIZE.SMALL,
    addons: b.addons ?? null,
    payment: b.payment ?? null,
    depositAmount: b.depositAmount ?? null,
    customPrice,
  });
  const raw = (b.payment || "Due at Pick-up").trim();
  if (raw === "Paid in Full") {
    return { kind: "paid", label: "Paid", amountDue: 0, depositPaid: 0, subtotal: pricing.subtotal };
  }
  if (raw === "Deposit Paid") {
    return { kind: "deposit", label: "Deposit paid", amountDue: pricing.amountDue, depositPaid: pricing.depositPaid, subtotal: pricing.subtotal };
  }
  if (raw === "Due at Pick-up") {
    return { kind: "due", label: "Balance due", amountDue: pricing.amountDue, depositPaid: 0, subtotal: pricing.subtotal };
  }
  return { kind: "other", label: raw, amountDue: null, depositPaid: 0, subtotal: pricing.subtotal };
}

/** Any non-paid, non-cancelled booking still owes money. */
export function isPaymentOutstanding(b: TodayBooking): boolean {
  if (!isCountableBooking(b)) return false;
  return (b.payment || "Due at Pick-up") !== "Paid in Full";
}

// ---- Capacity & opportunities ------------------------------------------------

export interface SlotOpportunity {
  slot: string;
  slotMinutes: number;
  isPast: boolean;
  isCurrent: boolean;
  /** Bookable (available) seats left, size-agnostic. */
  seatsFree: number;
  /** Whether a large dog could still take this slot (per LARGE_DOG_SLOTS + rules). */
  largeDogEligible: boolean;
  /** Reachable by a customer right now: immediate-flagged AND before the cutoff. */
  customerReachable: boolean;
  /** No bookable seats and the slot hasn't passed (fully committed/blocked). */
  isBlocked: boolean;
}

export function buildSlotOpportunities(args: {
  bookings: TodayBooking[];
  activeSlots: string[];
  overrides?: SlotOverrides;
  immediateSlots?: string[];
  now: Date;
  todayStr?: string;
}): SlotOpportunity[] {
  const { bookings, activeSlots, overrides = {}, immediateSlots = [], now } = args;
  const nowMins = londonNowParts(now).minutesOfDay;
  const immediateSet = new Set(immediateSlots);
  const bk = bookings as unknown as Booking[];

  return activeSlots.map((slot) => {
    const slotMinutes = slotToMinutes(slot);
    const isPast = slotMinutes + SLOT_LENGTH_MINUTES <= nowMins;
    const isCurrent = !isPast && slotMinutes <= nowMins && nowMins < slotMinutes + SLOT_LENGTH_MINUTES;
    const seatsFree = getBookableSeatCount(bk, slot, activeSlots, overrides);
    const largeDogEligible = canBookSlot(bk, slot, DOG_SIZE.LARGE, activeSlots).allowed;
    const beforeCutoff = nowMins <= slotMinutes - IMMEDIATE_CUTOFF_MINUTES;
    const customerReachable = !isPast && immediateSet.has(slot) && beforeCutoff;
    const isBlocked = !isPast && seatsFree === 0;
    return { slot, slotMinutes, isPast, isCurrent, seatsFree, largeDogEligible, customerReachable, isBlocked };
  });
}

// ---- Day summary -------------------------------------------------------------

export interface DaySummary {
  total: number;
  expected: number;
  arrived: number;
  ready: number;
  collected: number;
  unpaidCount: number;
  dogsBooked: number;
  capacityUsedPct: number;
  expectedRevenue: number;
  /** Sum of appointment value recorded as Paid in Full — a status, not a till. */
  collectedRevenue: number;
}

export function buildDaySummary(
  bookings: TodayBooking[],
  dogs: Record<string, Dog> | null = null,
): DaySummary {
  const countable = bookings.filter(isCountableBooking);
  let expected = 0;
  let arrived = 0;
  let ready = 0;
  let collected = 0;
  let unpaidCount = 0;
  for (const b of countable) {
    const rank = statusRank(b.status);
    if (rank === 0) expected++;
    if (rank >= 1) arrived++;
    if (b.status === BOOKING_STATUS.READY_FOR_PICKUP) ready++;
    if (b.status === BOOKING_STATUS.COMPLETED) collected++;
    if ((b.payment || "Due at Pick-up") !== "Paid in Full") unpaidCount++;
  }
  const paid = countable.filter((b) => (b.payment || "Due at Pick-up") === "Paid in Full");
  const total = countable.length;
  return {
    total,
    expected,
    arrived,
    ready,
    collected,
    unpaidCount,
    dogsBooked: total,
    capacityUsedPct: Math.round((total / DAY_CAPACITY) * 100),
    expectedRevenue: computeRevenue(countable as unknown as Booking[], dogs),
    collectedRevenue: computeRevenue(paid as unknown as Booking[], dogs),
  };
}

// ---- Queue assembly ----------------------------------------------------------

/** Why a booking is on the immediate-attention list, most urgent first. */
export type AttentionKind = "late" | "ready" | "unconfirmed" | "payment";
const ATTENTION_PRIORITY: readonly AttentionKind[] = ["late", "ready", "unconfirmed", "payment"];

export interface AttentionItem {
  booking: Booking;
  /** All reasons that apply, in priority order (primary = kinds[0]). */
  kinds: AttentionKind[];
  primary: AttentionKind;
  overdueMinutes: number;
  waitMinutes: number | null;
}

/**
 * A freshly-Ready dog lives in the collection queue; it only escalates into
 * the attention queue once it has been waiting this long (or has no ready_at
 * stamp to judge by — legacy rows surface rather than hide).
 */
export const READY_ESCALATION_MINUTES = 15;

/**
 * Everything needing action right now, as ranked rows. Late arrivals first
 * (most overdue first), then dogs waiting to be collected (longest wait first),
 * then not-yet-arrived bookings still awaiting confirmation, then dogs in/past
 * the salon that still owe money. A booking appears once, under its most urgent
 * reason, but records every reason so the UI can chip the rest.
 */
export function buildImmediateAttention(
  bookings: Booking[],
  now: Date,
  opts: { graceMinutes?: number; readyEscalationMinutes?: number } = {},
): AttentionItem[] {
  const grace = opts.graceMinutes ?? LATE_ARRIVAL_GRACE_MINUTES;
  const readyEscalation = opts.readyEscalationMinutes ?? READY_ESCALATION_MINUTES;
  const items: AttentionItem[] = [];
  for (const b of bookings) {
    if (!isCountableBooking(b)) continue;
    const rank = statusRank(b.status);
    const kinds: AttentionKind[] = [];
    if (isLateArrival(b, now, grace)) kinds.push("late");
    if (b.status === BOOKING_STATUS.READY_FOR_PICKUP) {
      const wait = collectionWaitMinutes(b, now);
      if (wait == null || wait >= readyEscalation) kinds.push("ready");
    }
    if (rank === 0 && needsConfirmation(b)) kinds.push("unconfirmed");
    if (rank >= 1 && isPaymentOutstanding(b)) kinds.push("payment");
    if (kinds.length === 0) continue;
    const ordered = ATTENTION_PRIORITY.filter((k) => kinds.includes(k));
    items.push({
      booking: b,
      kinds: ordered,
      primary: ordered[0],
      overdueMinutes: minutesOverdue(b, now),
      waitMinutes: collectionWaitMinutes(b, now),
    });
  }
  const rankOf = (k: AttentionKind) => ATTENTION_PRIORITY.indexOf(k);
  return items.sort((a, c) => {
    if (a.primary !== c.primary) return rankOf(a.primary) - rankOf(c.primary);
    if (a.primary === "late") return c.overdueMinutes - a.overdueMinutes;
    if (a.primary === "ready") return (c.waitMinutes ?? -1) - (a.waitMinutes ?? -1);
    return 0;
  });
}

export interface ArrivalGroup {
  slot: string;
  slotMinutes: number;
  isPast: boolean;
  isCurrent: boolean;
  bookings: Booking[];
}

/** Today's bookings grouped by slot (chronological), cancellations dropped. */
export function buildArrivalsBySlot(bookings: Booking[], activeSlots: string[], now: Date): ArrivalGroup[] {
  const nowMins = londonNowParts(now).minutesOfDay;
  const bySlot = new Map<string, Booking[]>();
  for (const b of bookings) {
    if (!isCountableBooking(b) || !b.slot) continue;
    const list = bySlot.get(b.slot) ?? [];
    list.push(b);
    bySlot.set(b.slot, list);
  }
  const slots = activeSlots.filter((s) => bySlot.has(s));
  for (const s of bySlot.keys()) if (!slots.includes(s)) slots.push(s); // off-grid safety
  return slots
    .map((slot) => {
      const slotMinutes = slotToMinutes(slot);
      const isPast = slotMinutes + SLOT_LENGTH_MINUTES <= nowMins;
      const isCurrent = !isPast && slotMinutes <= nowMins && nowMins < slotMinutes + SLOT_LENGTH_MINUTES;
      return { slot, slotMinutes, isPast, isCurrent, bookings: bySlot.get(slot) as Booking[] };
    })
    .sort((a, b) => a.slotMinutes - b.slotMinutes);
}

/** Signed minutes until the slot starts on the London clock (negative = started). */
export function minutesUntilSlot(slot: string, now: Date): number {
  return slotToMinutes(slot) - londonNowParts(now).minutesOfDay;
}

/** Every booking in an arrival group has at least arrived (nothing left to greet). */
export function isGroupSettled(group: ArrivalGroup): boolean {
  return group.bookings.every((b) => statusRank(b.status) >= 1);
}

export interface NextUpSplit {
  /** The soonest group still expecting a dog — the "who's next" card. */
  next: ArrivalGroup | null;
  /** Later groups still expecting at least one dog, chronological. */
  upcoming: ArrivalGroup[];
  /**
   * Groups with nothing left to greet: fully arrived, or past their slot
   * (a past group's still-Booked dogs are already surfaced as late arrivals).
   */
  earlier: ArrivalGroup[];
}

/**
 * Split the chronological slot groups into the "Next up" queue and the
 * collapsed "Earlier today" tail, so completed arrivals never compete with
 * live ones.
 */
export function splitArrivalGroups(groups: ArrivalGroup[]): NextUpSplit {
  const live: ArrivalGroup[] = [];
  const earlier: ArrivalGroup[] = [];
  for (const g of groups) {
    if (g.isPast || isGroupSettled(g)) earlier.push(g);
    else live.push(g);
  }
  return { next: live[0] ?? null, upcoming: live.slice(1), earlier };
}

export interface InSalonEntry {
  booking: Booking;
  /** Minutes since check-in (null when checked_in_at wasn't stamped). */
  inSalonMinutes: number | null;
}

/**
 * Dogs physically in the salon and still being worked on (Checked in /
 * In bath) — the Ready queue is its own list. Longest in first.
 */
export function buildInSalonList(bookings: Booking[], now: Date): InSalonEntry[] {
  return bookings
    .filter((b) => {
      const rank = statusRank(b.status);
      return isCountableBooking(b) && (rank === 1 || rank === 2);
    })
    .map((b) => ({ booking: b, inSalonMinutes: timeInSalonMinutes(b, now) }))
    .sort((a, b) => (b.inSalonMinutes ?? -1) - (a.inSalonMinutes ?? -1));
}

export interface CollectionEntry {
  booking: Booking;
  waitMinutes: number | null;
}

/** Dogs marked Ready and not yet collected, longest wait first. */
export function buildCollectionQueue(bookings: Booking[], now: Date): CollectionEntry[] {
  return bookings
    .filter((b) => isCountableBooking(b) && b.status === BOOKING_STATUS.READY_FOR_PICKUP)
    .map((b) => ({ booking: b, waitMinutes: collectionWaitMinutes(b, now) }))
    .sort((a, b) => (b.waitMinutes ?? -1) - (a.waitMinutes ?? -1));
}

export interface PaymentEntry {
  booking: Booking;
  payment: PaymentInfo;
}

/**
 * Non-cancelled bookings that still owe money, biggest balance first. The
 * amount uses default pricing for ordering; the UI recomputes with the dog's
 * custom price for display.
 */
export function buildPaymentsList(bookings: Booking[]): PaymentEntry[] {
  return bookings
    .filter(isPaymentOutstanding)
    .map((b) => ({ booking: b, payment: paymentState(b) }))
    .sort((a, b) => (b.payment.amountDue ?? 0) - (a.payment.amountDue ?? 0));
}
