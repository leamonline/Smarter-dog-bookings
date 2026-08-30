// Unfinished business — the bookings the day-scoped surfaces can no longer see.
//
// WHY THIS EXISTS
//
// Every staff surface that can close a booking out is scoped to a single day.
// TodayView works from `todayStr`, and useBookings loads exactly one week
// (weekStart → weekStart + 6). So a booking that isn't finished on the day it
// happened stops being visible the moment the date rolls over: nothing lists
// it, no report filters for it, and the only way back to it is to know it
// exists and navigate to its date.
//
// Measured against production on 20 August 2026, that leak had accumulated:
//
//   60 past-dated bookings still in a non-terminal status (11.2% of all
//      bookings), the oldest sitting in "Ready for pick-up" since 2 June
//   215 of 380 completed grooms (56.6%) with no payment recorded at all
//
// Neither is a data-integrity fault — the rows are exactly what staff left
// behind. The fault is that nothing ever asks them to finish.
//
// This module is the pure half: it decides what counts as unfinished and how
// urgent each item is. It holds no React and no Supabase, so it can be tested
// against fixed dates rather than "now".
import { BOOKING_STATUS } from "../constants/salon";

/**
 * A booking is finished when it reaches one of these. Everything else is a
 * step on the way and should not outlive its own date.
 */
export const TERMINAL_STATUSES: readonly string[] = [
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
];

/**
 * Why an item is in the queue. The kinds are separated because they need
 * different actions from staff, not merely different labels:
 *
 *   mid_groom           the dog was here and the groom was started — the
 *                       booking needs completing (or correcting)
 *   awaiting_collection the groom finished and nobody marked the dog collected
 *   never_started       the dog never got past "Booked" — either it was a
 *                       no-show that needs recording, or staff never checked
 *                       it in. The queue deliberately does not guess which
 *   unpaid              the booking completed properly but no payment was
 *                       ever recorded against it
 */
export type UnfinishedKind =
  | "mid_groom"
  | "awaiting_collection"
  | "never_started"
  | "unpaid";

/**
 * The subset of a staff booking this module needs.
 *
 * No index signature on purpose: adding one would stop the real `Booking`
 * type satisfying the constraint, and callers would have to cast their way
 * back to safety.
 */
export interface UnfinishedCandidate {
  id: string;
  status: string;
  /** ISO date (YYYY-MM-DD) the booking was for. */
  _bookingDate?: string | null;
  paidAt?: string | null;
}

export interface UnfinishedItem<T extends UnfinishedCandidate = UnfinishedCandidate> {
  booking: T;
  kind: UnfinishedKind;
  /** Whole days between the booking's date and today. Always >= 1. */
  ageDays: number;
}

export interface UnfinishedGroup<T extends UnfinishedCandidate = UnfinishedCandidate> {
  kind: UnfinishedKind;
  label: string;
  /** What staff should do about this group, in their words. */
  action: string;
  items: Array<UnfinishedItem<T>>;
}

export interface UnfinishedQueue<T extends UnfinishedCandidate = UnfinishedCandidate> {
  groups: Array<UnfinishedGroup<T>>;
  counts: Record<UnfinishedKind, number>;
  total: number;
  /** Age of the single oldest item, or 0 when the queue is empty. */
  oldestAgeDays: number;
}

const GROUP_META: Record<UnfinishedKind, { label: string; action: string }> = {
  mid_groom: {
    label: "Groom never finished",
    action: "Mark completed, or cancel if the dog never came.",
  },
  awaiting_collection: {
    label: "Never marked collected",
    action: "Mark completed once you know the dog went home.",
  },
  never_started: {
    label: "Never checked in",
    action: "Complete it if it went ahead, or cancel it as a no-show.",
  },
  unpaid: {
    label: "No payment recorded",
    action: "Add the payment, or note that it was settled elsewhere.",
  },
};

/** Display order: most obviously stale first, money last. */
const GROUP_ORDER: UnfinishedKind[] = [
  "mid_groom",
  "awaiting_collection",
  "never_started",
  "unpaid",
];

export function isTerminalStatus(status: string | null | undefined): boolean {
  return TERMINAL_STATUSES.includes(status ?? "");
}

/**
 * Whole days between two ISO dates. Both are treated as plain calendar dates,
 * so this never drifts by an hour across a BST/GMT boundary the way a
 * millisecond difference on Date objects would.
 */
export function ageInDays(bookingDate: string, todayStr: string): number {
  const from = Date.UTC(
    Number(bookingDate.slice(0, 4)),
    Number(bookingDate.slice(5, 7)) - 1,
    Number(bookingDate.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(todayStr.slice(0, 4)),
    Number(todayStr.slice(5, 7)) - 1,
    Number(todayStr.slice(8, 10)),
  );
  return Math.round((to - from) / 86_400_000);
}

/**
 * Which kind of unfinished business this booking is, or null when it is
 * finished, in the future, or today's (today is TodayView's job, not this
 * queue's — surfacing it here would double-list live work).
 */
export function classifyUnfinished(
  booking: UnfinishedCandidate,
  todayStr: string,
): UnfinishedKind | null {
  const date = booking._bookingDate;
  if (!date || date >= todayStr) return null;

  switch (booking.status) {
    case BOOKING_STATUS.CHECKED_IN:
    case BOOKING_STATUS.IN_BATH:
      return "mid_groom";
    case BOOKING_STATUS.READY_FOR_PICKUP:
      return "awaiting_collection";
    case BOOKING_STATUS.BOOKED:
      return "never_started";
    case BOOKING_STATUS.COMPLETED:
      // Completed is a finished *lifecycle*, but an unpaid one is still
      // unfinished business — it is the larger half of the leak.
      return booking.paidAt ? null : "unpaid";
    default:
      // Cancelled, and anything a future migration adds, is left alone.
      return null;
  }
}

/**
 * Build the queue: every past-dated booking that still needs something,
 * grouped by what it needs and oldest-first within each group.
 *
 * Deliberately no money total. Prices are stored as display strings
 * ("£42+") and re-parsed in four places (see TECHNICAL-DEBT-REGISTER #15);
 * summing them here would put a wrong number in front of the owner with more
 * authority than it deserves. The count is honest; a total would not be.
 */
export function buildUnfinishedQueue<T extends UnfinishedCandidate>(
  bookings: readonly T[],
  todayStr: string,
): UnfinishedQueue<T> {
  const byKind = new Map<UnfinishedKind, Array<UnfinishedItem<T>>>();
  const counts: Record<UnfinishedKind, number> = {
    mid_groom: 0,
    awaiting_collection: 0,
    never_started: 0,
    unpaid: 0,
  };
  let oldestAgeDays = 0;

  for (const booking of bookings) {
    const kind = classifyUnfinished(booking, todayStr);
    if (!kind) continue;

    const ageDays = ageInDays(booking._bookingDate as string, todayStr);
    const list = byKind.get(kind) ?? [];
    list.push({ booking, kind, ageDays });
    byKind.set(kind, list);
    counts[kind] += 1;
    if (ageDays > oldestAgeDays) oldestAgeDays = ageDays;
  }

  const groups: Array<UnfinishedGroup<T>> = [];
  for (const kind of GROUP_ORDER) {
    const items = byKind.get(kind);
    if (!items || items.length === 0) continue;
    // Oldest first: the longer something has sat, the more likely it is that
    // nobody remembers it and the more it distorts the reports.
    items.sort((a, b) => b.ageDays - a.ageDays || a.booking.id.localeCompare(b.booking.id));
    groups.push({ kind, ...GROUP_META[kind], items });
  }

  return {
    groups,
    counts,
    total: groups.reduce((n, g) => n + g.items.length, 0),
    oldestAgeDays,
  };
}
