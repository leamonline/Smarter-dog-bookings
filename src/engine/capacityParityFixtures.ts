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
// Every scenario is a single candidate booking against a stated day, which is
// the smallest unit both runtimes can answer identically: the engine through
// canBookSlot(), the database through an INSERT that its trigger either
// permits or rejects.
import type { DogSize, SlotOverrides } from "../types";

export interface CapacityParityFixture {
  /** Stable identifier, used to correlate the two runtimes' answers. */
  id: string;
  /** Which rule this scenario is probing, for grouping the evidence. */
  rule:
    | "per-slot-seats"
    | "2-2-1"
    | "large-dog-seats"
    | "large-dog-adjacency"
    | "early-close"
    | "blocked-seats";
  description: string;
  /** Bookings already on the day, in the order they were made. */
  existing: Array<{ slot: string; size: DogSize }>;
  /** Staff seat overrides for the day, if any. */
  overrides?: SlotOverrides;
  /** The booking whose eligibility both runtimes must answer. */
  candidate: { slot: string; size: DogSize };
}

const small = (slot: string) => ({ slot, size: "small" as DogSize });
const large = (slot: string) => ({ slot, size: "large" as DogSize });

export const CAPACITY_PARITY_FIXTURES: CapacityParityFixture[] = [
  // ---- per-slot seats -----------------------------------------------------
  {
    id: "seats-empty-day-first",
    rule: "per-slot-seats",
    description: "first small dog into an empty slot on an empty day",
    existing: [],
    candidate: small("09:00"),
  },
  {
    id: "seats-second-in-slot",
    rule: "per-slot-seats",
    description: "second small dog shares a slot that holds two seats",
    existing: [small("09:00")],
    candidate: small("09:00"),
  },
  {
    id: "seats-third-in-slot",
    rule: "per-slot-seats",
    description: "third small dog into a slot that already holds two",
    existing: [small("09:00"), small("09:00")],
    candidate: small("09:00"),
  },

  // ---- the 2-2-1 rule -----------------------------------------------------
  {
    id: "221-third-window-first-seat",
    rule: "2-2-1",
    description: "two full preceding slots cap the third at one seat — first seat",
    existing: [small("09:00"), small("09:00"), small("09:30"), small("09:30")],
    candidate: small("10:00"),
  },
  {
    id: "221-third-window-second-seat",
    rule: "2-2-1",
    description: "two full preceding slots cap the third at one seat — second seat refused",
    existing: [
      small("09:00"),
      small("09:00"),
      small("09:30"),
      small("09:30"),
      small("10:00"),
    ],
    candidate: small("10:00"),
  },
  {
    id: "221-gap-resets-window",
    rule: "2-2-1",
    description: "a half-full middle slot does not trigger the 2-2-1 cap",
    existing: [small("09:00"), small("09:00"), small("09:30")],
    candidate: small("10:00"),
  },

  // ---- large-dog seat cost ------------------------------------------------
  {
    id: "large-0830-single-seat",
    rule: "large-dog-seats",
    description: "large dog at 08:30 costs one seat",
    existing: [],
    candidate: large("08:30"),
  },
  {
    id: "large-shares-0830-with-small",
    rule: "large-dog-seats",
    description: "small dog joins a large dog already at 08:30",
    existing: [large("08:30")],
    candidate: small("08:30"),
  },
  {
    id: "large-1230-full-takeover",
    rule: "large-dog-seats",
    description: "large dog at 12:30 takes the whole slot",
    existing: [],
    candidate: large("12:30"),
  },
  {
    id: "large-1230-blocks-small",
    rule: "large-dog-seats",
    description: "small dog refused at 12:30 once a large dog has taken it",
    existing: [large("12:30")],
    candidate: small("12:30"),
  },
  {
    id: "large-into-occupied-1230",
    rule: "large-dog-seats",
    description: "large dog refused at 12:30 when the slot already has a booking",
    existing: [small("12:30")],
    candidate: large("12:30"),
  },

  // ---- large-dog adjacency ------------------------------------------------
  {
    id: "large-back-to-back-0830-0900",
    rule: "large-dog-adjacency",
    description: "back-to-back large dogs at 08:30 then 09:00",
    existing: [large("08:30")],
    candidate: large("09:00"),
  },
  {
    id: "large-back-to-back-1230-1300",
    rule: "large-dog-adjacency",
    description: "back-to-back large dogs at 12:30 then 13:00 (the permitted pair)",
    existing: [large("12:30")],
    candidate: large("13:00"),
  },

  // ---- early close --------------------------------------------------------
  {
    id: "early-close-1300-after-1200-large",
    rule: "early-close",
    description: "13:00 refused after a large dog at 12:00 triggers early close",
    existing: [large("12:00")],
    candidate: small("13:00"),
  },
  {
    id: "large-1200-with-1300-occupied",
    rule: "early-close",
    description: "large dog at 12:00 while 13:00 already holds a booking",
    existing: [small("13:00")],
    candidate: large("12:00"),
  },

  // ---- blocked seats ------------------------------------------------------
  {
    id: "blocked-seat-halves-slot",
    rule: "blocked-seats",
    description: "one blocked seat leaves a single usable seat in the slot",
    existing: [],
    overrides: { 0: "blocked" },
    candidate: small("08:30"),
  },
  {
    id: "blocked-seat-second-refused",
    rule: "blocked-seats",
    description: "second dog refused when one seat of the slot is blocked",
    existing: [small("08:30")],
    overrides: { 0: "blocked" },
    candidate: small("08:30"),
  },
];
