// The day stack: one dog per row, in strict appointment order.
//
// This module answers one question — "what does this row say about time?" —
// and nothing else. It owns no colour, no layout and no actions. Ordering and
// membership come from `buildDailyBriefFeed`, which is consumed rather than
// reimplemented, because that same feed also drives needs-attention and the
// next-open-day brief and there must be exactly one answer to "what is on
// today, in what order".
//
// Why a stack rather than the four-zone board it replaces: position in a zone
// says where a dog is, but it cannot say how long it has been there. On a
// board, a dog checked in at 08:35 and one checked in at 11:50 sit side by side
// looking identical. Strict time order plus one elapsed figure per row makes
// that difference the most visible thing on the screen, which is what the
// people running the salon actually need from it.
import { SERVICES } from "../constants/index";
import { buildDailyBriefFeed } from "./dailyBrief";
import {
  collectionWaitMinutes,
  formatDuration,
  londonDateStr,
  minutesUntilSlot,
  timeInSalonMinutes,
} from "./today";
import type { TodayFeedEntry } from "./today";
import { NO_ARRIVAL_MINUTES, IN_SALON_LONG_MINUTES } from "./salonBoard";
import type { Booking } from "../types/index";

/**
 * A dog waiting this long to be collected gets a heavier left rule and a clock.
 *
 * Deliberately lower than the board's `READY_URGENT_MINUTES` (60). The board
 * was ranking tokens against each other, where 60 minutes kept the urgent set
 * small enough to scan. The stack is a list in time order, so the threshold is
 * answering a different question: how long is too long to leave an owner
 * standing. Three quarters of an hour is the answer the salon gave.
 */
export const READY_OVERDUE_MINUTES = 45;

export interface DayStackRow {
  entry: TodayFeedEntry;
  booking: Booking;
  /** Stable string id, for keys and DOM hooks. */
  id: string;
  /** Minutes-of-day of the appointment. Rows are already in this order. */
  sortMinutes: number;
  /** The appointment time as shown, or null for a booking with no slot. */
  time: string | null;
  /** "Cockapoo · Full Groom", with either half omitted when unknown. */
  subtitle: string;
  /**
   * The one timing line, already worded.
   *
   * Null when there is nothing truthful to say — a booking from before the
   * lifecycle stamps existed (July 2026) has no arrival time, and a browsed
   * date has no live clock. Both degrade to silence rather than to "n/a",
   * because a row that admits it does not know is worse than a row that simply
   * does not mention it.
   */
  timing: string | null;
  /**
   * The timing line should read as urgent: heavier weight, not a different
   * hue. Colour already carries the status and must not be asked to carry a
   * second meaning on top.
   */
  urgent: boolean;
  /** Ready past READY_OVERDUE_MINUTES — thicker rule plus a clock icon. */
  readyOverdue: boolean;
}

function serviceLabel(serviceId: string | null | undefined): string {
  if (!serviceId) return "";
  return SERVICES.find((s) => s.id === serviceId)?.name || "";
}

function subtitleFor(booking: Booking, breed: string): string {
  return [breed, serviceLabel(booking.service)].filter(Boolean).join(" · ");
}

interface TimingResult {
  timing: string | null;
  urgent: boolean;
  readyOverdue: boolean;
}

const QUIET: TimingResult = { timing: null, urgent: false, readyOverdue: false };

/**
 * What this row says about time, by stage.
 *
 * Only ever called for the browsed date being today. A past or future day has
 * no live elapsed time, and computing one from a stamp would produce "3 days"
 * on a row a member of staff is reading as history.
 */
function timingFor(entry: TodayFeedEntry, now: Date): TimingResult {
  const booking = entry.booking;

  if (entry.stage === "noShow") {
    // Settled, not urgent. Nobody is waiting on this and nothing can be done
    // about it by hurrying.
    return { timing: "Did not arrive", urgent: false, readyOverdue: false };
  }

  if (entry.stage === "ready") {
    const wait = entry.waitMinutes ?? collectionWaitMinutes(booking, now);
    if (wait == null) return QUIET;
    return {
      timing: `waiting ${formatDuration(wait)}`,
      urgent: wait >= READY_OVERDUE_MINUTES,
      readyOverdue: wait >= READY_OVERDUE_MINUTES,
    };
  }

  if (entry.stage === "inSalon") {
    const elapsed = timeInSalonMinutes(booking, now);
    if (elapsed == null) return QUIET;
    return {
      timing: formatDuration(elapsed),
      urgent: elapsed >= IN_SALON_LONG_MINUTES,
      readyOverdue: false,
    };
  }

  if (entry.stage === "booked") {
    if (entry.isLate) {
      // Past a couple of hours, "5 hrs late" stops being true in any human
      // sense. The dog has not come. Say that instead.
      const timing = entry.overdueMinutes >= NO_ARRIVAL_MINUTES
        ? "No arrival"
        : `${formatDuration(entry.overdueMinutes)} late`;
      return { timing, urgent: true, readyOverdue: false };
    }
    if (!booking.slot) return QUIET;
    const until = minutesUntilSlot(booking.slot, now);
    if (!Number.isFinite(until) || until < 0) return QUIET;
    return { timing: `${formatDuration(until)} away`, urgent: false, readyOverdue: false };
  }

  return QUIET;
}

export interface DayStackInput {
  bookings: Booking[];
  /** The browsed date, which is not necessarily today. */
  dateStr: string;
  now: Date;
  /** Resolved breed per booking id, so this layer needs no dog lookup. */
  breedById?: Readonly<Record<string, string>>;
}

/**
 * Build the stack: every booking on the date, in appointment order, including
 * staff-confirmed no-shows.
 *
 * Nothing is grouped and nothing is re-sorted by status. A dog that has been in
 * since 08:30 stays at the top of the list all morning, which is the entire
 * point of the screen; bucketing it under "In the salon" would hide exactly the
 * fact the stack exists to show.
 */
export function buildDayStack({
  bookings,
  dateStr,
  now,
  breedById = {},
}: DayStackInput): DayStackRow[] {
  const isToday = dateStr === londonDateStr(now);
  const feed = buildDailyBriefFeed(bookings, dateStr, now, { includeNoShows: true });

  return feed
    // Collected dogs leave the stack for the summary at the bottom. They are
    // still in the feed, because the takings line is built from them.
    .filter((entry) => entry.stage !== "collected")
    .map((entry) => {
      const timing = isToday ? timingFor(entry, now) : QUIET;
      const id = String(entry.booking.id ?? "");
      return {
        entry,
        booking: entry.booking,
        id,
        sortMinutes: entry.slotMinutes,
        time: entry.booking.slot || null,
        subtitle: subtitleFor(entry.booking, breedById[id] || ""),
        ...timing,
      };
    });
}

/** The bookings that have left the stack, most recently collected first. */
export function selectCollected(bookings: Booking[], dateStr: string, now: Date): Booking[] {
  return buildDailyBriefFeed(bookings, dateStr, now)
    .filter((entry) => entry.stage === "collected")
    .map((entry) => entry.booking)
    .sort((a, b) => {
      const aTime = Date.parse(a.completedAt ?? "");
      const bTime = Date.parse(b.completedAt ?? "");
      if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
      if (!Number.isFinite(aTime)) return 1;
      if (!Number.isFinite(bTime)) return -1;
      return bTime - aTime;
    });
}
