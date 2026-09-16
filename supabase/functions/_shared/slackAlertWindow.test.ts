// ============================================================
// Unit tests for the #salon-today posting window.
//
// Runs under `deno test` (the function runtime), alongside the other
// _shared tests — see the agent-tests job in .github/workflows/ci.yml.
//
// Run locally:
//   deno test --node-modules-dir=none supabase/functions/_shared/slackAlertWindow.test.ts
//
// The dates below are real and deliberately chosen: June 2026 is British
// Summer Time (UTC+1), January 2026 is GMT (UTC+0). Every window assertion
// is made twice, once on each side of the clock change, because a fixed-offset
// bug passes half the year and fails the other half.
// ============================================================
import {
  assertEquals,
  assertFalse,
  assert,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  decidePosting,
  isQueuedAlertStale,
  isWithinPostingWindow,
  londonDatePlus,
  londonWallClock,
  qualifiesForImmediatePost,
} from "./slackAlertWindow.ts";

const at = (iso: string) => new Date(iso);

// ── London wall clock ──────────────────────────────────────────────────

Deno.test("londonWallClock reads BST as one hour ahead of UTC", () => {
  const wc = londonWallClock(at("2026-06-15T07:00:00Z"));
  assertEquals(wc.dateStr, "2026-06-15");
  assertEquals(wc.hour, 8);
  assertEquals(wc.minutesOfDay, 8 * 60);
  assertEquals(wc.isoDay, 1); // Monday
});

Deno.test("londonWallClock reads GMT as equal to UTC", () => {
  const wc = londonWallClock(at("2026-01-12T08:00:00Z"));
  assertEquals(wc.dateStr, "2026-01-12");
  assertEquals(wc.hour, 8);
  assertEquals(wc.isoDay, 1); // Monday
});

Deno.test("londonWallClock reports Sunday as ISO day 7, not 0", () => {
  assertEquals(londonWallClock(at("2026-06-14T12:00:00Z")).isoDay, 7);
});

Deno.test("londonWallClock rolls the date at London midnight, not UTC midnight", () => {
  // 23:30 UTC in summer is already 00:30 the NEXT day in London.
  const wc = londonWallClock(at("2026-06-14T23:30:00Z"));
  assertEquals(wc.dateStr, "2026-06-15");
  assertEquals(wc.hour, 0);
});

Deno.test("londonDatePlus crosses a month boundary", () => {
  assertEquals(londonDatePlus(at("2026-06-30T10:00:00Z"), 1), "2026-07-01");
  assertEquals(londonDatePlus(at("2026-06-01T10:00:00Z"), -1), "2026-05-31");
});

// ── The posting window ─────────────────────────────────────────────────

Deno.test("window is open at 08:00 London in both BST and GMT", () => {
  assert(isWithinPostingWindow(at("2026-06-15T07:00:00Z"))); // 08:00 BST
  assert(isWithinPostingWindow(at("2026-01-12T08:00:00Z"))); // 08:00 GMT
});

Deno.test("window is shut one minute before 08:00 London, both halves of the year", () => {
  assertFalse(isWithinPostingWindow(at("2026-06-15T06:59:00Z"))); // 07:59 BST
  assertFalse(isWithinPostingWindow(at("2026-01-12T07:59:00Z"))); // 07:59 GMT
});

Deno.test("15:29 is inside the window and 15:30 is outside it", () => {
  assert(isWithinPostingWindow(at("2026-06-15T14:29:00Z"))); // 15:29 BST
  assertFalse(isWithinPostingWindow(at("2026-06-15T14:30:00Z"))); // 15:30 BST
  assert(isWithinPostingWindow(at("2026-01-12T15:29:00Z"))); // 15:29 GMT
  assertFalse(isWithinPostingWindow(at("2026-01-12T15:30:00Z"))); // 15:30 GMT
});

Deno.test("window is shut Thursday to Sunday however good the hour", () => {
  assertFalse(isWithinPostingWindow(at("2026-06-18T10:00:00Z"))); // Thu 11:00
  assertFalse(isWithinPostingWindow(at("2026-06-14T10:00:00Z"))); // Sun 11:00
});

Deno.test("Wednesday is the last open day", () => {
  assert(isWithinPostingWindow(at("2026-06-17T09:00:00Z"))); // Wed 10:00 BST
});

// ── The first-slot exception ───────────────────────────────────────────

const sundayEvening = at("2026-06-14T19:00:00Z"); // Sun 20:00 BST
const MONDAY = "2026-06-15";

Deno.test("a cancellation of tomorrow's first slot posts on a Sunday evening", () => {
  assert(qualifiesForImmediatePost({
    alertType: "cancellation",
    bookingDate: MONDAY,
    slot: "08:30",
    firstSlotOfDate: "08:30",
  }, sundayEvening));
});

Deno.test("a move away from tomorrow's first slot counts the same as a cancellation", () => {
  assert(qualifiesForImmediatePost({
    alertType: "moved_off",
    bookingDate: MONDAY,
    slot: "08:30",
    firstSlotOfDate: "08:30",
  }, sundayEvening));
});

Deno.test("a cancellation of tomorrow's SECOND slot does not qualify", () => {
  assertFalse(qualifiesForImmediatePost({
    alertType: "cancellation",
    bookingDate: MONDAY,
    slot: "09:00",
    firstSlotOfDate: "08:30",
  }, sundayEvening));
});

Deno.test("the exception honours a staff-added early extra slot as the first", () => {
  // If staff opened 08:00 on that date, 08:00 is the opening appointment and
  // 08:30 is not — the grid decides, not the canonical constant.
  assert(qualifiesForImmediatePost({
    alertType: "cancellation",
    bookingDate: MONDAY,
    slot: "08:00",
    firstSlotOfDate: "08:00",
  }, sundayEvening));
  assertFalse(qualifiesForImmediatePost({
    alertType: "cancellation",
    bookingDate: MONDAY,
    slot: "08:30",
    firstSlotOfDate: "08:00",
  }, sundayEvening));
});

Deno.test("a cancellation for a date that is not tomorrow does not qualify", () => {
  assertFalse(qualifiesForImmediatePost({
    alertType: "cancellation",
    bookingDate: "2026-06-16", // the day after tomorrow
    slot: "08:30",
    firstSlotOfDate: "08:30",
  }, sundayEvening));
});

Deno.test("a new booking never qualifies, however early the slot", () => {
  assertFalse(qualifiesForImmediatePost({
    alertType: "new_booking",
    bookingDate: MONDAY,
    slot: "08:30",
    firstSlotOfDate: "08:30",
  }, sundayEvening));
});

Deno.test("there is no upper cut-off: the exception holds in the small hours", () => {
  // 02:00 BST on the Monday itself — "tomorrow" is now Tuesday, so use the
  // Sunday-into-Monday case at an antisocial hour instead.
  const lateSunday = at("2026-06-14T22:30:00Z"); // Sun 23:30 BST
  assert(qualifiesForImmediatePost({
    alertType: "cancellation",
    bookingDate: MONDAY,
    slot: "08:30",
    firstSlotOfDate: "08:30",
  }, lateSunday));
});

// ── The post / queue / drop decision ───────────────────────────────────

Deno.test("inside the window, everything posts", () => {
  const monMorning = at("2026-06-15T08:00:00Z"); // 09:00 BST
  assertEquals(
    decidePosting({
      alertType: "no_show",
      bookingDate: MONDAY,
      slot: "09:00",
      firstSlotOfDate: "08:30",
    }, monMorning),
    "post",
  );
});

Deno.test("outside the window, a trigger-driven booking alert is queued", () => {
  assertEquals(
    decidePosting({
      alertType: "new_booking",
      bookingDate: MONDAY,
      slot: "10:00",
      firstSlotOfDate: "08:30",
    }, sundayEvening),
    "queue",
  );
});

Deno.test("outside the window, a cron-driven alert is dropped, not queued", () => {
  // These re-evaluate every five minutes and heal themselves at 08:00.
  // Queueing one would flush a stale "no-show?" about yesterday.
  for (const alertType of ["no_show", "ready_overdue", "unanswered"] as const) {
    assertEquals(
      decidePosting({
        alertType,
        bookingDate: MONDAY,
        slot: "09:00",
        firstSlotOfDate: "08:30",
      }, sundayEvening),
      "drop",
      `${alertType} should be dropped out of hours`,
    );
  }
});

Deno.test("the first-slot exception is checked BEFORE the weekday test", () => {
  // The regression this guards: tomorrow being Monday means today is Sunday,
  // which fails the Mon-Wed test. Checking the weekday first would silently
  // kill the most useful out-of-hours alert there is.
  assertEquals(
    decidePosting({
      alertType: "cancellation",
      bookingDate: MONDAY,
      slot: "08:30",
      firstSlotOfDate: "08:30",
    }, sundayEvening),
    "post",
  );
});

// ── Queue staleness ────────────────────────────────────────────────────

Deno.test("a queued alert about a past date is stale", () => {
  assert(isQueuedAlertStale("2026-06-14", at("2026-06-15T08:00:00Z")));
});

Deno.test("a queued alert about today or later is not stale", () => {
  const monday = at("2026-06-15T08:00:00Z");
  assertFalse(isQueuedAlertStale("2026-06-15", monday));
  assertFalse(isQueuedAlertStale("2026-06-16", monday));
  assertFalse(isQueuedAlertStale(null, monday));
});
