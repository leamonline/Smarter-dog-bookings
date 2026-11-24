// The iPhone staff Today screen (ios/SmarterDog/StaffDayStack.swift) is a Swift copy of
// the day stack this website shows on /staff/today. This is the guard that stops it
// drifting. It runs the REAL website engines on one governed list of day scenarios and
// writes their answers to ios/AuthCoreTests/staff-day-parity.json: which dogs are on
// the stack and in what order, each row's time, subtitle, timing line and urgency, its
// status word and colours, and the order safety warnings are read in. The Swift tests
// run the Swift copy against that file. This test fails if the file is out of date, so
// a website change to any of these rules cannot land without the iPhone being
// re-measured.
//
// To refresh the file after a deliberate change:
//   UPDATE_IOS_STAFF_DAY_FIXTURES=1 npx vitest run src/engine/staffDayParity.ios.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveDayStatus } from "../components/ui/BookingStatusBadge";
import { BOOKING_STATUS } from "../constants/salon";
import { STATUS_TONES, UNKNOWN_STATUS_TONE } from "../constants/statusPalette";
import type { Booking } from "../types/index";
import { buildDayStack, ownerSurname, READY_OVERDUE_MINUTES, stackConfirmation } from "./dayStack";
import { orderSafetyFacts } from "./safetyOrder";
import { formatDuration } from "./today";

const root = join(__dirname, "..", "..");
const JSON_PATH = join(root, "ios/AuthCoreTests/staff-day-parity.json");

/** The booking fields the stack reads, as the app holds them after the row transform. */
interface FixtureBooking {
  id: string;
  slot: string;
  status: string;
  service?: string;
  cancelReason?: string | null;
  checkedInAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  reminderState?: "confirmed" | "sent" | "none";
  confirmationChannel?: string | null;
  breed?: string;
}

interface Scenario {
  id: string;
  description: string;
  /** The browsed date, London. */
  date: string;
  /** The instant the screen is drawn. */
  now: string;
  bookings: FixtureBooking[];
}

const B = BOOKING_STATUS;

// Tuesday 24 November 2026 is GMT, so London wall clock equals UTC.
const GMT_DAY = "2026-11-24";
const at = (hhmm: string, day = GMT_DAY) => `${day}T${hhmm}:00.000Z`;

const SCENARIOS: Scenario[] = [
  {
    id: "today-every-stage",
    description: "a working morning at 10:00 with every stage, late dogs, the next arrival and dogs that leave the stack",
    date: GMT_DAY,
    now: at("10:00"),
    bookings: [
      { id: "home", slot: "08:30", status: B.COMPLETED, service: "full-groom", completedAt: at("09:40"), breed: "Cockapoo" },
      { id: "in-1", slot: "08:30", status: B.ARRIVED, service: "full-groom", checkedInAt: at("08:32"), breed: "Cockapoo" },
      { id: "in-2", slot: "08:30", status: B.ARRIVED, service: "bath-and-brush", checkedInAt: at("08:40") },
      { id: "ready-long", slot: "09:00", status: B.READY_FOR_COLLECTION, service: "bath-and-deshed", readyAt: at("09:10"), breed: "Husky" },
      { id: "late-hour", slot: "09:00", status: B.BOOKED, service: "puppy-groom", breed: "Shih Tzu" },
      { id: "late-unconfirmed", slot: "09:30", status: B.BOOKED, service: "full-groom", reminderState: "sent", confirmationChannel: "whatsapp" },
      { id: "next", slot: "10:30", status: B.RECONFIRMED, service: "full-groom", breed: "Poodle" },
      { id: "confirmed", slot: "11:00", status: B.BOOKED, service: "full-groom", reminderState: "confirmed" },
      { id: "asked-not-to-confirm", slot: "11:00", status: B.BOOKED, service: "full-groom", reminderState: "sent", confirmationChannel: "none" },
      { id: "cancelled", slot: "11:30", status: B.CANCELLED, service: "full-groom", cancelReason: "Owner unwell" },
      { id: "no-show", slot: "12:00", status: B.NO_SHOW, service: "full-groom" },
      { id: "legacy-no-show", slot: "12:30", status: B.CANCELLED, service: "full-groom", cancelReason: " No-Show " },
      { id: "unknown-status", slot: "12:30", status: "Weird", service: "full-groom" },
      { id: "seconds-slot", slot: "13:00:00", status: B.BOOKED, service: "full-groom" },
      { id: "service-name-not-id", slot: "13:00", status: B.BOOKED, service: "Full Groom", breed: "Labrador" },
    ],
  },
  {
    id: "today-no-arrival",
    description: "a dog two hours past its slot reads 'No arrival', not hours late",
    date: GMT_DAY,
    now: at("11:30"),
    bookings: [
      { id: "very-late", slot: "08:30", status: B.BOOKED, service: "full-groom" },
      { id: "just-under-two-hours", slot: "09:31", status: B.BOOKED, service: "full-groom" },
      { id: "reconfirmed-late", slot: "10:00", status: B.RECONFIRMED, service: "full-groom" },
    ],
  },
  {
    id: "today-due-now",
    description: "inside the five-minute grace the next dog is 'due now', not late",
    date: GMT_DAY,
    now: at("10:34"),
    bookings: [
      { id: "grace", slot: "10:30", status: B.BOOKED, service: "full-groom" },
      { id: "after", slot: "11:00", status: B.BOOKED, service: "full-groom" },
    ],
  },
  {
    id: "today-grace-edge",
    description: "exactly five minutes past the slot is not late; six is",
    date: GMT_DAY,
    now: at("10:35"),
    bookings: [
      { id: "five-past", slot: "10:30", status: B.BOOKED, service: "full-groom" },
      { id: "six-past", slot: "10:29", status: B.BOOKED, service: "full-groom" },
    ],
  },
  {
    id: "today-long-waits",
    description: "the in-salon and ready thresholds, and stamps missing or in the future",
    date: GMT_DAY,
    now: at("12:00"),
    bookings: [
      { id: "in-three-hours", slot: "08:30", status: B.ARRIVED, service: "full-groom", checkedInAt: at("09:00") },
      { id: "in-just-under", slot: "08:30", status: B.ARRIVED, service: "full-groom", checkedInAt: at("09:01") },
      { id: "in-no-stamp", slot: "09:00", status: B.ARRIVED, service: "full-groom", checkedInAt: null },
      { id: "ready-45", slot: "09:00", status: B.READY_FOR_COLLECTION, service: "full-groom", readyAt: at("11:15") },
      { id: "ready-44", slot: "09:30", status: B.READY_FOR_COLLECTION, service: "full-groom", readyAt: at("11:16") },
      { id: "ready-no-stamp", slot: "09:30", status: B.READY_FOR_COLLECTION, service: "full-groom", readyAt: null },
      { id: "ready-clock-skew", slot: "10:00", status: B.READY_FOR_COLLECTION, service: "full-groom", readyAt: at("12:03") },
      { id: "postgres-stamp", slot: "10:00", status: B.ARRIVED, service: "full-groom", checkedInAt: `${GMT_DAY}T10:58:59.123456+00:00` },
    ],
  },
  {
    id: "today-nothing-to-wait-for",
    description: "every dog has arrived, so there is no countdown",
    date: GMT_DAY,
    now: at("09:00"),
    bookings: [
      { id: "arrived", slot: "08:30", status: B.ARRIVED, service: "full-groom", checkedInAt: at("08:31") },
      { id: "ready", slot: "08:30", status: B.READY_FOR_COLLECTION, service: "full-groom", readyAt: at("08:55") },
    ],
  },
  {
    id: "summer-time",
    description: "a British Summer Time day: the London clock is an hour ahead of UTC",
    date: "2026-07-14",
    now: "2026-07-14T09:00:00.000Z",
    bookings: [
      { id: "late-bst", slot: "09:00", status: B.BOOKED, service: "full-groom" },
      { id: "in-bst", slot: "08:30", status: B.ARRIVED, service: "full-groom", checkedInAt: "2026-07-14T08:05:00.000Z" },
      { id: "next-bst", slot: "11:00", status: B.BOOKED, service: "full-groom" },
    ],
  },
  {
    id: "future-day",
    description: "tomorrow: the order and statuses, no timing at all",
    date: "2026-11-25",
    now: at("10:00"),
    bookings: [
      { id: "f-unconfirmed", slot: "09:00", status: B.BOOKED, service: "full-groom", reminderState: "sent", confirmationChannel: "sms" },
      { id: "f-confirmed", slot: "08:30", status: B.BOOKED, service: "full-groom", reminderState: "confirmed" },
      { id: "f-no-show", slot: "10:00", status: B.NO_SHOW, service: "full-groom" },
      { id: "f-done", slot: "10:00", status: B.COMPLETED, service: "full-groom" },
    ],
  },
  {
    id: "past-day",
    description: "yesterday: arrived and ready dogs carry no elapsed time",
    date: "2026-11-23",
    now: at("10:00"),
    bookings: [
      { id: "p-ready", slot: "09:00", status: B.READY_FOR_COLLECTION, service: "full-groom", readyAt: "2026-11-23T09:30:00.000Z" },
      { id: "p-booked", slot: "08:30", status: B.BOOKED, service: "full-groom" },
    ],
  },
];

const SAFETY_CASES: string[][] = [
  [],
  ["Senior (Needs breaks)", "Bites / Nips"],
  ["Nervous / Anxious", "Something staff typed", "Reactive to dogs", "Pregnant"],
  ["Fear of dryer", "Sensitive paws", "Kennel aggressive", "Senior (Needs breaks)"],
  ["Typed one", "Typed two"],
];

function toBooking(b: FixtureBooking, date: string): Booking {
  return {
    id: b.id,
    slot: b.slot,
    status: b.status,
    service: b.service ?? "",
    cancelReason: b.cancelReason ?? null,
    checkedInAt: b.checkedInAt ?? null,
    readyAt: b.readyAt ?? null,
    completedAt: b.completedAt ?? null,
    reminderState: b.reminderState ?? "none",
    confirmationChannel: b.confirmationChannel ?? null,
    _bookingDate: date,
  } as unknown as Booking;
}

function rowsFor(scenario: Scenario) {
  const now = new Date(scenario.now);
  const bookings = scenario.bookings.map((b) => toBooking(b, scenario.date));
  const breedById = Object.fromEntries(scenario.bookings.filter((b) => b.breed).map((b) => [b.id, b.breed as string]));
  return buildDayStack({ bookings, dateStr: scenario.date, now, breedById }).map((row) => {
    const tone = resolveDayStatus(row.booking.status, row.booking.cancelReason, stackConfirmation(row.entry));
    return {
      id: row.id,
      time: row.time,
      subtitle: row.subtitle,
      timing: row.timing,
      urgent: row.urgent,
      readyOverdue: row.readyOverdue,
      countdown: row.countdown,
      tone: tone.key,
      label: tone.label,
    };
  });
}

function build() {
  const tones = Object.fromEntries(
    Object.entries(STATUS_TONES).map(([key, t]) => [key, { label: t.label, tint: t.tint, ink: t.ink, meta: t.meta, edge: t.edge }]),
  );
  return {
    note: "Generated by src/engine/staffDayParity.ios.test.ts from the website's day stack. Do not edit by hand.",
    readyOverdueMinutes: READY_OVERDUE_MINUTES,
    scenarios: SCENARIOS.map((scenario) => ({ ...scenario, rows: rowsFor(scenario) })),
    safety: SAFETY_CASES.map((facts) => ({ facts, ordered: orderSafetyFacts(facts) })),
    durations: [0, 1, 59, 60, 61, 119, 120, 125, 200].map((minutes) => ({ minutes, text: formatDuration(minutes) })),
    surnames: ["Sam Taylor", "  Anne  Marie  Jones ", "Cher", "", "O'Neill-Smith"].map((name) => ({ name, surname: ownerSurname(name) })),
    tones,
    unknownTone: { tint: UNKNOWN_STATUS_TONE.tint, ink: UNKNOWN_STATUS_TONE.ink, meta: UNKNOWN_STATUS_TONE.meta, edge: UNKNOWN_STATUS_TONE.edge },
  };
}

describe("iPhone staff day parity file", () => {
  it("is up to date with the website engine", () => {
    const expected = build();
    if (process.env.UPDATE_IOS_STAFF_DAY_FIXTURES === "1") {
      writeFileSync(JSON_PATH, `${JSON.stringify(expected, null, 1)}\n`);
    }
    const onDisk = JSON.parse(readFileSync(JSON_PATH, "utf8"));
    expect(onDisk, "run with UPDATE_IOS_STAFF_DAY_FIXTURES=1 to regenerate").toEqual(expected);
  });

  it("covers what the Swift copy must get right, so a lazy copy cannot pass", () => {
    const data = build();
    const rows = data.scenarios.flatMap((s) => s.rows);
    const timings = new Set(rows.map((r) => r.timing));
    for (const expected of ["due now", "No arrival", "waiting 45 min", "3 hrs", "1 hr late"]) {
      expect(timings, expected).toContain(expected);
    }
    expect(timings).toContain(null);
    expect(rows.some((r) => r.countdown)).toBe(true);
    expect(rows.some((r) => r.readyOverdue)).toBe(true);
    for (const tone of ["expected", "unconfirmed", "confirmed", "reconfirmed", "arrived", "ready", "noShow"]) {
      expect(rows.map((r) => r.tone), tone).toContain(tone);
    }
    // Dogs that leave the stack really are absent.
    const ids = rows.map((r) => r.id);
    for (const gone of ["home", "cancelled", "unknown-status", "f-done"]) expect(ids).not.toContain(gone);
    // Two dogs in one slot keep the order they came in.
    const everyStage = data.scenarios.find((s) => s.id === "today-every-stage")!.rows.map((r) => r.id);
    expect(everyStage.indexOf("in-1")).toBeLessThan(everyStage.indexOf("in-2"));
    // Safety order really moves things.
    expect(data.safety.some((c) => c.ordered.join() !== c.facts.join())).toBe(true);
  });
});
