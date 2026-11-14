/**
 * Upcoming bookings for the inbox booking panel.
 *
 * A relevant booking is today or later and still a live visit: Booked,
 * Reconfirmed, Arrived or Ready for collection. A missing status is Booked,
 * matching the database. Cancelled, no-show and completed visits are history.
 * Every matching row is kept — the panel must not collapse several visits
 * into one.
 */
import { BOOKING_STATUS } from "../../../constants/salon";

const UPCOMING_STATUSES = new Set<string>([
  BOOKING_STATUS.BOOKED,
  BOOKING_STATUS.RECONFIRMED,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.READY_FOR_COLLECTION,
]);

export interface UpcomingBooking {
  id: string;
  date: string;
  slot: string;
  service?: string | null;
  status?: string | null;
  dogName?: string | null;
  dogId?: string | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isUpcomingBooking(booking: UpcomingBooking | null | undefined, today: string): boolean {
  if (!booking?.id || !booking.date || !today) return false;
  if (booking.date < today) return false;
  const status = booking.status || BOOKING_STATUS.BOOKED;
  return UPCOMING_STATUSES.has(status);
}

export function selectUpcomingBookings(
  bookings: UpcomingBooking[] | null | undefined,
  today: string,
): UpcomingBooking[] {
  return (bookings || [])
    .filter((booking) => isUpcomingBooking(booking, today))
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.slot !== b.slot) return String(a.slot).localeCompare(String(b.slot));
      return String(a.dogName || "").localeCompare(String(b.dogName || ""));
    });
}

/**
 * Dates staff can jump to. Only an actual calendar date is accepted.
 * Prose such as "Monday or Tuesday" or "23, 24, 27 November" is left for
 * the date control — there is no structured extractor for message text.
 */
export function structuredRequestDates(values: Array<string | null | undefined>): string[] {
  const found: string[] = [];
  for (const value of values) {
    const text = String(value || "").trim();
    const match = ISO_DATE.exec(text);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year
      || date.getMonth() !== month - 1
      || date.getDate() !== day
    ) continue;
    if (!found.includes(text)) found.push(text);
  }
  return found;
}
