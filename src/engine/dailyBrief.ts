import { BOOKING_STATUS } from "../constants/index";
import { paymentMethodLabel } from "../constants/salon";
import type { Booking } from "../types/index";
import {
  buildFutureDayFeed,
  buildTodayFeed,
  isPaymentOutstanding,
  londonDateStr,
  needsConfirmation,
  statusRank,
} from "./today";
import { computeBookingPricing, validateDepositAmount } from "./bookingRules";
import type { BookingPricingInput } from "./bookingRules";

export type JourneyActionId =
  | "checkIn"
  | "startGroom"
  | "ready"
  | "messageCollection"
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
  depositAmount: number;
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
  const deposit = Number(input.depositAmount || 0);
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
) {
  if (selectedDateStr === londonDateStr(now)) return buildTodayFeed(bookings, now);

  return buildFutureDayFeed(bookings).map((entry) => {
    const rank = statusRank(entry.booking.status);
    const isUnconfirmed = rank === 0 && needsConfirmation(entry.booking);
    const owes = isPaymentOutstanding(entry.booking);
    const needsAction =
      entry.stage === "ready" || isUnconfirmed || (rank >= 1 && owes);

    return { ...entry, isUnconfirmed, owes, needsAction };
  });
}
