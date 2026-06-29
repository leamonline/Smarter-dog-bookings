import { BOOKING_STATUS } from "../constants/index";
import type { Booking } from "../types/index";

// ============================================================
// OCCUPANCY
//
// The capacity engine (capacity.ts) treats its `bookings` input as the day's
// *non-cancelled occupancy*: every helper filters by `slot` only, never by
// status (see the comment at the top of `findGroupedSlots`). Cancelled
// bookings are soft-deletes that free their seat, so any UI surface that feeds
// bookings into the engine — or renders seats from them — must strip cancelled
// rows first. This is the single chokepoint for that rule so the staff
// calendar grid, the day's booking count and the reschedule slot-picker can't
// drift apart on which rows count as occupying a seat.
// ============================================================

/**
 * Returns the bookings that still occupy a seat — i.e. everything except
 * cancelled rows. Use this at every boundary that hands a day's bookings to
 * the capacity engine or renders them into slots.
 */
export function excludeCancelled<T extends Pick<Booking, "status">>(
  bookings: readonly T[],
): T[] {
  return bookings.filter((b) => b.status !== BOOKING_STATUS.CANCELLED);
}
