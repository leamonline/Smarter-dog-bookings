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
import { WHATSAPP_TEMPLATES } from "../constants/whatsappTemplates";
import { renderSmsCollectionNotice } from "../lib/reminders/templates";
import type { Booking } from "../types/index";
import { collectionNoticeReadiness, collectionNoticeRoute, releasesHeldNotice } from "./collectionNotice";
import { buildDayStack, ownerSurname, READY_OVERDUE_MINUTES, stackConfirmation } from "./dayStack";
import { applyReminderFailures } from "./reminderFailure";
import { orderSafetyFacts } from "./safetyOrder";
import { reverseStatusFor, tokenActions, zoneForStatus, type TokenActionId } from "./salonBoard";
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
  /** A live failed reminder, as useLiveFailuresByBooking reports it (folded by applyReminderFailures). */
  reminderFailed?: boolean;
  /** Who recorded the confirmation ("staff" | "customer" | null). */
  reminderConfirmedBy?: string | null;
  /** Non-null when this booking belongs to a multi-dog grouped visit. */
  groupId?: string | null;
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
      { id: "reminder-failed", slot: "11:00", status: B.BOOKED, service: "bath-and-brush", reminderFailed: true },
      { id: "reminder-failed-but-confirmed", slot: "11:30", status: B.BOOKED, service: "bath-and-brush", reminderState: "confirmed", reminderFailed: true },
      { id: "reminder-failed-already-in", slot: "08:30", status: B.ARRIVED, service: "bath-and-brush", checkedInAt: at("08:35"), reminderFailed: true },
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
    reminderConfirmedBy: b.reminderConfirmedBy ?? null,
    confirmationChannel: b.confirmationChannel ?? null,
    _groupId: b.groupId ?? null,
    _bookingDate: date,
  } as unknown as Booking;
}

const S2_ACTION_IDS = new Set<TokenActionId>([
  "checkIn",
  "reconfirm",
  "ready",
  "confirm",
  "unconfirm",
  "didntShow",
  "undoNoShow",
]);

interface ActionFixtureCase {
  id: string;
  booking: FixtureBooking;
}

const ACTION_CASES: ActionFixtureCase[] = [
  { id: "booked-plain", booking: { id: "a1", slot: "09:00", status: B.BOOKED, service: "full-groom" } },
  { id: "booked-unconfirmed", booking: { id: "a2", slot: "09:00", status: B.BOOKED, service: "full-groom", reminderState: "sent", confirmationChannel: "whatsapp" } },
  { id: "booked-reminder-failed", booking: { id: "a3", slot: "09:00", status: B.BOOKED, service: "full-groom", reminderFailed: true } },
  { id: "booked-staff-confirmed", booking: { id: "a4", slot: "09:00", status: B.BOOKED, service: "full-groom", reminderState: "confirmed", reminderConfirmedBy: "staff" } },
  { id: "reconfirmed-staff", booking: { id: "a5", slot: "09:00", status: B.RECONFIRMED, service: "full-groom", reminderState: "confirmed", reminderConfirmedBy: "staff" } },
  { id: "reconfirmed-customer", booking: { id: "a6", slot: "09:00", status: B.RECONFIRMED, service: "full-groom", reminderState: "confirmed", reminderConfirmedBy: "customer" } },
  { id: "arrived", booking: { id: "a7", slot: "09:00", status: B.ARRIVED, service: "full-groom" } },
  { id: "ready", booking: { id: "a8", slot: "09:00", status: B.READY_FOR_COLLECTION, service: "full-groom" } },
  { id: "no-show-single", booking: { id: "a9", slot: "09:00", status: B.NO_SHOW, service: "full-groom" } },
  { id: "no-show-grouped", booking: { id: "a10", slot: "09:00", status: B.NO_SHOW, service: "full-groom", groupId: "grp-1" } },
  { id: "legacy-no-show-single", booking: { id: "a11", slot: "09:00", status: B.CANCELLED, cancelReason: "No-show", service: "full-groom" } },
  { id: "legacy-no-show-grouped", booking: { id: "a12", slot: "09:00", status: B.CANCELLED, cancelReason: "No-show", service: "full-groom", groupId: "grp-2" } },
];

function buildActionFixtures() {
  const now = new Date(at("10:00"));
  return ACTION_CASES.map((item) => {
    const b = toBooking(item.booking, GMT_DAY);
    const failedIds = new Set(item.booking.reminderFailed ? [item.booking.id] : []);
    const [row] = buildDayStack({ bookings: [b], dateStr: GMT_DAY, now });
    const [entry] = applyReminderFailures([row.entry], failedIds);
    const zone = entry.stage === "noShow" ? null : zoneForStatus(b.status);
    const actions = tokenActions({ entry, booking: b, zone })
      .filter((a) => S2_ACTION_IDS.has(a.id))
      .map((a) => ({ id: a.id, label: a.label, kind: a.kind }));
    return { id: item.id, booking: item.booking, actions };
  });
}

function buildReverseFixtures() {
  const actions: TokenActionId[] = ["checkIn", "reconfirm", "ready", "confirm", "unconfirm", "didntShow", "undoNoShow"];
  const statuses = [B.BOOKED, B.RECONFIRMED, B.ARRIVED, B.READY_FOR_COLLECTION, B.COMPLETED, B.NO_SHOW, B.CANCELLED];
  return actions.flatMap((action) =>
    statuses.map((previousStatus) => ({
      action,
      previousStatus,
      expected: reverseStatusFor(action, previousStatus),
    })),
  );
}

function buildCollectionFixtures() {
  const readyTemplate = WHATSAPP_TEMPLATES.find((t) => t.name === "ready_for_collection_v2")!;
  const routeCases = [
    { id: "wa-ok", contact: { phone: "07700 900123", whatsapp: true }, whatsappUnreachable: false },
    { id: "wa-unreachable", contact: { phone: "07700 900123", whatsapp: true }, whatsappUnreachable: true },
    { id: "wa-unreachable-sms-stop", contact: { phone: "07700 900123", whatsapp: true, sms_opted_out: true }, whatsappUnreachable: true },
    { id: "wa-opted-out", contact: { phone: "07700 900123", whatsapp: true, whatsapp_opted_out: true }, whatsappUnreachable: false },
    { id: "both-opted-out", contact: { phone: "07700 900123", whatsapp: true, whatsapp_opted_out: true, sms_opted_out: true }, whatsappUnreachable: false },
    { id: "sms-preferred", contact: { phone: "+447700900123", whatsapp: false }, whatsappUnreachable: false },
    { id: "sms-preferred-opted-out", contact: { phone: "07700 900123", whatsapp: false, sms_opted_out: true }, whatsappUnreachable: false },
    { id: "no-phone", contact: { phone: null, whatsapp: true }, whatsappUnreachable: false },
    { id: "landline", contact: { phone: "01632 960123", whatsapp: false }, whatsappUnreachable: false },
  ].map((c) => {
    const r = collectionNoticeRoute(c.contact, { whatsappUnreachable: c.whatsappUnreachable });
    return {
      ...c,
      channel: r.channel,
      because: r.channel === "sms" ? r.because : null,
      reason: r.channel === null ? r.reason : null,
    };
  });

  const readinessCases = [
    {
      id: "single-ready",
      currentBookingId: "1",
      rows: [{ id: "1", status: B.READY_FOR_COLLECTION, dogName: "Bella" }],
    },
    {
      id: "sibling-still-arrived",
      currentBookingId: "1",
      rows: [
        { id: "1", status: B.READY_FOR_COLLECTION, dogName: "Bella" },
        { id: "2", status: B.ARRIVED, dogName: "Max" },
      ],
    },
    {
      id: "two-ready-one-cancelled-one-done",
      currentBookingId: "2",
      rows: [
        { id: "1", status: B.READY_FOR_COLLECTION, dogName: "Bella" },
        { id: "2", status: B.ARRIVED, dogName: "Max" },
        { id: "3", status: B.COMPLETED, dogName: "Biscuit" },
        { id: "4", status: B.NO_SHOW, dogName: "Rolo" },
      ],
    },
  ].map((c) => {
    const res = collectionNoticeReadiness(
      c.rows.map((r) => ({ id: r.id, status: r.status, dog_name_snapshot: r.dogName })),
      c.currentBookingId,
    );
    return { ...c, readyDogNames: res.readyDogNames, waitingDogNames: res.waitingDogNames };
  });

  const releaseCases = [
    { before: B.BOOKED, after: B.NO_SHOW },
    { before: B.ARRIVED, after: B.CANCELLED },
    { before: B.ARRIVED, after: B.READY_FOR_COLLECTION },
    { before: B.BOOKED, after: B.ARRIVED },
    { before: B.READY_FOR_COLLECTION, after: B.COMPLETED },
  ].map((c) => ({
    ...c,
    releases: releasesHeldNotice({ status: c.before, ownerId: "h1", date: GMT_DAY }, { status: c.after, ownerId: "h1", date: GMT_DAY }),
  }));

  const textCases = [
    { dogNames: ["bella"], minutes: "15" },
    { dogNames: ["bella", "max"], minutes: "20" },
    { dogNames: ["bella", "max", "daisy"], minutes: "" },
  ].map((c) => {
    const titled = c.dogNames.map((n) => n.replace(/\b\w/g, (ch) => ch.toUpperCase()));
    const joined = titled.length <= 1 ? (titled[0] ?? "") : `${titled.slice(0, -1).join(", ")} and ${titled[titled.length - 1]}`;
    return {
      ...c,
      whatsappPreview: readyTemplate.preview({ dog_name: joined || "Your dog", minutes: c.minutes || "__" }),
      smsText: renderSmsCollectionNotice({ dogNames: titled, minutes: c.minutes || "__" }),
    };
  });

  return { routes: routeCases, readiness: readinessCases, releases: releaseCases, texts: textCases };
}

function rowsFor(scenario: Scenario) {
  const now = new Date(scenario.now);
  const bookings = scenario.bookings.map((b) => toBooking(b, scenario.date));
  const breedById = Object.fromEntries(scenario.bookings.filter((b) => b.breed).map((b) => [b.id, b.breed as string]));
  const failedIds = new Set(scenario.bookings.filter((b) => b.reminderFailed).map((b) => b.id));
  return buildDayStack({ bookings, dateStr: scenario.date, now, breedById }).map((row) => {
    // The same fold TodayView applies: a live failed reminder makes a Booked dog unconfirmed.
    const [entry] = applyReminderFailures([row.entry], failedIds);
    const tone = resolveDayStatus(row.booking.status, row.booking.cancelReason, stackConfirmation(entry));
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
    actions: buildActionFixtures(),
    reversals: buildReverseFixtures(),
    collection: buildCollectionFixtures(),
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
    for (const tone of ["expected", "unconfirmed", "reminderFailed", "confirmed", "reconfirmed", "arrived", "ready", "noShow"]) {
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
