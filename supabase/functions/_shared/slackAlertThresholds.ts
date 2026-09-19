// ============================================================
// supabase/functions/_shared/slackAlertThresholds.ts
//
// Every tunable number the #salon-today Slack alerts use, in ONE place.
//
// The brief for this feature was explicit: the thresholds must not be
// scattered. If you are changing "15 minutes" to "20 minutes", this is the
// only file you touch — the sweep, the message builder and the tests all
// read from here.
//
// NOT here on purpose: DAILY_DOG_CAP. The salon's 14-dog cap already lives in
// three places that must stay in sync (src/constants/salon.ts, this
// directory's salonConstants.ts, and salon_config.daily_dog_cap in the DB).
// A fourth copy is how drift starts, so the capacity maths imports the
// existing mirror instead.
//
// Pure module: no imports, no IO. Runs in Deno and in Node alike.
// ============================================================

/** How long after a slot's start a still-"Booked" dog counts as a no-show. */
export const NO_SHOW_AFTER_MINUTES = 15;

/** How long a dog may sit in "Ready for collection" before staff are nudged. */
export const READY_OVERDUE_MINUTES = 45;

/** How long an inbound customer message may go unanswered during opening
 *  hours before it is surfaced. */
export const UNANSWERED_AFTER_MINUTES = 30;

/** At or below this share of the daily dog cap, the morning summary calls the
 *  day quiet. 0.40 of 14 dogs is 5.6, so "quiet" means 5 dogs or fewer.
 *  Deliberately the same 40% boundary the staff calendar's Quiet/Steady/Full
 *  badge already uses (utilisationLabel in src/engine/utilisation.ts), so
 *  Slack and the dashboard can never disagree about what "quiet" means. */
export const QUIET_DAY_RATIO = 0.40;

// ── Posting window (Europe/London wall clock) ───────────────────────────
//
// Nothing posts outside this window, with one exception handled in
// slackAlertWindow.ts: a cancellation for tomorrow's FIRST slot posts
// immediately whenever it happens, including overnight.

/** ISO weekday numbers the salon posts on: Monday, Tuesday, Wednesday. */
export const POSTING_DAYS_ISO: readonly number[] = [1, 2, 3];

/** Start of the posting window, minutes since London midnight (08:00). */
export const POSTING_WINDOW_START_MINUTES = 8 * 60;

/** End of the posting window, minutes since London midnight (15:30). */
export const POSTING_WINDOW_END_MINUTES = 15 * 60 + 30;

/** London hour the morning summary belongs to. Two UTC cron jobs both pass
 *  this, and whichever one actually lands on 08:xx London does the work —
 *  see docs/slack-alerts.md for why that beats DST arithmetic. */
export const MORNING_SUMMARY_HOUR_UK = 8;

/** How long a posted-alert record is kept before the nightly prune drops it.
 *  Matches the 90-day telemetry retention already in the database. */
export const ALERT_RETENTION_DAYS = 90;
