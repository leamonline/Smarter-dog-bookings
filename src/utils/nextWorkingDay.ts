// ============================================================
// src/utils/nextWorkingDay.ts
//
// "Next working day" helper for the dashboard's Tomorrow's reminders
// panel. Smarter Dog is open Monday / Tuesday / Wednesday only —
// reminders are useful only for days that have grooms booked, so
// any Thu/Fri/Sat/Sun + today rolls forward to the next Mon/Tue/Wed.
//
// Behaviour by example (today = X):
//   Mon  → next working day is Tue
//   Tue  → Wed
//   Wed  → Mon (skip Thu/Fri/Sat/Sun)
//   Thu  → Mon
//   Fri  → Mon
//   Sat  → Mon
//   Sun  → Mon
//
// The function ignores per-day closures recorded in `day_settings`
// (those represent ad-hoc closures, not the weekly schedule).
// The TomorrowRemindersCard panel can layer a "(closed)" indicator
// on top if needed later — out of scope here.
// ============================================================

const OPEN_DOW = new Set([1, 2, 3]); // Mon=1, Tue=2, Wed=3 (JS getDay)

/**
 * Returns the next salon-open date strictly AFTER `from` (default: today),
 * as a YYYY-MM-DD string in the UK timezone.
 */
export function getNextWorkingDay(from?: Date): string {
  // Anchor to UK time. Server might be UTC; UK is UTC+0 in winter / +1 in
  // summer. Use the date the staff would call "today" in the salon.
  const today = from ?? new Date();
  const ukDateStr = today.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  // en-CA gives YYYY-MM-DD which we parse back as a local Date so the
  // day-of-week maths is in the salon's local calendar.
  let candidate = new Date(ukDateStr + "T12:00:00Z");

  for (let i = 0; i < 14; i++) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    if (OPEN_DOW.has(candidate.getUTCDay())) {
      return candidate.toISOString().slice(0, 10);
    }
  }

  // Should be unreachable — fall back to tomorrow.
  const fallback = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return fallback.toISOString().slice(0, 10);
}
