// What happens to a £10 app deposit when a booking ends.
//
// This is the same rule as smarter_dog_private.square_deposit_outcome in
// migration 20261122143000. The database is what cancel, reschedule and
// no-show actually run. This copy exists so the rule can be read and tested
// without Postgres. Change one, change the other.
//
// The notice window is the salon's existing cancellation notice
// (minCancellationHours, 24 unless staff have changed it). Exactly on that
// deadline is still in time: the deposit is refunded. After it, a customer
// cancellation is kept. A no-show is kept. A reschedule keeps the payment and
// carries it onto the replacement. A salon cancellation, or a cancellation
// with no customer cause, is refunded.

import { londonWallClockToUtcMs } from "./londonTime";

/** £10, in pence. DEFAULT_DEPOSIT_AMOUNT and DEPOSIT_PER_DOG_PENCE. */
export const SQUARE_DEPOSIT_PENCE = 1000;

/** The notice window used when nobody has changed minCancellationHours. */
export const DEFAULT_DEPOSIT_NOTICE_HOURS = 24;

export type SquareDepositOutcome = "refund_due" | "forfeited" | "carry_pending";

export interface SquareDepositOutcomeInput {
  status: string;
  cancellationCause?: string | null;
  /** London wall-clock date, YYYY-MM-DD, as bookings.booking_date is stored. */
  bookingDate: string;
  /** London wall-clock slot, HH:MM. */
  slot: string;
  /** When the cancellation or no-show was recorded. */
  decidedAt: Date;
  /** Salon notice window in hours. Defaults to 24. */
  noticeHours?: number;
}

function deadlineWallClock(
  bookingDate: string,
  slot: string,
  noticeHours: number,
): { date: string; time: string } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(slot);
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) return null;
  const start = Date.parse(`${bookingDate}T${slot}:00Z`);
  if (Number.isNaN(start)) return null;
  const iso = new Date(start - noticeHours * 3_600_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * The deposit outcome for this booking change, or null when the change does
 * not decide the money (the booking is still going ahead).
 */
export function squareDepositOutcome(
  input: SquareDepositOutcomeInput,
): SquareDepositOutcome | null {
  if (input.status === "No-show") return "forfeited";
  if (input.status !== "Cancelled") return null;

  const cause = input.cancellationCause ?? null;
  if (cause === "reschedule") return "carry_pending";
  if (cause !== "customer") return "refund_due";

  const noticeHours = input.noticeHours ?? DEFAULT_DEPOSIT_NOTICE_HOURS;
  const deadline = deadlineWallClock(input.bookingDate, input.slot, noticeHours);
  if (!deadline) return "refund_due";

  const deadlineMs = londonWallClockToUtcMs(deadline.date, deadline.time);
  if (Number.isNaN(deadlineMs)) return "refund_due";

  // After the deadline the salon keeps the £10. Exactly on it, the customer
  // still had the full notice, so it is refunded.
  if (input.decidedAt.getTime() > deadlineMs) return "forfeited";
  return "refund_due";
}
