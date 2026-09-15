// ============================================================
// supabase/functions/_shared/slackAlertWindow.ts
//
// WHEN a #salon-today alert may post. Pure logic, no IO.
//
// The salon only wants Slack noise while somebody is there to act on it:
// Monday to Wednesday, 08:00-15:30 Europe/London. Everything else waits.
//
// Two rules make that workable rather than lossy:
//
//   1. THE FIRST-SLOT EXCEPTION. A cancellation that frees tomorrow's FIRST
//      appointment posts immediately, whatever the hour. That is the one
//      alert worth an evening phone buzz: it is the salon's opening slot,
//      and knowing at 19:00 rather than 08:00 is the difference between
//      refilling it and eating it. There is deliberately no upper cut-off.
//
//   2. EVERYTHING ELSE QUEUES. An alert raised out of hours is held, not
//      dropped, and flushed when the window next opens. Dropping would lose
//      a cancellation made at 07:30 for that same afternoon.
//
// Cron-driven alerts (no-show, ready-too-long, unanswered message) are NOT
// queueable. They are re-evaluated every five minutes, so they heal
// themselves at 08:00; queueing them would instead flush a stale "no-show?"
// about yesterday. Only the trigger-driven booking alerts, which fire once
// and are gone, need holding.
//
// Timezone note: every decision here is made against the London WALL CLOCK,
// read through Intl. Never against a UTC offset held in a constant — that is
// correct for half the year and silently wrong for the other half. pg_cron
// stays in UTC and is treated as a coarse wake-up only; this module is where
// the precise judgements happen.
// ============================================================

import {
  POSTING_DAYS_ISO,
  POSTING_WINDOW_END_MINUTES,
  POSTING_WINDOW_START_MINUTES,
} from "./slackAlertThresholds.ts";
import type { AlertType } from "./slackMessage.ts";

const LONDON = "Europe/London";

// hourCycle h23 pins hours to 00-23. hour12:false can emit "24" at midnight on
// some runtimes, which would report hour 24 against the NEXT day's date and
// put the window check an entire day out once per day.
const LONDON_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface LondonWallClock {
  /** London calendar date, "YYYY-MM-DD". */
  dateStr: string;
  hour: number;
  minute: number;
  /** Minutes since London midnight. */
  minutesOfDay: number;
  /** ISO weekday: Monday = 1 ... Sunday = 7. */
  isoDay: number;
}

/** Read the Europe/London wall clock at an instant. */
export function londonWallClock(now: Date): LondonWallClock {
  const parts = LONDON_FMT.formatToParts(now);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // defensive; h23 should never produce it
  const minute = Number(get("minute"));
  // The date string is already a London calendar date, so reading its
  // weekday as if it were UTC midnight gives the London weekday.
  const utcDay = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return {
    dateStr,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
    isoDay: utcDay === 0 ? 7 : utcDay, // Sunday 0 -> 7
  };
}

/** The London calendar date `days` after (or before) the one at `now`. */
export function londonDatePlus(now: Date, days: number): string {
  const { dateStr } = londonWallClock(now);
  const base = new Date(`${dateStr}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Is the salon inside its Mon-Wed 08:00-15:30 posting window right now? */
export function isWithinPostingWindow(now: Date): boolean {
  const { isoDay, minutesOfDay } = londonWallClock(now);
  if (!POSTING_DAYS_ISO.includes(isoDay)) return false;
  return (
    minutesOfDay >= POSTING_WINDOW_START_MINUTES &&
    minutesOfDay < POSTING_WINDOW_END_MINUTES
  );
}

/** Alert types raised by a database trigger, which fire once and are lost if
 *  not held. Only these are queued when the window is shut. */
export const QUEUEABLE_ALERT_TYPES: ReadonlySet<AlertType> = new Set<AlertType>([
  "cancellation",
  "moved_off",
  "new_booking",
  "moved_in",
]);

/** Alert types that free a slot, and so qualify for the first-slot exception. */
const SLOT_FREEING_ALERT_TYPES: ReadonlySet<AlertType> = new Set<AlertType>([
  "cancellation",
  "moved_off",
]);

export interface ImmediatePostContext {
  alertType: AlertType;
  /** The affected booking's date, "YYYY-MM-DD" London. */
  bookingDate: string | null;
  /** The affected booking's slot, "HH:MM". */
  slot: string | null;
  /** Earliest slot on that date's bookable grid (canonical plus any staff
   *  extras). Passing the grid's real first slot — rather than assuming
   *  "08:30" — is what stops a staff-added early extra slot being mistaken
   *  for the opening appointment, or vice versa. */
  firstSlotOfDate: string | null;
}

/**
 * Does this alert earn an immediate post even though the window is shut?
 *
 * Only a cancellation (or a move away, which frees the slot just the same)
 * of TOMORROW'S FIRST appointment. Anything else waits.
 */
export function qualifiesForImmediatePost(
  ctx: ImmediatePostContext,
  now: Date,
): boolean {
  if (!SLOT_FREEING_ALERT_TYPES.has(ctx.alertType)) return false;
  if (!ctx.bookingDate || !ctx.slot || !ctx.firstSlotOfDate) return false;
  if (ctx.bookingDate !== londonDatePlus(now, 1)) return false;
  return ctx.slot === ctx.firstSlotOfDate;
}

export type PostDecision = "post" | "queue" | "drop";

/**
 * Post now, hold for the morning, or let it go?
 *
 * Note the ORDER: the first-slot exception is checked before the weekday
 * test, not after. Tomorrow being Monday means today is Sunday, which is
 * outside the Mon-Wed window entirely — so checking the weekday first would
 * silently kill the single most useful out-of-hours alert there is, the
 * salon's first appointment of the week going missing.
 */
export function decidePosting(
  ctx: ImmediatePostContext,
  now: Date,
): PostDecision {
  if (qualifiesForImmediatePost(ctx, now)) return "post";
  if (isWithinPostingWindow(now)) return "post";
  return QUEUEABLE_ALERT_TYPES.has(ctx.alertType) ? "queue" : "drop";
}

/**
 * Has a queued alert gone stale before it could be flushed?
 *
 * An alert about a booking whose date has already passed is no longer
 * "something that changes today". Flushing it would post history.
 * Alerts with no booking date (there are none today, but the queue column is
 * nullable) are never stale.
 */
export function isQueuedAlertStale(
  bookingDate: string | null,
  now: Date,
): boolean {
  if (!bookingDate) return false;
  return bookingDate < londonWallClock(now).dateStr;
}
