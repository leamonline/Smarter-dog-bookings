// Shared capacity scenarios for cross-runtime parity.
//
// WHY THIS EXISTS
//
// The capacity rules are implemented three times: this repository's browser
// engine (src/engine/capacity.ts), a hand-mirrored Deno copy
// (supabase/functions/_shared/capacity.ts), and the authoritative PostgreSQL
// trigger validate_booking_capacity(). Two of those three are already guarded
// against each other by src/lib/whatsapp/capacityParity.test.ts. The database —
// the one that actually decides — is tested only on its own terms, by
// supabase/tests/035_capacity_behaviour.test.sql.
//
// So nothing has ever fed the SAME scenario to the browser engine and to
// PostgreSQL and compared the verdicts. A disagreement there is the failure
// customers feel: a slot the interface offers, that the database then refuses.
//
// This file is the single scenario list both runtimes consume. It states
// scenarios only — never verdicts. The TypeScript verdict is computed from the
// real engine, and PostgreSQL's verdict is observed by attempting the insert;
// writing an expected answer here by hand would just encode one runtime's
// opinion and hide the very disagreement the harness exists to find.
//
// TWO KINDS OF SCENARIO, ASKING DIFFERENT QUESTIONS
//
//   "single" — one candidate booking against a stated day. The engine answers
//   through canBookSlot(); the database through an INSERT its trigger either
//   permits or rejects. The two verdicts must match.
//
//   "group"  — a multi-dog booking. Here the engine does not answer yes/no: it
//   OFFERS allocations through findGroupedSlots(), and the customer picks one.
//   The parity question is therefore directional and stronger than a verdict
//   match: EVERY allocation the engine offers must be one the database accepts,
//   inserted as a whole group. An offer the database then refuses is exactly
//   the customer-facing failure this harness exists to rule out, and grouped
//   allocation is where the engine does its most intricate work.
import { DAILY_DOG_CAP } from "../constants/salon";
import type { DogSize, SlotOverrides } from "../types";

/** Staff-blocked seats for a whole day, keyed by slot then seat index. */
export type DayOverrides = Record<string, SlotOverrides>;

interface BaseFixture {
  /** Stable identifier, used to correlate the two runtimes' answers. */
  id: string;
  /** Which rule this scenario is probing, for grouping the evidence. */
  rule:
    | "per-slot-seats"
    | "2-2-1"
    | "large-dog-seats"
    | "large-dog-adjacency"
    | "early-close"
    | "blocked-seats"
    | "daily-cap"
    | "extra-slots"
    | "grouped-allocation";
  description: string;
  /** Bookings already on the day, in the order they were made. */
  existing: Array<{ slot: string; size: DogSize }>;
  /** Staff seat overrides for the day, keyed by slot then seat index. */
  overrides?: DayOverrides;
  /** Per-date extra slots after 13:00 (day_settings.extra_slots). */
  extraSlots?: string[];
  /** salon_config.daily_dog_cap for this scenario. Defaults to the real cap. */
  dailyCap?: number;
}

export interface SingleCapacityFixture extends BaseFixture {
  kind: "single";
  /** The booking whose eligibility both runtimes must answer. */
  candidate: { slot: string; size: DogSize };
}

export interface GroupCapacityFixture extends BaseFixture {
  kind: "group";
  /** The dogs booked together, in order. */
  dogs: DogSize[];
}

export type CapacityParityFixture = SingleCapacityFixture | GroupCapacityFixture;

const small = (slot: string) => ({ slot, size: "small" as DogSize });
const medium = (slot: string) => ({ slot, size: "medium" as DogSize });
const large = (slot: string) => ({ slot, size: "large" as DogSize });

// A day full enough to leave exactly one seat, used by several scenarios.
const fourAcrossTwoSlots = [small("09:00"), small("09:00"), small("09:30"), small("09:30")];

export const CAPACITY_PARITY_FIXTURES: CapacityParityFixture[] = [
  // ---- per-slot seats -----------------------------------------------------
  {
    kind: "single",
    id: "seats-empty-day-first",
    rule: "per-slot-seats",
    description: "first small dog into an empty slot on an empty day",
    existing: [],
    candidate: small("09:00"),
  },
  {
    kind: "single",
    id: "seats-second-in-slot",
    rule: "per-slot-seats",
    description: "second small dog shares a slot that holds two seats",
    existing: [small("09:00")],
    candidate: small("09:00"),
  },
  {
    kind: "single",
    id: "seats-third-in-slot",
    rule: "per-slot-seats",
    description: "third small dog into a slot that already holds two",
    existing: [small("09:00"), small("09:00")],
    candidate: small("09:00"),
  },
  {
    kind: "single",
    id: "seats-medium-shares-with-small",
    rule: "per-slot-seats",
    description: "a medium dog takes a seat exactly as a small one does",
    existing: [small("10:00")],
    candidate: medium("10:00"),
  },

  // ---- the 2-2-1 rule -----------------------------------------------------
  {
    kind: "single",
    id: "221-third-window-first-seat",
    rule: "2-2-1",
    description: "two full preceding slots cap the third at one seat — first seat",
    existing: fourAcrossTwoSlots,
    candidate: small("10:00"),
  },
  {
    kind: "single",
    id: "221-third-window-second-seat",
    rule: "2-2-1",
    description: "two full preceding slots cap the third at one seat — second seat refused",
    existing: [...fourAcrossTwoSlots, small("10:00")],
    candidate: small("10:00"),
  },
  {
    kind: "single",
    id: "221-gap-resets-window",
    rule: "2-2-1",
    description: "a half-full middle slot does not trigger the 2-2-1 cap",
    existing: [small("09:00"), small("09:00"), small("09:30")],
    candidate: small("10:00"),
  },
  {
    kind: "single",
    id: "221-window-slides-forward",
    rule: "2-2-1",
    description: "the capped slot itself starts a new window, so the next slot is free again",
    existing: [...fourAcrossTwoSlots, small("10:00")],
    candidate: small("10:30"),
  },

  // ---- large-dog seat cost ------------------------------------------------
  {
    kind: "single",
    id: "large-0830-single-seat",
    rule: "large-dog-seats",
    description: "large dog at 08:30 costs one seat",
    existing: [],
    candidate: large("08:30"),
  },
  {
    kind: "single",
    id: "large-shares-0830-with-small",
    rule: "large-dog-seats",
    description: "small dog joins a large dog already at 08:30",
    existing: [large("08:30")],
    candidate: small("08:30"),
  },
  {
    kind: "single",
    id: "large-1230-full-takeover",
    rule: "large-dog-seats",
    description: "large dog at 12:30 takes the whole slot",
    existing: [],
    candidate: large("12:30"),
  },
  {
    kind: "single",
    id: "large-1230-blocks-small",
    rule: "large-dog-seats",
    description: "small dog refused at 12:30 once a large dog has taken it",
    existing: [large("12:30")],
    candidate: small("12:30"),
  },
  {
    kind: "single",
    id: "large-into-occupied-1230",
    rule: "large-dog-seats",
    description: "large dog refused at 12:30 when the slot already has a booking",
    existing: [small("12:30")],
    candidate: large("12:30"),
  },
  {
    kind: "single",
    id: "large-1200-single-seat-shared",
    rule: "large-dog-seats",
    description: "12:00 large dog costs one seat, so a small dog can still share",
    existing: [large("12:00")],
    candidate: small("12:00"),
  },

  // ---- large-dog adjacency ------------------------------------------------
  {
    kind: "single",
    id: "large-back-to-back-0830-0900",
    rule: "large-dog-adjacency",
    description: "back-to-back large dogs at 08:30 then 09:00",
    existing: [large("08:30")],
    candidate: large("09:00"),
  },
  {
    kind: "single",
    id: "large-back-to-back-1230-1300",
    rule: "large-dog-adjacency",
    description: "back-to-back large dogs at 12:30 then 13:00 (the permitted pair)",
    existing: [large("12:30")],
    candidate: large("13:00"),
  },
  {
    kind: "single",
    id: "large-0900-needs-empty-0830",
    rule: "large-dog-adjacency",
    description: "09:00 large dog while 08:30 holds a small dog",
    existing: [small("08:30")],
    candidate: large("09:00"),
  },

  // ---- early close --------------------------------------------------------
  {
    kind: "single",
    id: "early-close-1300-after-1200-large",
    rule: "early-close",
    description: "13:00 refused after a large dog at 12:00 triggers early close",
    existing: [large("12:00")],
    candidate: small("13:00"),
  },
  {
    kind: "single",
    id: "large-1200-with-1300-occupied",
    rule: "early-close",
    description: "large dog at 12:00 while 13:00 already holds a booking",
    existing: [small("13:00")],
    candidate: large("12:00"),
  },

  // ---- blocked seats ------------------------------------------------------
  {
    kind: "single",
    id: "blocked-seat-halves-slot",
    rule: "blocked-seats",
    description: "one blocked seat leaves a single usable seat in the slot",
    existing: [],
    overrides: { "08:30": { 0: "blocked" } },
    candidate: small("08:30"),
  },
  {
    kind: "single",
    id: "blocked-seat-second-refused",
    rule: "blocked-seats",
    description: "second dog refused when one seat of the slot is blocked",
    existing: [small("08:30")],
    overrides: { "08:30": { 0: "blocked" } },
    candidate: small("08:30"),
  },
  {
    kind: "single",
    id: "blocked-seat-does-not-cascade",
    rule: "blocked-seats",
    description: "a block on one slot does not reduce its neighbour",
    existing: [],
    overrides: { "09:00": { 0: "blocked" } },
    candidate: small("09:30"),
  },
  {
    kind: "single",
    id: "blocked-both-seats-closes-slot",
    rule: "blocked-seats",
    description: "blocking both seats closes the slot entirely",
    existing: [],
    overrides: { "10:00": { 0: "blocked", 1: "blocked" } },
    candidate: small("10:00"),
  },

  // ---- daily cap ----------------------------------------------------------
  // Deliberately covered by GROUP scenarios only, further down, not by single
  // ones. The cap applies to non-staff writes, and the two engine entry points
  // are split along the same line: findGroupedSlots() takes a dailyDogCap and
  // serves the customer wizard and the WhatsApp Flow, while canBookSlot()
  // models per-slot rules only and serves the staff modals, where the cap does
  // not apply. Asking canBookSlot() a cap question and comparing it against a
  // non-staff database session compares two things that are not meant to
  // match, and would report a divergence that is really a category error.

  // ---- extra slots --------------------------------------------------------
  // Staff can add per-date slots after 13:00. They join the bookable grid, and
  // the 2-2-1 windowing runs across the 13:00 → extras boundary.
  {
    kind: "single",
    id: "extra-slot-bookable",
    rule: "extra-slots",
    description: "a staff-added 13:30 slot accepts a small dog",
    existing: [],
    extraSlots: ["13:30"],
    candidate: small("13:30"),
  },
  {
    kind: "single",
    id: "extra-slot-absent-is-refused",
    rule: "extra-slots",
    description: "the same 13:30 slot is refused when staff have not added it",
    existing: [],
    candidate: small("13:30"),
  },
  {
    kind: "single",
    id: "extra-slot-221-crosses-boundary",
    rule: "extra-slots",
    description: "the 2-2-1 window runs across the 13:00 → extras boundary",
    existing: [small("12:30"), small("12:30"), small("13:00"), small("13:00")],
    extraSlots: ["13:30"],
    candidate: small("13:30"),
  },

  // ---- grouped multi-dog allocation ---------------------------------------
  // The deepest coverage, because this is where the engine does its most
  // intricate work and where an offer the database refuses would surface as a
  // customer completing a booking wizard that then fails.
  {
    kind: "group",
    id: "group-two-smalls-empty-day",
    rule: "grouped-allocation",
    description: "two small dogs on an empty day",
    existing: [],
    dogs: ["small", "small"],
  },
  {
    kind: "group",
    id: "group-three-smalls-empty-day",
    rule: "grouped-allocation",
    description: "three small dogs must span slots — 2-2-1 constrains the spread",
    existing: [],
    dogs: ["small", "small", "small"],
  },
  {
    kind: "group",
    id: "group-four-smalls-empty-day",
    rule: "grouped-allocation",
    description: "four small dogs across consecutive slots under the 2-2-1 cap",
    existing: [],
    dogs: ["small", "small", "small", "small"],
  },
  {
    kind: "group",
    id: "group-five-smalls-empty-day",
    rule: "grouped-allocation",
    description: "five dogs — the most a rolling three-slot window can hold",
    existing: [],
    dogs: ["small", "small", "small", "small", "small"],
  },
  {
    kind: "group",
    id: "group-mixed-sizes",
    rule: "grouped-allocation",
    description: "a small and a medium booked together",
    existing: [],
    dogs: ["small", "medium"],
  },
  {
    kind: "group",
    id: "group-with-large-dog",
    rule: "grouped-allocation",
    description: "a large dog grouped with a small one, where slot eligibility differs by size",
    existing: [],
    dogs: ["large", "small"],
  },
  {
    kind: "group",
    id: "group-two-larges",
    rule: "grouped-allocation",
    description: "two large dogs together, constrained by the adjacency rule",
    existing: [],
    dogs: ["large", "large"],
  },
  {
    kind: "group",
    id: "group-onto-partly-full-day",
    rule: "grouped-allocation",
    description: "two dogs onto a day whose morning is already half booked",
    existing: [small("09:00"), small("09:30"), small("10:00")],
    dogs: ["small", "small"],
  },
  {
    kind: "group",
    id: "group-onto-2-2-1-constrained-day",
    rule: "grouped-allocation",
    description: "two dogs onto a day where the 2-2-1 window is already engaged",
    existing: fourAcrossTwoSlots,
    dogs: ["small", "small"],
  },
  {
    kind: "group",
    id: "group-with-blocked-seats",
    rule: "grouped-allocation",
    description: "grouped allocation must route around a staff-blocked seat",
    existing: [],
    overrides: { "09:00": { 0: "blocked" }, "09:30": { 0: "blocked" } },
    dogs: ["small", "small"],
  },
  {
    kind: "group",
    id: "group-into-extra-slots",
    rule: "grouped-allocation",
    description: "grouped allocation may use staff-added extra slots",
    existing: [small("09:00"), small("09:00"), small("09:30"), small("09:30"), small("10:00")],
    extraSlots: ["13:30", "14:00"],
    dogs: ["small", "small"],
  },
  {
    kind: "group",
    id: "group-near-daily-cap",
    rule: "grouped-allocation",
    description: "a pair that exactly reaches a cap of 5",
    existing: [small("09:00"), small("09:00"), small("10:00")],
    dailyCap: 5,
    dogs: ["small", "small"],
  },
  {
    kind: "group",
    id: "group-exceeds-daily-cap",
    rule: "grouped-allocation",
    description: "a pair that would breach a cap of 4 — the engine must not offer one",
    existing: [small("09:00"), small("09:00"), small("10:00")],
    dailyCap: 4,
    dogs: ["small", "small"],
  },
  {
    kind: "group",
    id: "group-large-plus-two-smalls",
    rule: "grouped-allocation",
    description: "three dogs of mixed size, where the large one restricts its own slot set",
    existing: [],
    dogs: ["large", "small", "small"],
  },
  {
    kind: "group",
    id: "group-onto-nearly-full-day",
    rule: "grouped-allocation",
    description: "a pair onto a day with little room left",
    existing: [
      small("08:30"),
      small("08:30"),
      small("09:00"),
      small("09:30"),
      small("09:30"),
      small("10:00"),
    ],
    dogs: ["small", "small"],
  },
];

/** The daily cap a scenario runs under. */
export function capFor(fixture: CapacityParityFixture): number {
  return fixture.dailyCap ?? DAILY_DOG_CAP;
}
