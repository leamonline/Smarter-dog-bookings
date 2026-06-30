import {
  computeBookingPricing,
  getDogByIdOrName,
  isCountableBooking,
} from "./bookingRules";
import type { Booking, Dog } from "../types/index";

/**
 * Pure, React-free cash-up builder for the weekly Cash-Up sheet.
 *
 * "Cash-up" here means **expected** takings, not reconciled till money: the app
 * only ever stores a *computed* price (service + add-ons, honouring a dog's
 * custom price) and a payment *status* (Paid in Full / Deposit Paid / Due at
 * Pick-up) plus an optional deposit. So every figure below is the expected
 * appointment value (`subtotal`) or the still-to-collect amount (`amountDue`),
 * derived through the single pricing source `computeBookingPricing` — never an
 * invented cash/card split.
 *
 * Only the dates passed in `openDates` are rendered; the caller filters the week
 * down to days the salon is open before calling this, so closed days never enter
 * a total (mirrors the open-days rule the analytics now use too).
 */

export type PayStatus = "paid" | "deposit" | "due";

export interface CashUpRow {
  /** The source booking — pass through so the UI can resolve display names. */
  booking: Booking;
  /** Expected appointment value (base price + add-ons, custom price honoured). */
  subtotal: number;
  /** Still to collect at pick-up (subtotal minus any deposit already paid). */
  amountDue: number;
  status: PayStatus;
}

export interface StatusBucket {
  count: number;
  /** Sum of expected `subtotal` for the bookings in this payment-status bucket. */
  amount: number;
}

export interface StatusBreakdown {
  paid: StatusBucket;
  deposit: StatusBucket;
  due: StatusBucket;
}

export interface CashUpDay {
  dateStr: string;
  rows: CashUpRow[];
  /** Expected total for the day (sum of row subtotals). */
  dayTotal: number;
  /** Expected still-to-collect for the day (sum of row amounts due). */
  dueTotal: number;
  statusBreakdown: StatusBreakdown;
}

export interface WeeklyCashUp {
  days: CashUpDay[];
  weekTotal: number;
  weekDueTotal: number;
  weekStatusBreakdown: StatusBreakdown;
}

function emptyBreakdown(): StatusBreakdown {
  return {
    paid: { count: 0, amount: 0 },
    deposit: { count: 0, amount: 0 },
    due: { count: 0, amount: 0 },
  };
}

function addToBreakdown(
  breakdown: StatusBreakdown,
  status: PayStatus,
  subtotal: number,
): void {
  const bucket = breakdown[status];
  bucket.count += 1;
  bucket.amount += subtotal;
}

/**
 * Build the weekly cash-up over the open days only.
 *
 * @param openDates       "YYYY-MM-DD" strings for the open days to include, in order.
 * @param bookingsByDate  Bookings keyed by "YYYY-MM-DD" (app-shaped or sample rows).
 * @param dogs            Dog map (any keying) — used only for each dog's custom price.
 */
export function buildWeeklyCashUp(
  openDates: string[],
  bookingsByDate: Record<string, Booking[]> | null | undefined,
  dogs: Record<string, Dog> | null | undefined,
): WeeklyCashUp {
  const byDate = bookingsByDate || {};
  const weekStatusBreakdown = emptyBreakdown();
  let weekTotal = 0;
  let weekDueTotal = 0;

  const days: CashUpDay[] = openDates.map((dateStr) => {
    const statusBreakdown = emptyBreakdown();
    let dayTotal = 0;
    let dueTotal = 0;

    const dayBookings = (byDate[dateStr] || []).filter(isCountableBooking);

    const rows: CashUpRow[] = dayBookings.map((booking) => {
      const dog = getDogByIdOrName(
        dogs || {},
        booking._dogId || booking.dogName,
      );
      const pricing = computeBookingPricing({
        service: booking.service,
        size: booking.size,
        addons: booking.addons,
        payment: booking.payment,
        depositAmount: booking.depositAmount,
        customPrice: dog?.customPrice,
      });

      const status: PayStatus = pricing.isPaidInFull
        ? "paid"
        : pricing.isDepositPaid
          ? "deposit"
          : "due";

      dayTotal += pricing.subtotal;
      dueTotal += pricing.amountDue;
      addToBreakdown(statusBreakdown, status, pricing.subtotal);
      addToBreakdown(weekStatusBreakdown, status, pricing.subtotal);

      return {
        booking,
        subtotal: pricing.subtotal,
        amountDue: pricing.amountDue,
        status,
      };
    });

    weekTotal += dayTotal;
    weekDueTotal += dueTotal;

    return { dateStr, rows, dayTotal, dueTotal, statusBreakdown };
  });

  return { days, weekTotal, weekDueTotal, weekStatusBreakdown };
}
