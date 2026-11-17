// Who made a booking, and when, as one short line for the day-stack card:
//
//   "14 Nov by Sam (staff)"
//   "3 Oct by Lizzie James (customer)"
//   "28 Oct by Smarter Dog AI"
//
// The creator is denormalised onto the booking at insert by
// `set_booking_creator()` (migration 20260627150000), using the same resolver
// as the booking_events feed, so this reads the row and never joins.
//
// Rows from before attribution existed have a creation date but no creator.
// They say only the date rather than guessing a name, because a wrong "by"
// is worse than a missing one.
import type { Booking } from "../types/index";

type CreatorFields = Pick<Booking, "createdAt" | "createdByName" | "createdByRole">;

/**
 * "Smarter Dog AI" already reads as a role, so only staff and customers get a
 * qualifier. Matches the "Booked by" footer in the booking-detail modal.
 */
const ROLE_SUFFIX: Record<string, string> = {
  staff: " (staff)",
  customer: " (customer)",
};

const LONDON = "Europe/London";

function londonYear(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, year: "numeric" }).format(date);
}

/**
 * The creation day on the salon's wall clock. A booking made at 00:30 BST on
 * 1 June is stored as 23:30 UTC on 31 May; staff think of it as 1 June. The
 * year only appears when it is not this year, to keep the line short.
 */
function londonDayLabel(at: string | null | undefined, now: Date): string {
  if (!at) return "";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const withYear = londonYear(date) !== londonYear(now);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(date);
}

/**
 * The card's "Booked" line, or null when the booking carries neither a
 * creation time nor a creator (nothing true to say, so say nothing).
 */
export function bookedLine(booking: CreatorFields, now: Date = new Date()): string | null {
  const when = londonDayLabel(booking.createdAt, now);
  const name = booking.createdByName?.trim() ?? "";
  const who = name ? `${name}${ROLE_SUFFIX[booking.createdByRole ?? ""] ?? ""}` : "";
  if (when && who) return `${when} by ${who}`;
  if (when) return when;
  if (who) return `by ${who}`;
  return null;
}
