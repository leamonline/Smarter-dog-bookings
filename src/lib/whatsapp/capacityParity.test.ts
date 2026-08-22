import { describe, expect, it } from "vitest";

// Parity guard: browser engine ↔ Deno mirror.
//
// The capacity rules exist three times — src/engine/capacity.ts (browser),
// supabase/functions/_shared/capacity.ts (a hand-mirror, because the WhatsApp
// Flow runs in Deno and cannot import the frontend engine), and the
// authoritative PostgreSQL trigger. Two of the three pairings are guarded
// against the governed scenario set in src/engine/capacityParityFixtures.ts:
// browser ↔ database, by capacityParityFixtures.test.ts plus
// supabase/tests/036_capacity_parity.test.sql.
//
// This file is the third corner. It used to drive the mirror through eleven
// hand-written scenarios that predated the governed set (2 July 2026), and it
// was measurably blind: reverting the issue #664 grouped-allocation guard in
// one engine only left all twelve of its cases passing, while the governed
// harness failed by name (issue #671). It now feeds the same governed fixtures
// to both TypeScript engines and compares every verdict and every offered
// allocation.
//
// It states no expected answers. Both sides are computed from the real
// engines; only their agreement is asserted. An expectation written by hand
// here would encode one engine's opinion and hide the drift this exists to
// find. What the answers *should* be is the governed harness's question, and
// PostgreSQL's to settle.
//
// The nine bespoke behavioural cases the governed set now covers strictly
// better were removed rather than kept as noise:
//   two/three smalls, a large, a mixed group   → group-two-smalls-empty-day,
//                                                 group-three-smalls-empty-day,
//                                                 group-with-large-dog,
//                                                 group-mixed-sizes
//   large at 12:00 early-closing 13:00          → early-close-1300-after-1200-large
//   atomic cap on a 2-dog group                 → group-exceeds-daily-cap
//   block at seat 0 with a booking present      → blocked-seat-second-refused
//   block removing a slot, neighbours unaffected→ blocked-seat-does-not-cascade,
//                                                 blocked-both-seats-closes-slot
//   2-2-1 across the extra-slot boundary        → extra-slot-221-crosses-boundary,
//                                                 group-into-extra-slots
// Two are kept below: the mirrored constants (not a capacity scenario at all)
// and a day at the real 14-dog cap, which the governed fixtures never reach
// because they use reduced caps to stay readable.
import {
  canBookSlot as canBookEngine,
  findGroupedSlots as findEngine,
} from "../../engine/capacity";
import {
  canBookSlot as canBookMirror,
  findGroupedSlots as findMirror,
} from "../../../supabase/functions/_shared/capacity.ts";
import {
  CAPACITY_PARITY_FIXTURES,
  capFor,
  type CapacityParityFixture,
} from "../../engine/capacityParityFixtures";
import { buildSlotGrid } from "../../engine/slotGrid";
import {
  DAILY_DOG_CAP,
  IMMEDIATE_CUTOFF_MINUTES,
  LARGE_DOG_SLOTS,
  SALON_SLOTS,
} from "../../constants/salon";
import {
  buildSlotGrid as buildMirrorGrid,
  DAILY_DOG_CAP as MIRROR_DAILY_DOG_CAP,
  IMMEDIATE_CUTOFF_MINUTES as MIRROR_IMMEDIATE_CUTOFF,
  LARGE_DOG_SLOTS as MIRROR_LARGE_DOG_SLOTS,
  SALON_SLOTS as MIRROR_SALON_SLOTS,
} from "../../../supabase/functions/_shared/salonConstants.ts";

type Verdict = { allowed: boolean; reason: string | null; needsApproval: boolean };
type Offer = { dropOffTime: string; sig: string };

/** The comparable part of a BookingResult. groupId-free, undefined-normalised. */
function verdict(result: { allowed: boolean; reason?: string; needsApproval?: boolean }): Verdict {
  return {
    allowed: result.allowed,
    reason: result.reason ?? null,
    needsApproval: result.needsApproval ?? false,
  };
}

/** Drop the random groupId; compare drop-off + per-dog assignment signatures. */
function norm(
  allocations: Array<{ dropOffTime: string; assignments: Array<{ dogId: string; slot: string }> }>,
): Offer[] {
  return allocations
    .map((allocation) => ({
      dropOffTime: allocation.dropOffTime,
      sig: allocation.assignments
        .map((assignment) => `${assignment.dogId}:${assignment.slot}`)
        .sort()
        .join("|"),
    }))
    .sort((x, y) => x.dropOffTime.localeCompare(y.dropOffTime) || x.sig.localeCompare(y.sig));
}

// Both engines must be asked the identical question, so the grid is built once
// with the frontend builder and handed to both. The mirror's own builder is
// compared separately below — a grid divergence should be reported as a grid
// divergence, not smeared across every fixture.
function activeSlotsFor(fixture: CapacityParityFixture) {
  return buildSlotGrid(fixture.extraSlots ?? []);
}

// Shaped exactly as the browser ↔ database harness shapes it, so all three
// legs of the parity triangle are fed the same rows.
function existingBookings(fixture: CapacityParityFixture) {
  return fixture.existing.map((booking, index) => ({
    id: `existing-${index}`,
    dog_id: `existing-dog-${index}`,
    slot: booking.slot,
    size: booking.size,
  })) as never[];
}

function singleVerdicts(fixture: Extract<CapacityParityFixture, { kind: "single" }>) {
  const bookings = existingBookings(fixture);
  const activeSlots = activeSlotsFor(fixture);
  const options = {
    overrides: (fixture.overrides ?? {})[fixture.candidate.slot],
    dogId: "candidate-dog",
  };
  return {
    engine: verdict(
      canBookEngine(bookings, fixture.candidate.slot, fixture.candidate.size, activeSlots, options),
    ),
    mirror: verdict(
      canBookMirror(bookings, fixture.candidate.slot, fixture.candidate.size, activeSlots, options),
    ),
  };
}

// Every fixture is also run through findGroupedSlots — the entry point the
// WhatsApp Flow actually calls. A "single" fixture becomes a one-dog group on
// the same day, which asks the grouped search the same day-shaped question the
// verdict comparison asks canBookSlot().
function groupOffers(fixture: CapacityParityFixture) {
  const sizes = fixture.kind === "group" ? fixture.dogs : [fixture.candidate.size];
  const dogs = sizes.map((size, index) => ({ id: `group-dog-${index}`, size }));
  const bookings = existingBookings(fixture);
  const activeSlots = activeSlotsFor(fixture);
  const overrides = fixture.overrides ?? {};
  const cap = capFor(fixture);
  return {
    engine: norm(findEngine(dogs, bookings, activeSlots, cap, overrides)),
    mirror: norm(findMirror(dogs, bookings, activeSlots, cap, overrides)),
  };
}

const singles = CAPACITY_PARITY_FIXTURES.filter((f) => f.kind === "single");
const groups = CAPACITY_PARITY_FIXTURES.filter((f) => f.kind === "group");

describe("mirrored constants parity", () => {
  it("SALON_SLOTS agrees between src and the Deno mirror", () => {
    expect([...MIRROR_SALON_SLOTS]).toEqual([...SALON_SLOTS]);
  });

  it("DAILY_DOG_CAP agrees between src and the Deno mirror", () => {
    expect(MIRROR_DAILY_DOG_CAP).toBe(DAILY_DOG_CAP);
  });

  it("IMMEDIATE_CUTOFF_MINUTES agrees between src and the Deno mirror", () => {
    expect(MIRROR_IMMEDIATE_CUTOFF).toBe(IMMEDIATE_CUTOFF_MINUTES);
  });

  it("LARGE_DOG_SLOTS agrees between src and the Deno mirror", () => {
    expect(MIRROR_LARGE_DOG_SLOTS).toEqual(LARGE_DOG_SLOTS);
  });

  it("buildSlotGrid agrees for every grid the governed fixtures use", () => {
    const extras = [
      [] as string[],
      ...CAPACITY_PARITY_FIXTURES.map((f) => f.extraSlots ?? []),
      // A shape the sanitiser must reject identically on both sides.
      ["25:00", "13:30"],
    ];
    for (const extra of extras) {
      expect(buildMirrorGrid(extra), `extras ${JSON.stringify(extra)}`).toEqual(
        buildSlotGrid(extra),
      );
    }
  });
});

describe("governed fixtures: single verdicts (canBookSlot)", () => {
  it("runs every single fixture in the governed set", () => {
    expect(singles.length + groups.length).toBe(CAPACITY_PARITY_FIXTURES.length);
    expect(singles.length).toBeGreaterThan(0);
  });

  it.each(singles.map((f) => [f.id, f.rule, f] as const))(
    "%s (%s)",
    (_id, _rule, fixture) => {
      const { engine, mirror } = singleVerdicts(fixture as never);
      expect(mirror).toEqual(engine);
    },
  );

  // Without this the suite could pass by both engines agreeing on nothing
  // useful — every scenario refused, or every reason empty.
  it("keeps both allowed and refused verdicts, and real refusal reasons", () => {
    const verdicts = singles.map((f) => singleVerdicts(f as never).engine);
    const allowed = verdicts.filter((v) => v.allowed).length;
    expect(allowed, "the harness needs scenarios the engines allow").toBeGreaterThan(0);
    expect(
      verdicts.length - allowed,
      "the harness needs scenarios the engines refuse",
    ).toBeGreaterThan(0);
    expect(
      verdicts.filter((v) => !v.allowed && v.reason).length,
      "refusals must carry reasons, or reason drift is invisible here",
    ).toBeGreaterThan(0);
  });
});

describe("governed fixtures: grouped allocations (findGroupedSlots)", () => {
  it.each(CAPACITY_PARITY_FIXTURES.map((f) => [f.id, f.rule, f] as const))(
    "%s (%s)",
    (_id, _rule, fixture) => {
      const { engine, mirror } = groupOffers(fixture);
      expect(mirror).toEqual(engine);
    },
  );

  it("keeps both offering and non-offering scenarios", () => {
    const offerCounts = CAPACITY_PARITY_FIXTURES.map((f) => groupOffers(f).engine.length);
    expect(
      offerCounts.filter((n) => n > 0).length,
      "the harness needs days where allocations are offered",
    ).toBeGreaterThan(0);
    expect(
      offerCounts.filter((n) => n === 0).length,
      "the harness needs days where nothing is offered",
    ).toBeGreaterThan(0);
  });
});

describe("scenarios the governed set does not reach", () => {
  it("a day at the real daily cap offers nothing — both engines agree", () => {
    // The governed group fixtures use reduced caps (4 and 5) to stay readable,
    // so nothing there exercises DAILY_DOG_CAP itself. 14 small dogs, spread
    // legally across the grid: any further dog breaches the cap.
    const existing = [
      { slot: "08:30", size: "small" }, { slot: "08:30", size: "small" },
      { slot: "09:30", size: "small" }, { slot: "09:30", size: "small" },
      { slot: "10:30", size: "small" }, { slot: "10:30", size: "small" },
      { slot: "11:30", size: "small" }, { slot: "11:30", size: "small" },
      { slot: "12:30", size: "small" }, { slot: "12:30", size: "small" },
      { slot: "13:00", size: "small" }, { slot: "13:00", size: "small" },
      { slot: "09:00", size: "small" }, { slot: "11:00", size: "small" },
    ] as never[];
    const dogs = [{ id: "x", size: "small" as const }];
    const grid = buildSlotGrid();
    const engine = norm(findEngine(dogs, existing, grid, DAILY_DOG_CAP, {}));
    const mirror = norm(findMirror(dogs, existing, grid, DAILY_DOG_CAP, {}));
    expect(mirror).toEqual(engine);
    expect(mirror.length).toBe(0);
  });
});
