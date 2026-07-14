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
  paymentMethodLabel,
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
  priceOverride?: number | null;
  paymentMethod?: string | null;
  paidAmount?: number | null;
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

/** Europe/London offset from UTC (ms) at a given instant: 0 in GMT, +1h in BST. */
function londonOffsetMs(instant: Date): number {
  const p = londonNowParts(instant);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const instMinute = Math.floor(instant.getTime() / 60000) * 60000;
  return wallAsUtc - instMinute;
}

/**
 * Convert a Europe/London wall-clock date + time ("YYYY-MM-DD", "HH:MM") to a
 * UTC epoch (ms). Booking dates/slots are stored as London wall-clock, so any
 * comparison against a real UTC instant (e.g. a booking_events timestamptz)
 * must go through this rather than naively appending "Z" — which would be an
 * hour out for the ~7 months of British Summer Time.
 */
export function londonWallClockToUtcMs(dateStr: string, timeHHMM: string): number {
  const naiveUtc = Date.parse(`${dateStr}T${timeHHMM}:00Z`);
  if (Number.isNaN(naiveUtc)) return NaN;
  // Slots are mid-morning, never at the 01:00–02:00 DST fold, so the offset at
  // the naive instant equals the offset at the true instant.
  return naiveUtc - londonOffsetMs(new Date(naiveUtc));
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
    priceOverride: b.priceOverride ?? null,
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

// ---- Availability view (the "Manage availability" modal) ---------------------

export interface AvailabilityRow {
  slot: string;
  slotMinutes: number;
  /** Bookable seats left in this slot (size-agnostic). */
  seatsFree: number;
  /** Staff have opened this slot for same-day online booking. */
  isOnline: boolean;
  /** Online AND still 30+ minutes before the slot — a customer could book it now. */
  customerReachable: boolean;
  /** Sizes that physically fit this slot right now (small/medium indistinguishable). */
  sizes: { small: boolean; medium: boolean; large: boolean };
}

export interface AvailabilityView {
  /** Unbooked (seats free), non-past slots, chronological. */
  rows: AvailabilityRow[];
  /** Total unbooked slots shown (= rows.length). */
  unbookedSlots: number;
  /** How many of those slots are open for online booking. */
  onlineCount: number;
  /** Earliest slot a customer could book online right now (before the cutoff). */
  nextOnlineSlot: string | null;
}

/**
 * Turn the slot opportunities into the availability modal's rows + headline
 * counts. Every count is derived from the same rows it shows, so they can never
 * disagree. "Online" is the whole-slot same-day flag (`immediate_slots`); size
 * fit comes from the capacity engine, never re-derived.
 */
export function buildAvailabilityView(
  opportunities: SlotOpportunity[],
  immediateSlots: string[] | Set<string>,
): AvailabilityView {
  const immediateSet = immediateSlots instanceof Set ? immediateSlots : new Set(immediateSlots);
  const rows: AvailabilityRow[] = opportunities
    .filter((o) => !o.isPast && o.seatsFree > 0)
    .sort((a, b) => a.slotMinutes - b.slotMinutes)
    .map((o) => ({
      slot: o.slot,
      slotMinutes: o.slotMinutes,
      seatsFree: o.seatsFree,
      isOnline: immediateSet.has(o.slot),
      customerReachable: o.customerReachable,
      sizes: { small: true, medium: true, large: o.largeDogEligible },
    }));
  const nextOnline = rows.find((r) => r.customerReachable);
  return {
    rows,
    unbookedSlots: rows.length,
    onlineCount: rows.filter((r) => r.isOnline).length,
    nextOnlineSlot: nextOnline ? nextOnline.slot : null,
  };
}

// ---- Day summary -------------------------------------------------------------

export interface DaySummary {
  total: number;
  expected: number;
  arrived: number;
  onSite: number;
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
  let onSite = 0;
  let ready = 0;
  let collected = 0;
  let unpaidCount = 0;
  for (const b of countable) {
    // A countable row with a missing/unknown status renders as "Booked" in the
    // feed (STAGE_BY_RANK fallback), so the summary must count it the same way.
    const rank = Math.max(0, statusRank(b.status));
    if (rank === 0) expected++;
    if (rank >= 1) arrived++;
    if (rank >= 1 && b.status !== BOOKING_STATUS.COMPLETED) onSite++;
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
    onSite,
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

/** The collection/payments queues with higher-priority duplicates removed. */
export interface ConcernSections {
  collection: CollectionEntry[];
  payments: PaymentEntry[];
}

/**
 * One card per booking across the concern sections. A booking already shown
 * in "Needs attention now" (highest priority) drops out of the collection
 * queue, and anything shown in either drops out of payments — the facts a
 * dropped row carried fold into the surviving card's status line instead.
 */
export function dedupeConcernSections(
  attention: AttentionItem[],
  collection: CollectionEntry[],
  payments: PaymentEntry[],
): ConcernSections {
  const shown = new Set(attention.map((i) => i.booking.id));
  const dedupedCollection = collection.filter((e) => !shown.has(e.booking.id));
  for (const e of dedupedCollection) shown.add(e.booking.id);
  return {
    collection: dedupedCollection,
    payments: payments.filter((e) => !shown.has(e.booking.id)),
  };
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

// ---- Unified booking feed (one card per booking) -----------------------------

/** A dog's lifecycle stage, collapsed from its status rank. */
export type FeedStage = "booked" | "inSalon" | "ready" | "collected";

const STAGE_BY_RANK: Record<number, FeedStage> = {
  0: "booked",
  1: "inSalon",
  2: "inSalon",
  3: "ready",
  4: "collected",
};

/**
 * One entry per today booking for the single time-ordered feed. Every reason a
 * booking might need attention is folded onto its one card via these flags, so
 * the same booking never appears in two lists. `needsAction` mirrors exactly
 * the membership rule of `buildImmediateAttention` (late / escalated-ready /
 * unconfirmed / owes-after-arrival), so the header's "N need action" count and
 * the cards flagged in the feed always agree.
 */
export interface TodayFeedEntry {
  booking: Booking;
  /** Minutes-of-day of the slot (Infinity for a slot-less row → sorts last). */
  slotMinutes: number;
  stage: FeedStage;
  /** The soonest still-to-arrive, not-late booking — highlighted as "Next". */
  isNext: boolean;
  isLate: boolean;
  isUnconfirmed: boolean;
  /** Still owes money (any non-paid, non-cancelled booking). */
  owes: boolean;
  /** On the act-now queue — drives the "Needs action" chip + header count. */
  needsAction: boolean;
  overdueMinutes: number;
  /** Minutes waiting to be collected (only meaningful when stage === "ready"). */
  waitMinutes: number | null;
}

/**
 * Build the single, time-ordered booking feed. Cancelled bookings are dropped;
 * everything else is sorted by appointment time (slot-less rows last) and the
 * soonest not-yet-arrived, not-late booking is flagged `isNext`.
 */
export function buildTodayFeed(
  bookings: Booking[],
  now: Date,
  opts: { graceMinutes?: number; readyEscalationMinutes?: number } = {},
): TodayFeedEntry[] {
  const grace = opts.graceMinutes ?? LATE_ARRIVAL_GRACE_MINUTES;
  const readyEscalation = opts.readyEscalationMinutes ?? READY_ESCALATION_MINUTES;
  const entries: TodayFeedEntry[] = [];
  for (const b of bookings) {
    if (!isCountableBooking(b)) continue;
    const rank = statusRank(b.status);
    const stage = STAGE_BY_RANK[rank] ?? "booked";
    const isLate = isLateArrival(b, now, grace);
    const isUnconfirmed = rank === 0 && needsConfirmation(b);
    const owes = isPaymentOutstanding(b);
    const waitMinutes = stage === "ready" ? collectionWaitMinutes(b, now) : null;
    // A freshly-Ready dog is calm; it only "needs action" once it has waited
    // (or has no ready_at stamp to judge by — legacy rows surface, not hide).
    const readyNeedsAction = stage === "ready" && (waitMinutes == null || waitMinutes >= readyEscalation);
    const needsAction = isLate || readyNeedsAction || isUnconfirmed || (rank >= 1 && owes);
    entries.push({
      booking: b,
      slotMinutes: b.slot ? slotToMinutes(b.slot) : Number.POSITIVE_INFINITY,
      stage,
      isNext: false,
      isLate,
      isUnconfirmed,
      owes,
      needsAction,
      overdueMinutes: minutesOverdue(b, now),
      waitMinutes,
    });
  }
  // Chronological; Array.sort is stable so same-slot rows keep input order.
  entries.sort((a, c) => a.slotMinutes - c.slotMinutes);
  const nextIdx = entries.findIndex((e) => e.stage === "booked" && !e.isLate);
  if (nextIdx >= 0) entries[nextIdx].isNext = true;
  return entries;
}

// ---- Slot-grouped diary (morning-brief layout) --------------------------------

/** One diary group: a slot's entries, or the trailing "Unscheduled" bucket. */
export interface FeedSlotGroup {
  /** The slot time, or null for the Unscheduled bucket. */
  slot: string | null;
  /** Display label — the slot time, or "Unscheduled". */
  label: string;
  /** Minutes-of-day for ordering (Infinity for Unscheduled). */
  slotMinutes: number;
  entries: TodayFeedEntry[];
}

/**
 * Group an already-chronological feed by slot for the brief-style diary.
 * A missing or unparseable slot must never hide a dog: those rows collect
 * in a final "Unscheduled" group instead.
 */
export function groupFeedBySlot(entries: TodayFeedEntry[]): FeedSlotGroup[] {
  const groups: FeedSlotGroup[] = [];
  const index = new Map<string, FeedSlotGroup>();
  const unscheduled: FeedSlotGroup = {
    slot: null, label: "Unscheduled", slotMinutes: Number.POSITIVE_INFINITY, entries: [],
  };
  for (const e of entries) {
    const slot = e.booking.slot;
    if (!slot || !Number.isFinite(slotToMinutes(slot))) {
      unscheduled.entries.push(e);
      continue;
    }
    let g = index.get(slot);
    if (!g) {
      g = { slot, label: slot, slotMinutes: slotToMinutes(slot), entries: [] };
      index.set(slot, g);
      groups.push(g);
    }
    g.entries.push(e);
  }
  groups.sort((a, b) => a.slotMinutes - b.slotMinutes);
  if (unscheduled.entries.length > 0) groups.push(unscheduled);
  return groups;
}

/**
 * Feed entries for a FUTURE day's read-only brief. Built without `now` on
 * purpose: a future diary has no overdue, no waiting, no "next", no owed
 * balance — none of that exists yet, so every time-relative flag is hard
 * zero. (See the spec's "no time-relative state on future days".)
 */
export function buildFutureDayFeed(bookings: Booking[]): TodayFeedEntry[] {
  const entries: TodayFeedEntry[] = [];
  for (const b of bookings) {
    if (!isCountableBooking(b)) continue;
    entries.push({
      booking: b,
      slotMinutes: b.slot && Number.isFinite(slotToMinutes(b.slot))
        ? slotToMinutes(b.slot)
        : Number.POSITIVE_INFINITY,
      stage: STAGE_BY_RANK[Math.max(0, statusRank(b.status))] ?? "booked",
      isNext: false,
      isLate: false,
      isUnconfirmed: false,
      owes: false,
      needsAction: false,
      overdueMinutes: 0,
      waitMinutes: null,
    });
  }
  entries.sort((a, c) => a.slotMinutes - c.slotMinutes);
  return entries;
}

/**
 * Dogs-per-owner across the displayed feed, keyed by the owner's stable
 * human id (via the dogs map). Unresolvable dogs are skipped — the
 * "two dogs, one owner" chip must never match on a display-name string.
 */
export function countDogsPerOwner(
  entries: TodayFeedEntry[],
  dogs: Record<string, Dog> | null,
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!dogs) return counts;
  for (const e of entries) {
    const dogId = e.booking._dogId;
    const ownerId = dogId ? dogs[dogId]?._humanId : null;
    if (!ownerId) continue;
    counts[ownerId] = (counts[ownerId] ?? 0) + 1;
  }
  return counts;
}

// ---- Operational priority (one rule for rails, labels, actions, Now strip) ----

/**
 * A feed entry's single highest-priority operational state, most urgent first.
 * This is THE priority order — the card's accent rail, its status label, its
 * primary action and the sticky Now strip all read from it, so they can never
 * disagree about what matters most on a booking.
 */
export type OpStatusKind =
  | "overdue" // still Booked, slot passed + grace
  | "paymentDue" // collected (or gone) but still owes — money at risk
  | "unconfirmed" // reminder sent, no reply, not yet arrived
  | "readyWaiting" // ready and waiting long enough to chase
  | "ready" // freshly ready — calm
  | "inSalon" // checked in / in bath
  | "next" // the next expected arrival
  | "upcoming" // booked, later today
  | "collected"; // done — fades out

/** Colour token, not a class: components map tones to the brand palette. */
export type OpTone = "coral" | "amber" | "emerald" | "cyan" | "teal" | "neutral" | "muted";

export interface OpStatus {
  kind: OpStatusKind;
  tone: OpTone;
  /** Short human status, e.g. "Late" / "Needs confirmation" — never colour alone. */
  label: string;
  /** Lower = more urgent. Shared by the feed chips and the Now strip. */
  urgency: number;
}

const OP_STATUS: Record<OpStatusKind, Omit<OpStatus, "kind">> = {
  overdue: { tone: "coral", label: "Late", urgency: 0 },
  paymentDue: { tone: "coral", label: "Payment due", urgency: 1 },
  unconfirmed: { tone: "amber", label: "Needs confirmation", urgency: 2 },
  readyWaiting: { tone: "amber", label: "Ready — chase collection", urgency: 3 },
  ready: { tone: "emerald", label: "Ready to collect", urgency: 4 },
  inSalon: { tone: "cyan", label: "In salon", urgency: 5 },
  next: { tone: "teal", label: "Next", urgency: 6 },
  upcoming: { tone: "neutral", label: "Booked", urgency: 7 },
  collected: { tone: "muted", label: "Collected", urgency: 8 },
};

function opKindOf(entry: TodayFeedEntry): OpStatusKind {
  if (entry.isLate) return "overdue";
  if (entry.stage === "collected") return entry.owes ? "paymentDue" : "collected";
  if (entry.isUnconfirmed) return "unconfirmed";
  if (entry.stage === "ready") return entry.needsAction ? "readyWaiting" : "ready";
  if (entry.stage === "inSalon") return "inSalon";
  return entry.isNext ? "next" : "upcoming";
}

/** The one place a booking's operational priority is decided. */
export function entryOpStatus(entry: TodayFeedEntry): OpStatus {
  const kind = opKindOf(entry);
  return { kind, ...OP_STATUS[kind] };
}

// ---- The sticky "Now / Up next" strip -----------------------------------------

/** A booked dog counts as "due soon" this many minutes before its slot. */
export const DUE_SOON_MINUTES = 45;

export type NowReason = "urgent" | "dueSoon" | "active" | "upcoming" | null;

export interface NowNextSelection {
  /** The most operationally relevant booking right now (null = nothing live). */
  now: TodayFeedEntry | null;
  nowReason: NowReason;
  /** The next expected arrival after `now` — an unconfirmed one wins. */
  next: TodayFeedEntry | null;
  /** Dogs currently waiting to be collected (drives the calm empty state). */
  readyCount: number;
}

/**
 * Pick the strip's NOW and UP NEXT bookings from the feed.
 *
 * NOW, in order: (1) the most urgent actionable entry (late → unpaid-collected
 * → unconfirmed-due-soon → ready-waiting, ties broken by most overdue /
 * longest wait); (2) the next arrival once it's due within DUE_SOON_MINUTES;
 * (3) the calm live booking — a ready dog first, else the dog longest in the
 * salon; (4) with nothing live at all, the day's first still-expected arrival
 * (an empty NOW while arrivals are still scheduled would read as a finished
 * day). Collected dogs never come back as NOW unless they still owe.
 *
 * UP NEXT: the earliest still-expected arrival after NOW; if any of those
 * still needs confirmation the earliest unconfirmed one wins (it has an
 * action worth taking).
 */
export function selectNowNext(entries: TodayFeedEntry[], now: Date): NowNextSelection {
  const live = entries.filter((e) => entryOpStatus(e).kind !== "collected");
  const readyCount = entries.filter((e) => e.stage === "ready").length;

  // 1) Urgent: anything the attention queue would rank, most urgent first.
  const urgentKinds: OpStatusKind[] = ["overdue", "paymentDue", "unconfirmed", "readyWaiting"];
  const urgent = live
    .filter((e) => urgentKinds.includes(entryOpStatus(e).kind))
    .sort((a, b) => {
      const ua = entryOpStatus(a).urgency;
      const ub = entryOpStatus(b).urgency;
      if (ua !== ub) return ua - ub;
      if (a.isLate) return b.overdueMinutes - a.overdueMinutes;
      if (a.stage === "ready") return (b.waitMinutes ?? -1) - (a.waitMinutes ?? -1);
      return a.slotMinutes - b.slotMinutes;
    });

  const upcoming = live
    .filter((e) => e.stage === "booked" && !e.isLate)
    .sort((a, b) => a.slotMinutes - b.slotMinutes);

  let nowEntry: TodayFeedEntry | null = null;
  let nowReason: NowReason = null;

  if (urgent.length > 0) {
    nowEntry = urgent[0];
    nowReason = "urgent";
  } else {
    // 2) Due soon: the next arrival, once it's close enough to matter.
    const nowMins = londonNowParts(now).minutesOfDay;
    const dueSoon = upcoming.find((e) => e.slotMinutes - nowMins <= DUE_SOON_MINUTES);
    if (dueSoon) {
      nowEntry = dueSoon;
      nowReason = "dueSoon";
    } else {
      // 3) Active: a ready dog beats an in-progress one (it has a next step).
      const active =
        live.find((e) => e.stage === "ready") ??
        live
          .filter((e) => e.stage === "inSalon")
          .sort((a, b) => a.slotMinutes - b.slotMinutes)[0];
      if (active) {
        nowEntry = active;
        nowReason = "active";
      } else if (upcoming.length > 0) {
        // 4) A quiet moment before the day starts — the first arrival IS "now".
        nowEntry = upcoming[0];
        nowReason = "upcoming";
      }
    }
  }

  const laterArrivals = upcoming.filter((e) => e !== nowEntry);
  const nextEntry = laterArrivals.find((e) => e.isUnconfirmed) ?? laterArrivals[0] ?? null;

  return { now: nowEntry, nowReason, next: nextEntry, readyCount };
}

// ---- Takings by method (improvement #3 — till view) --------------------------

export interface TakingsByMethod {
  /** Total recorded-as-paid amount across the given bookings. */
  total: number;
  /** Number of Paid-in-Full bookings counted. */
  count: number;
  byMethod: Array<{ method: string; label: string; amount: number; count: number }>;
}

/**
 * Sum today's recorded takings, grouped by payment method. Uses the recorded
 * paid_amount where present, else the computed appointment total (legacy paid
 * bookings have no recorded amount). Bookings with no recorded method fall into
 * an "unrecorded" bucket. Cancelled bookings are excluded.
 */
export function buildTakingsByMethod(bookings: TodayBooking[]): TakingsByMethod {
  const paid = bookings.filter((b) => (b.payment || "") === "Paid in Full" && isCountableBooking(b));
  const acc: Record<string, { amount: number; count: number }> = {};
  let total = 0;
  for (const b of paid) {
    const amount =
      b.paidAmount != null
        ? b.paidAmount
        : computeBookingPricing({
            service: b.service ?? "",
            size: b.size ?? DOG_SIZE.SMALL,
            addons: b.addons ?? null,
            payment: b.payment ?? null,
            priceOverride: b.priceOverride ?? null,
          }).subtotal;
    const method = b.paymentMethod || "unrecorded";
    (acc[method] ||= { amount: 0, count: 0 });
    acc[method].amount += amount;
    acc[method].count++;
    total += amount;
  }
  const byMethod = Object.entries(acc)
    .map(([method, v]) => ({
      method,
      label: method === "unrecorded" ? "Not recorded" : paymentMethodLabel(method),
      amount: v.amount,
      count: v.count,
    }))
    .sort((a, b) => b.amount - a.amount);
  return { total, count: paid.length, byMethod };
}
