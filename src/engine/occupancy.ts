import { isActiveBooking } from "../constants/index";
import type { Booking } from "../types/index";

// ============================================================
// OCCUPANCY
//
// A booking occupies a seat unless it is Cancelled or No-show. That is
// isActiveBooking(), the same predicate as booking_occupies_seat() in the
// database. The capacity engine also ignores those two statuses itself;
// this filter is the chokepoint for counts and cards (the staff grid, the
// day's booking count, the reschedule slot-picker) so a no-show is not
// drawn into a seat the database has already freed.
// ============================================================

/**
 * Bookings that still occupy a seat. Drops Cancelled and No-show. A missing
 * status still counts, matching the database default of Booked.
 */
export function excludeCancelled<T extends Pick<Booking, "status">>(
  bookings: readonly T[],
): T[] {
  return bookings.filter((b) => isActiveBooking(b.status));
}
