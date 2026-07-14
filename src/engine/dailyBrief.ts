import { BOOKING_STATUS } from "../constants/index";
import { paymentMethodLabel } from "../constants/salon";
import type { Booking } from "../types/index";
import { buildFutureDayFeed, buildTodayFeed, londonDateStr } from "./today";

export type JourneyActionId =
  | "checkIn"
  | "startGroom"
  | "ready"
  | "messageCollection"
  | "waiting"
  | "collected"
  | "paid";
export type PaymentVisual = "unpaid" | "cash" | "card" | "bankTransfer";

export interface JourneyAction {
  id: JourneyActionId;
  label: string;
  completed: boolean;
  next: boolean;
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
      : [
          action("ready", "Ready for collection", false, index === 2),
          action("messageCollection", "Message for collection", false, false),
        ]),
    action("collected", index >= 4 ? "Complete" : "Collected", index >= 4, index === 3),
    action("paid", paymentVisual(booking).label, paid, false),
  ];
}

export function paymentVisual(booking: Booking): { visual: PaymentVisual; label: string } {
  if (booking.payment !== "Paid in Full") {
    return { visual: "unpaid", label: "Record payment" };
  }

  const amount = Number(booking.paidAmount || 0).toLocaleString("en-GB", {
    maximumFractionDigits: 2,
  });
  const method = paymentMethodLabel(booking.paymentMethod) || "unrecorded method";
  const visual: PaymentVisual =
    booking.paymentMethod === "cash"
      ? "cash"
      : booking.paymentMethod === "card"
        ? "card"
        : "bankTransfer";

  return { visual, label: `Paid £${amount} by ${method.toLowerCase()}` };
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
) {
  return selectedDateStr === londonDateStr(now)
    ? buildTodayFeed(bookings, now)
    : buildFutureDayFeed(bookings);
}
