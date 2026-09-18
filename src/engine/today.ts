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
import { computeBookingPricing, getDogByIdOrName, isCountableBooking } from "./bookingRules";
import type { PricingConfig } from "./bookingRules";
import { computeRevenue } from "./pricing";
import {
  BOOKING_STATUS,
  DOG_SIZE,
  IMMEDIATE_CUTOFF_MINUTES,
  isNoShowReason,
  LATE_ARRIVAL_GRACE_MINUTES,
  paymentMethodLabel,
  STATUS_RANK,
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
  /** Needed by callers that key on a booking — the takings rows, for one. */
  id?: string;
  completedAt?: string | null;
  _bookingDate?: string;
  _dogId?: string | null;
  dogName?: string;
}

// ---- Europe/London wall clock (Re-exported from londonTime.ts) ---------------

import {
  londonNowParts,
  londonDateStr,
  londonOffsetMs,
  londonWallClockToUtcMs,
} from "./londonTime";

export {
  londonNowParts,
  londonDateStr,
  londonOffsetMs,
  londonWallClockToUtcMs,
};
export type { LondonParts } from "./londonTime";

// ---- Status ranking ----------------------------------------------------------

/**
 * Position of a status along the linear progression; terminal/unknown = -1.
 *
 * Re-exported from the canonical STATUS_RANK rather than restated, so adding
 * or reordering a lifecycle status is a one-file change.
 */
export const BOOKING_STATUS_RANK: Record<string, number> = STATUS_RANK;

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
  /**
   * The base price before add-ons (£). This is what `price_override` holds, so
   * it is also the only figure an editor may write back: writing a subtotal
   * into the override would add the add-ons a second time on the next read.
   */
  basePrice: number;
  /** Add-ons total (£), stated separately so the arithmetic is visible. */
  addonsTotal: number;
}

export function paymentState(
  b: TodayBooking,
  customPrice: number | null = null,
  configPricing?: PricingConfig,
): PaymentInfo {
  const pricing = computeBookingPricing({
    service: b.service ?? "",
    size: b.size ?? DOG_SIZE.SMALL,
    addons: b.addons ?? null,
    payment: b.payment ?? null,
    depositAmount: b.depositAmount ?? null,
    priceOverride: b.priceOverride ?? null,
    customPrice,
    configPricing,
  });
  const raw = (b.payment || "Due at Pick-up").trim();
  const money = { subtotal: pricing.subtotal, basePrice: pricing.basePrice, addonsTotal: pricing.addonsTotal };
  if (raw === "Paid in Full") {
    return { kind: "paid", label: "Paid", amountDue: 0, depositPaid: 0, ...money };
  }
  if (raw === "Deposit Paid") {
    return { kind: "deposit", label: "Deposit paid", amountDue: pricing.amountDue, depositPaid: pricing.depositPaid, ...money };
  }
  if (raw === "Due at Pick-up") {
    return { kind: "due", label: "Balance due", amountDue: pricing.amountDue, depositPaid: 0, ...money };
  }
  return { kind: "other", label: raw, amountDue: null, depositPaid: 0, ...money };
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
  configPricing?: PricingConfig,
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
    if (b.status === BOOKING_STATUS.READY_FOR_COLLECTION) ready++;
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
    expectedRevenue: computeRevenue(countable as unknown as Booking[], dogs, configPricing),
    collectedRevenue: computeRevenue(paid as unknown as Booking[], dogs, configPricing),
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
    if (b.status === BOOKING_STATUS.READY_FOR_COLLECTION) {
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
    .filter((b) => isCountableBooking(b) && b.status === BOOKING_STATUS.READY_FOR_COLLECTION)
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

/**
 * A dog's lifecycle stage, collapsed from its status rank.
 *
 * `noShow` is off the progression and is the ONLY stage that is not derived
 * from `STAGE_BY_RANK`. It exists so that a no-show, which is a Cancelled
 * booking rather than a status of its own, can never be mistaken for a Booked
 * one by a stage check. Every existing consumer tests for a specific stage, so
 * a `noShow` entry naturally falls out of all of them.
 */
export type FeedStage = "booked" | "inSalon" | "ready" | "collected" | "noShow";
export type NeedActionReason = "late" | "confirmation" | "collection" | "payment";

const STAGE_BY_RANK: Record<number, FeedStage> = {
  0: "booked",
  1: "inSalon",
  2: "inSalon",
  3: "ready",
  4: "collected",
};

/**
 * A booking the dog did not turn up for.
 *
 * Now simply `status === 'No-show'`. The second arm is PRE-MIGRATION
 * compatibility only: before 20260919090000 a no-show was a Cancelled row
 * carrying `cancel_reason = 'No-show'`, and a row that escaped conversion
 * should still read as a no-show rather than a plain cancellation.
 *
 * Deliberately NOT folded into `isCountableBooking`: that predicate governs
 * revenue, capacity, deposits and every report, and a no-show must stay
 * uncountable in all of them. This is only about whether the booking is
 * VISIBLE on a day surface that has opted in.
 */
function isConfirmedNoShow(b: { status?: string | null; cancelReason?: string | null }): boolean {
  if (b.status === BOOKING_STATUS.NO_SHOW) return true;
  return b.status === BOOKING_STATUS.CANCELLED && isNoShowReason(b.cancelReason);
}

/**
 * Should this booking appear in a day feed?
 *
 * Off by default, which is the entire point: every existing caller keeps the
 * behaviour it has today, where a cancelled booking simply is not there.
 */
function isVisibleInFeed(b: Booking, includeNoShows: boolean): boolean {
  return isCountableBooking(b) || (includeNoShows && isConfirmedNoShow(b));
}

/** Options shared by the two day-feed builders. */
export interface FeedVisibilityOptions {
  /**
   * Include staff-confirmed no-shows (Cancelled + `cancel_reason = 'No-show'`).
   *
   * Default false. The day stack opts in because a dog that did not turn up is
   * part of the day's story and staff need it on screen; nothing else does,
   * and an ordinary cancellation stays out either way.
   */
  includeNoShows?: boolean;
}

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
  /** Exact reasons behind `needsAction`, shared by the count and row-level UI. */
  actionReasons: NeedActionReason[];
  overdueMinutes: number;
  /** Minutes waiting to be collected (only meaningful when stage === "ready"). */
  waitMinutes: number | null;
}

/**
 * Build the single, time-ordered booking feed. Cancelled bookings are dropped
 * (unless `includeNoShows` opts a no-show back in); everything else is sorted
 * by appointment time (slot-less rows last) and the soonest not-yet-arrived,
 * not-late booking is flagged `isNext`.
 */
export function buildTodayFeed(
  bookings: Booking[],
  now: Date,
  opts: {
    graceMinutes?: number;
    readyEscalationMinutes?: number;
  } & FeedVisibilityOptions = {},
): TodayFeedEntry[] {
  const grace = opts.graceMinutes ?? LATE_ARRIVAL_GRACE_MINUTES;
  const readyEscalation = opts.readyEscalationMinutes ?? READY_ESCALATION_MINUTES;
  const includeNoShows = opts.includeNoShows ?? false;
  const entries: TodayFeedEntry[] = [];
  for (const b of bookings) {
    if (!isVisibleInFeed(b, includeNoShows)) continue;
    const rank = statusRank(b.status);
    // A no-show is off the progression, so it takes its stage directly rather
    // than through the rank table (where Cancelled ranks -1 and would fall
    // back to "booked" — the one stage it must never claim, since that is what
    // the "Next" scan and the late-arrival lists key on).
    const stage: FeedStage = isConfirmedNoShow(b) ? "noShow" : STAGE_BY_RANK[rank] ?? "booked";
    const isLate = isLateArrival(b, now, grace);
    const isUnconfirmed = rank === 0 && needsConfirmation(b);
    const owes = isPaymentOutstanding(b);
    const waitMinutes = stage === "ready" ? collectionWaitMinutes(b, now) : null;
    // A freshly-Ready dog is calm; it only "needs action" once it has waited
    // (or has no ready_at stamp to judge by — legacy rows surface, not hide).
    const readyNeedsAction = stage === "ready" && (waitMinutes == null || waitMinutes >= readyEscalation);
    const actionReasons: NeedActionReason[] = [];
    if (isLate) actionReasons.push("late");
    if (isUnconfirmed) actionReasons.push("confirmation");
    if (readyNeedsAction) actionReasons.push("collection");
    if (rank >= 1 && owes) actionReasons.push("payment");
    entries.push({
      booking: b,
      slotMinutes: b.slot ? slotToMinutes(b.slot) : Number.POSITIVE_INFINITY,
      stage,
      isNext: false,
      isLate,
      isUnconfirmed,
      owes,
      needsAction: actionReasons.length > 0,
      actionReasons,
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
export function buildFutureDayFeed(
  bookings: Booking[],
  opts: FeedVisibilityOptions = {},
): TodayFeedEntry[] {
  const includeNoShows = opts.includeNoShows ?? false;
  const entries: TodayFeedEntry[] = [];
  for (const b of bookings) {
    if (!isVisibleInFeed(b, includeNoShows)) continue;
    entries.push({
      booking: b,
      slotMinutes: b.slot && Number.isFinite(slotToMinutes(b.slot))
        ? slotToMinutes(b.slot)
        : Number.POSITIVE_INFINITY,
      stage: isConfirmedNoShow(b)
        ? "noShow"
        : STAGE_BY_RANK[Math.max(0, statusRank(b.status))] ?? "booked",
      isNext: false,
      isLate: false,
      isUnconfirmed: false,
      owes: false,
      needsAction: false,
      actionReasons: [],
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

// ---- Act-now counts (the header's itemised status sentence) ------------------

/**
 * The header's "act now" numbers, itemised so the count defines itself:
 * `1 late · 1 to confirm · 1 waiting` instead of an opaque "3 need action".
 * Money deliberately does NOT appear here — a dog that will pay at pick-up is
 * not a task while it is mid-groom, so owed money is a separate ambient fact
 * (`£N to collect`) and the act-now numbers can only FALL as work gets done.
 * `dogs` counts distinct entries (one dog late AND unconfirmed is one dog);
 * the per-reason counts are honest per-reason tallies.
 */
export interface NowCounts {
  late: number;
  toConfirm: number;
  waiting: number;
  /** Distinct entries carrying at least one act-now reason. */
  dogs: number;
}

const NOW_REASONS: NeedActionReason[] = ["late", "confirmation", "collection"];

export function buildNowCounts(entries: TodayFeedEntry[]): NowCounts {
  let late = 0;
  let toConfirm = 0;
  let waiting = 0;
  let dogs = 0;
  for (const e of entries) {
    if (e.actionReasons.includes("late")) late++;
    if (e.actionReasons.includes("confirmation")) toConfirm++;
    if (e.actionReasons.includes("collection")) waiting++;
    if (NOW_REASONS.some((reason) => e.actionReasons.includes(reason))) dogs++;
  }
  return { late, toConfirm, waiting, dogs };
}

// ---- Live focus and context --------------------------------------------------

function validTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareSlotThenId(a: TodayFeedEntry, b: TodayFeedEntry): number {
  const aSlot = Number.isFinite(a.slotMinutes) ? a.slotMinutes : Number.POSITIVE_INFINITY;
  const bSlot = Number.isFinite(b.slotMinutes) ? b.slotMinutes : Number.POSITIVE_INFINITY;
  if (aSlot !== bSlot) return aSlot - bSlot;
  return String(a.booking.id ?? "").localeCompare(String(b.booking.id ?? ""));
}

export function selectLiveFocus(entries: TodayFeedEntry[]): TodayFeedEntry | null {
  const overdue = entries
    .filter((entry) => entry.stage === "booked" && entry.isLate)
    .sort(compareSlotThenId);
  if (overdue[0]) return overdue[0];

  const upcoming = entries
    .filter((entry) => entry.stage === "booked" && !entry.isLate)
    .sort(compareSlotThenId);
  if (upcoming[0]) return upcoming[0];

  const ready = entries
    .filter((entry) => entry.stage === "ready")
    .sort((a, b) => {
      const waitDifference = (b.waitMinutes ?? 0) - (a.waitMinutes ?? 0);
      return waitDifference || compareSlotThenId(a, b);
    });
  if (ready[0]) return ready[0];

  return entries
    .filter((entry) => entry.stage === "inSalon")
    .map((entry) => ({
      entry,
      checkedInAt: validTimestamp(entry.booking.checkedInAt),
    }))
    .sort((a, b) => {
      if (a.checkedInAt !== null && b.checkedInAt === null) return -1;
      if (a.checkedInAt === null && b.checkedInAt !== null) return 1;
      if (
        a.checkedInAt !== null &&
        b.checkedInAt !== null &&
        a.checkedInAt !== b.checkedInAt
      ) {
        return a.checkedInAt - b.checkedInAt;
      }
      return compareSlotThenId(a.entry, b.entry);
    })[0]?.entry ?? null;
}

export interface LiveFocusContext {
  text: string;
  tone: "live" | "overdue";
  ariaLabel: string;
}

/**
 * The one compact duration grammar for the whole Daily Brief: `8 min`,
 * `1 hr`, `1 hr 13 min`, `2 hrs 5 min`. Hours pluralise normally ("1 hr" /
 * "2 hrs"); minutes never do — "min" is a fixed unit abbreviation here, not a
 * countable noun. Every duration string in the brief (slot countdowns,
 * lateness, on-site/ready wait, live-focus text, checked-in-ago) must go
 * through this function rather than assembling its own "mins"/"minutes".
 */
export function formatDuration(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole} min`;
  const hours = Math.floor(whole / 60);
  const remainder = whole % 60;
  const hourLabel = `${hours} ${hours === 1 ? "hr" : "hrs"}`;
  return remainder ? `${hourLabel} ${remainder} min` : hourLabel;
}

function focusContext(dog: string, text: string, tone: LiveFocusContext["tone"]): LiveFocusContext {
  return { text, tone, ariaLabel: `${dog} — ${text.toLowerCase()}` };
}

function checkedInCopy(checkedInAt: string | null | undefined, now: Date): string {
  const checkedInTime = validTimestamp(checkedInAt);
  if (checkedInTime === null) return "Arrived";
  const elapsed = Math.max(0, Math.floor((now.getTime() - checkedInTime) / 60_000));
  return `Checked in ${formatDuration(elapsed)} ago`;
}

export function liveFocusContext(entry: TodayFeedEntry, now: Date): LiveFocusContext {
  const dog = entry.booking.dogName || "Booking";
  if (entry.isLate) return focusContext(dog, `${formatDuration(minutesOverdue(entry.booking, now))} overdue`, "overdue");
  if (entry.stage === "ready") return focusContext(dog, `Waiting for collection ${formatDuration(collectionWaitMinutes(entry.booking, now) ?? 0)}`, "live");
  if (entry.stage === "inSalon") return focusContext(dog, checkedInCopy(entry.booking.checkedInAt, now), "live");
  const minutes = minutesUntilSlot(entry.booking.slot || "00:00", now);
  return focusContext(dog, minutes <= 0 ? "Due now" : `Due to arrive in ${formatDuration(minutes)}`, "live");
}

// ---- Takings by method (improvement #3 — till view) --------------------------

export interface TakingsByMethod {
  /** Total recorded-as-paid amount across the given bookings. */
  total: number;
  /** Number of Paid-in-Full bookings counted. */
  count: number;
  byMethod: Array<{ method: string; label: string; amount: number; count: number }>;
  /**
   * The individual settled bookings behind `total`, most recent first.
   *
   * Returned from here rather than recomputed by the caller so a per-dog list
   * and the total it sits under cannot disagree. Computing the rows separately
   * would reach the pricing chain by a different route and produce a list that
   * visibly fails to add up.
   */
  bookings: Array<{ booking: TodayBooking; amount: number; method: string; label: string }>;
}

/**
 * Sum today's recorded takings, grouped by payment method. Uses the recorded
 * paid_amount where present, else the computed appointment total (legacy paid
 * bookings have no recorded amount). Bookings with no recorded method fall into
 * an "unrecorded" bucket. Cancelled bookings are excluded.
 */
function methodLabel(method: string): string {
  return method === "unrecorded" ? "Not recorded" : paymentMethodLabel(method);
}

export function buildTakingsByMethod(bookings: TodayBooking[]): TakingsByMethod {
  const paid = bookings.filter((b) => (b.payment || "") === "Paid in Full" && isCountableBooking(b));
  const acc: Record<string, { amount: number; count: number }> = {};
  const rows: TakingsByMethod["bookings"] = [];
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
    rows.push({ booking: b, amount, method, label: methodLabel(method) });
  }
  // Most recently collected first: the till question is almost always about
  // the last dog out of the door, not the first.
  rows.sort((a, b) => {
    const aTime = Date.parse(a.booking.completedAt ?? "");
    const bTime = Date.parse(b.booking.completedAt ?? "");
    if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
    if (!Number.isFinite(aTime)) return 1;
    if (!Number.isFinite(bTime)) return -1;
    return bTime - aTime;
  });
  const byMethod = Object.entries(acc)
    .map(([method, v]) => ({
      method,
      label: methodLabel(method),
      amount: v.amount,
      count: v.count,
    }))
    .sort((a, b) => b.amount - a.amount);
  return { total, count: paid.length, byMethod, bookings: rows };
}

// ============================================================
// Dogs booked this week whose RECORD carries no size
//
// bookings.size is NOT NULL, so a booking always states a size — but the DOG
// record can still be blank, and that is what blocks the customer from
// self-serving (both the portal wizard and the WhatsApp Flow need it) and what
// staff must supply by hand at booking time (#683).
//
// 139 such dogs exist as a one-off artefact of the April 2026 import, and they
// cannot be repaired automatically: every booking they have reads "small",
// which was a UI default echoing back rather than an observation. So the
// backlog needs a human who knows the dog — and the ones worth doing first are
// the ones actually coming in.
//
// This surfaces exactly those: the dog is in the diary, so someone will see it
// shortly and can record its real size while it is in front of them.
// ============================================================

export interface DogMissingSize {
  dogId: string;
  dogName: string;
  /** Earliest upcoming booking for this dog, YYYY-MM-DD. */
  dateStr: string;
  slot: string;
}

/**
 * Dogs with a booking on or after `todayStr` whose dog record has no size.
 *
 * Scope is whatever `bookingsByDate` holds — the loaded week — so the caller
 * should describe it as "this week" rather than implying it swept the future.
 * One row per dog (earliest booking wins), soonest first, cancelled excluded.
 */
export function selectDogsMissingSize(
  bookingsByDate: Record<string, Booking[]> | null | undefined,
  dogs: Record<string, Dog> | null | undefined,
  todayStr: string,
): DogMissingSize[] {
  if (!bookingsByDate || !dogs) return [];

  const earliest = new Map<string, DogMissingSize>();

  for (const [dateStr, list] of Object.entries(bookingsByDate)) {
    if (!dateStr || dateStr < todayStr) continue;
    for (const booking of list || []) {
      if (booking.status === BOOKING_STATUS.CANCELLED) continue;

      // Resolve the dog RECORD; the booking's own size tells us nothing about
      // whether the record is complete.
      const dog = getDogByIdOrName(dogs, booking._dogId || booking.dogName);
      if (!dog || !dog.id) continue;
      if (dog.size) continue;

      const candidate: DogMissingSize = {
        dogId: dog.id,
        dogName: dog.name || booking.dogName || "This dog",
        dateStr,
        slot: booking.slot || "",
      };
      const held = earliest.get(dog.id);
      if (
        !held ||
        candidate.dateStr < held.dateStr ||
        (candidate.dateStr === held.dateStr &&
          slotToMinutes(candidate.slot) < slotToMinutes(held.slot))
      ) {
        earliest.set(dog.id, candidate);
      }
    }
  }

  return [...earliest.values()].sort(
    (a, b) =>
      a.dateStr.localeCompare(b.dateStr) ||
      slotToMinutes(a.slot) - slotToMinutes(b.slot) ||
      a.dogName.localeCompare(b.dogName),
  );
}
