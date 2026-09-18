import { BOOKING_STATUS } from "../constants/index";
import { paymentMethodLabel } from "../constants/salon";
import type { Booking } from "../types/index";
import {
  buildFutureDayFeed,
  buildTodayFeed,
  collectionWaitMinutes,
  formatDuration,
  isPaymentOutstanding,
  londonDateStr,
  minutesUntilSlot,
  needsConfirmation,
  statusRank,
  timeInSalonMinutes,
} from "./today";
import type { TodayFeedEntry } from "./today";
import type { FeedVisibilityOptions, NeedActionReason } from "./today";
import { computeBookingPricing, validateDepositAmount } from "./bookingRules";
import type { BookingPricingInput } from "./bookingRules";

export type JourneyActionId =
  | "checkIn"
  | "startGroom"
  | "ready"
  | "waiting"
  | "collected"
  | "paid";
export type PaymentVisual = "unpaid" | "cash" | "card" | "bankTransfer" | "paidUnknown";

export interface JourneyAction {
  id: JourneyActionId;
  label: string;
  completed: boolean;
  next: boolean;
}

export interface MiniInvoiceInput {
  booking: BookingPricingInput;
  basePrice: number;
  addons: string[];
  depositAmount: number | string;
  paymentReceived: number;
  paymentMethod: string | null;
}

export function buildMiniInvoicePatch(input: MiniInvoiceInput) {
  const basePrice = Number(input.basePrice);
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return { ok: false as const, error: "Enter a base price above £0" };
  }

  const pricingInput = { ...input.booking, priceOverride: basePrice, addons: input.addons };
  const subtotal = computeBookingPricing(pricingInput).subtotal;
  const deposit = input.depositAmount === "" ? 0 : Number(input.depositAmount);
  if (!Number.isFinite(deposit) || deposit < 0) {
    return { ok: false as const, error: "Enter a valid deposit amount" };
  }
  const depositError =
    deposit > 0 ? validateDepositAmount("Deposit Paid", deposit, subtotal) : null;
  if (depositError) return { ok: false as const, error: depositError };

  const amountDue = Math.max(0, subtotal - deposit);
  const received = Number(input.paymentReceived || 0);
  if (!Number.isFinite(received) || received < 0) {
    return { ok: false as const, error: "Payment received cannot be negative" };
  }
  if (received > 0 && !input.paymentMethod) {
    return { ok: false as const, error: "Choose Cash, Card or Bank transfer" };
  }
  if (received > 0 && Math.round(received * 100) !== Math.round(amountDue * 100)) {
    return {
      ok: false as const,
      error: `Enter the full £${amountDue.toLocaleString("en-GB", {
        maximumFractionDigits: 2,
      })} balance or update the deposit amount`,
    };
  }

  const settled = received > 0;
  return {
    ok: true as const,
    subtotal,
    amountDue,
    patch: {
      priceOverride: basePrice,
      addons: input.addons,
      payment: settled
        ? ("Paid in Full" as const)
        : deposit > 0
          ? ("Deposit Paid" as const)
          : ("Due at Pick-up" as const),
      depositAmount: deposit > 0 ? deposit : null,
      paymentMethod: settled ? input.paymentMethod : null,
      paidAmount: settled ? subtotal : null,
    },
  };
}

const CARE = [
  BOOKING_STATUS.BOOKED,
  BOOKING_STATUS.CHECKED_IN,
  BOOKING_STATUS.IN_BATH,
  BOOKING_STATUS.READY_FOR_PICKUP,
  BOOKING_STATUS.COMPLETED,
] as const;

const indexOfStatus = (status: string | null | undefined) =>
  Math.max(0, CARE.indexOf(status as (typeof CARE)[number]));

export function buildJourneyActions(booking: Booking): JourneyAction[] {
  const index = indexOfStatus(booking.status);
  const paid = booking.payment === "Paid in Full";
  const action = (
    id: JourneyActionId,
    label: string,
    completed: boolean,
    next: boolean,
  ): JourneyAction => ({ id, label, completed, next });

  return [
    action("checkIn", index >= 1 ? "Checked-in" : "Check-in", index >= 1, index === 0),
    action(
      "startGroom",
      index >= 2 ? "Being groomed" : "Start groom",
      index >= 2,
      index === 1,
    ),
    ...(index >= 3
      ? [action("waiting", "Waiting to be collected", true, false)]
      : [action("ready", "Ready for collection", false, index === 2)]),
    action("collected", index >= 4 ? "Complete" : "Collected", index >= 4, index === 3),
    action("paid", paymentVisual(booking).label, paid, false),
  ];
}

export function paymentVisual(booking: Booking): { visual: PaymentVisual; label: string } {
  if (booking.payment !== "Paid in Full") {
    return { visual: "unpaid", label: "Record payment" };
  }

  const amount = booking.paidAmount == null
    ? null
    : booking.paidAmount.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  const method = paymentMethodLabel(booking.paymentMethod);
  const visual: PaymentVisual =
    booking.paymentMethod === "cash"
      ? "cash"
      : booking.paymentMethod === "card"
        ? "card"
        : booking.paymentMethod === "bank_transfer"
          ? "bankTransfer"
          : "paidUnknown";
  const amountLabel = amount == null ? "" : ` £${amount}`;
  const methodLabel = method ? ` by ${method.toLowerCase()}` : "";

  return { visual, label: `Paid${amountLabel}${methodLabel}` };
}

export function requiresCareSkipConfirmation(
  currentStatus: string | null | undefined,
  targetStatus: string,
): string | null {
  const current = indexOfStatus(currentStatus);
  const target = CARE.indexOf(targetStatus as (typeof CARE)[number]);
  if (target <= current + 1) return null;

  return CARE[current + 1] === BOOKING_STATUS.CHECKED_IN
    ? "been checked in"
    : CARE[current + 1] === BOOKING_STATUS.IN_BATH
      ? "started the groom"
      : CARE[current + 1] === BOOKING_STATUS.READY_FOR_PICKUP
        ? "been marked ready for collection"
        : "been collected";
}

export function buildDailyBriefFeed(
  bookings: Booking[],
  selectedDateStr: string,
  now: Date,
  opts: FeedVisibilityOptions = {},
) {
  if (selectedDateStr === londonDateStr(now)) return buildTodayFeed(bookings, now, opts);

  return buildFutureDayFeed(bookings, opts).map((entry) => {
    const rank = statusRank(entry.booking.status);
    const isUnconfirmed = rank === 0 && needsConfirmation(entry.booking);
    const owes = isPaymentOutstanding(entry.booking);
    const actionReasons: NeedActionReason[] = [];
    if (isUnconfirmed) actionReasons.push("confirmation");
    if (entry.stage === "ready") actionReasons.push("collection");
    if (rank >= 1 && owes) actionReasons.push("payment");

    return {
      ...entry,
      isUnconfirmed,
      owes,
      needsAction: actionReasons.length > 0,
      actionReasons,
    };
  });
}

export type DailyBriefLane = "due" | "withUs" | "ready" | "home";

export interface DailyBriefBoardEntry extends TodayFeedEntry {
  lane: DailyBriefLane;
  sortMinutes: number;
  timingLabel: string | null;
}

export interface DailyBriefBoard {
  due: DailyBriefBoardEntry[];
  withUs: DailyBriefBoardEntry[];
  ready: DailyBriefBoardEntry[];
  home: DailyBriefBoardEntry[];
  excludedCount: number;
  excludedBookings: Booking[];
}

const BOARD_LANE_BY_STATUS: Record<string, DailyBriefLane> = {
  [BOOKING_STATUS.BOOKED]: "due",
  [BOOKING_STATUS.CHECKED_IN]: "withUs",
  [BOOKING_STATUS.IN_BATH]: "withUs",
  [BOOKING_STATUS.READY_FOR_PICKUP]: "ready",
  [BOOKING_STATUS.COMPLETED]: "home",
};

function finiteSlot(entry: TodayFeedEntry): number {
  return Number.isFinite(entry.slotMinutes)
    ? entry.slotMinutes
    : Number.POSITIVE_INFINITY;
}

function validTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareId(a: DailyBriefBoardEntry, b: DailyBriefBoardEntry): number {
  return String(a.booking.id ?? "").localeCompare(String(b.booking.id ?? ""));
}

function compareTimestamp(
  a: DailyBriefBoardEntry,
  b: DailyBriefBoardEntry,
  field: "checkedInAt" | "readyAt" | "completedAt",
  direction: "asc" | "desc" = "asc",
): number {
  const aTime = validTimestamp(a.booking[field]);
  const bTime = validTimestamp(b.booking[field]);
  if (aTime !== null && bTime === null) return -1;
  if (aTime === null && bTime !== null) return 1;
  if (aTime !== null && bTime !== null && aTime !== bTime) {
    return direction === "asc" ? aTime - bTime : bTime - aTime;
  }
  const aSlot = finiteSlot(a);
  const bSlot = finiteSlot(b);
  if (aSlot !== bSlot) return aSlot < bSlot ? -1 : 1;
  return compareId(a, b);
}

function collectedTimeLabel(completedAt: string | null | undefined): string | null {
  const timestamp = validTimestamp(completedAt);
  if (timestamp === null) return null;
  const time = new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
  return `Collected ${time}`;
}

function boardTimingLabel(
  entry: TodayFeedEntry,
  lane: DailyBriefLane,
  isToday: boolean,
  now: Date,
): string | null {
  if (lane === "home") return collectedTimeLabel(entry.booking.completedAt);
  if (!isToday) return null;
  if (lane === "due") {
    if (!entry.booking.slot || !Number.isFinite(entry.slotMinutes)) return "Time missing";
    if (entry.isLate) return `${formatDuration(entry.overdueMinutes)} late`;
    const until = minutesUntilSlot(entry.booking.slot, now);
    return until <= 0 ? "Due now" : `Due in ${formatDuration(until)}`;
  }
  if (lane === "withUs") {
    const elapsed = timeInSalonMinutes(entry.booking, now);
    return elapsed == null ? null : `On site ${formatDuration(elapsed)}`;
  }
  const wait = collectionWaitMinutes(entry.booking, now);
  return wait == null ? null : `Ready ${formatDuration(wait)}`;
}

/**
 * Derive the three active Daily Brief lanes and compact completed history from
 * the existing booking statuses. Lanes are UI state only: no booking data is
 * mutated and payment never affects placement.
 */
export function buildDailyBriefBoard(
  bookings: Booking[],
  selectedDateStr: string,
  now: Date,
): DailyBriefBoard {
  const included = bookings.filter((booking) => !!BOARD_LANE_BY_STATUS[booking.status]);
  const excludedBookings = bookings.filter(
    (booking) => !BOARD_LANE_BY_STATUS[booking.status]
      && booking.status !== BOOKING_STATUS.CANCELLED,
  );
  const feed = buildDailyBriefFeed(included, selectedDateStr, now);
  const isToday = selectedDateStr === londonDateStr(now);
  const board: DailyBriefBoard = {
    due: [],
    withUs: [],
    ready: [],
    home: [],
    excludedCount: excludedBookings.length,
    excludedBookings,
  };

  for (const entry of feed) {
    const lane = BOARD_LANE_BY_STATUS[entry.booking.status];
    if (!lane) continue;
    const elapsed = lane === "withUs"
      ? timeInSalonMinutes(entry.booking, now)
      : lane === "ready"
        ? collectionWaitMinutes(entry.booking, now)
        : null;
    board[lane].push({
      ...entry,
      lane,
      sortMinutes: elapsed ?? finiteSlot(entry),
      timingLabel: boardTimingLabel(entry, lane, isToday, now),
    });
  }

  board.due.sort((a, b) => {
    if (a.isLate !== b.isLate) return a.isLate ? -1 : 1;
    const aSlot = finiteSlot(a);
    const bSlot = finiteSlot(b);
    if (aSlot !== bSlot) return aSlot < bSlot ? -1 : 1;
    return compareId(a, b);
  });
  board.withUs.sort((a, b) => compareTimestamp(a, b, "checkedInAt"));
  board.ready.sort((a, b) => compareTimestamp(a, b, "readyAt"));
  board.home.sort((a, b) => compareTimestamp(a, b, "completedAt", "desc"));

  return board;
}
