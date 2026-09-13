import type { CustomerBookingSummary } from "../../supabase/repositories/bookingsRepo";

/** Match the existing customer cancel/reschedule RPC boundary, not dormant visit commands. */
export function groupUpcomingBookings(bookings: CustomerBookingSummary[]) {
  const groups = new Map<string, { key: string; bookings: CustomerBookingSummary[] }>();
  const ordered = [...bookings].sort((a, b) =>
    a.bookingDate.localeCompare(b.bookingDate) || a.slot.localeCompare(b.slot) || a.id.localeCompare(b.id),
  );
  for (const booking of ordered) {
    // Recurring appointments can reuse a group ID on different dates.
    const key = booking.groupId
      ? `group:${booking.groupId}:${booking.bookingDate}`
      : `booking:${booking.id}`;
    const group = groups.get(key);
    if (group) group.bookings.push(booking);
    else groups.set(key, { key, bookings: [booking] });
  }
  return [...groups.values()];
}
