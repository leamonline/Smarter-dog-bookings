// The TypeScript half of the cross-runtime capacity parity harness.
//
// supabase/tests/036_capacity_parity.test.sql asserts what PostgreSQL does for
// every shared scenario. That SQL has to state its expectation inline, because
// pgTAP cannot call TypeScript — so the two halves could drift apart the moment
// someone changes a capacity rule here and does not regenerate the SQL.
//
// This test closes that loop: it recomputes every verdict and every grouped
// allocation from the real engine and checks the committed SQL still encodes
// the same expectation, case by case. Change a rule and forget the SQL, and
// this fails naming the case, long before CI reaches the database half.
//
// It also carries the divergence register below. Two disagreements were found
// by measurement on 19 August 2026 and are pinned by name rather than papered
// over: each entry fails this test once the underlying behaviour changes, so a
// fix cannot land while leaving a stale claim behind.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canBookSlot, findGroupedSlots } from "./capacity";
import { buildSlotGrid } from "./slotGrid";
import {
  CAPACITY_PARITY_FIXTURES,
  capFor,
  type CapacityParityFixture,
} from "./capacityParityFixtures";

const PARITY_SQL = join(process.cwd(), "supabase/tests/036_capacity_parity.test.sql");

/**
 * Engine offers that PostgreSQL refuses.
 *
 * These are real defects, not accepted behaviour. An entry means: the engine
 * offers this allocation to a customer, and the database rejects it at commit
 * — so the booking fails after the wizard said yes. Listed so the suite can be
 * green about a known, documented state rather than silently red, and so that
 * fixing the engine trips this test and forces the entry out.
 */
const KNOWN_REFUSED_OFFERS: Record<string, string> = {
  "group-two-larges#0":
    "findGroupedSlots() offers two large dogs at 08:30 + 09:00. canBookSlot() " +
    "refuses that same placement, and so does the trigger (09:00 large dog " +
    "conditional: 08:30 must be empty), so the grouped path disagrees with its " +
    "own sibling as well as with the database.",
};

/**
 * Scenarios where the engine offers nothing but the database would accept a
 * plain placement. Not a safety problem — nothing bad is offered — but the
 * engine is refusing bookings the salon could take.
 */
const KNOWN_OVER_CONSERVATIVE: Record<string, string> = {
  "group-five-smalls-empty-day":
    "five small dogs on an empty day: findGroupedSlots() returns no allocation, " +
    "yet the database accepts 2+2+1 across three consecutive slots, which is " +
    "exactly what the 2-2-1 rule permits.",
};

function activeSlotsFor(fixture: CapacityParityFixture) {
  return buildSlotGrid(fixture.extraSlots ?? []);
}

function existingBookings(fixture: CapacityParityFixture) {
  return fixture.existing.map((b, i) => ({
    id: `existing-${i}`,
    dog_id: `existing-dog-${i}`,
    slot: b.slot,
    size: b.size,
  })) as never[];
}

function singleVerdict(fixture: Extract<CapacityParityFixture, { kind: "single" }>) {
  return canBookSlot(
    existingBookings(fixture),
    fixture.candidate.slot,
    fixture.candidate.size,
    activeSlotsFor(fixture),
    { overrides: (fixture.overrides ?? {})[fixture.candidate.slot], dogId: "candidate-dog" },
  );
}

function groupOffers(fixture: Extract<CapacityParityFixture, { kind: "group" }>) {
  const dogs = fixture.dogs.map((size, i) => ({ id: `group-dog-${i}`, size }));
  return findGroupedSlots(
    dogs,
    existingBookings(fixture),
    activeSlotsFor(fixture),
    capFor(fixture),
    fixture.overrides ?? {},
  );
}

/** The pgTAP helper guarding the assertion whose description carries `marker`. */
function helperFor(sql: string, marker: string): "lives_ok" | "throws_ok" | null {
  const idx = sql.indexOf(marker);
  if (idx < 0) return null;
  const preceding = sql.slice(Math.max(0, idx - 1500), idx);
  return preceding.lastIndexOf("select lives_ok(") > preceding.lastIndexOf("select throws_ok(")
    ? "lives_ok"
    : "throws_ok";
}

const singles = CAPACITY_PARITY_FIXTURES.filter((f) => f.kind === "single");
const groups = CAPACITY_PARITY_FIXTURES.filter((f) => f.kind === "group");

describe("capacity parity fixtures", () => {
  it("gives every scenario a unique id", () => {
    const ids = CAPACITY_PARITY_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size, "ids correlate the two runtimes and must be unique").toBe(ids.length);
  });

  it("covers every capacity rule the harness claims to probe", () => {
    const rules = new Set(CAPACITY_PARITY_FIXTURES.map((f) => f.rule));
    expect([...rules].sort()).toEqual([
      "2-2-1",
      "blocked-seats",
      "early-close",
      "extra-slots",
      "grouped-allocation",
      "large-dog-adjacency",
      "large-dog-seats",
      "per-slot-seats",
    ]);
  });

  it("keeps both allow and refuse single cases, so neither side passes by always agreeing", () => {
    const allowed = singles.filter((f) => singleVerdict(f as never).allowed).length;
    expect(allowed, "the harness needs single scenarios the engine allows").toBeGreaterThan(0);
    expect(
      singles.length - allowed,
      "the harness needs single scenarios the engine refuses",
    ).toBeGreaterThan(0);
  });

  it("exercises grouped allocation deeply enough to be worth trusting", () => {
    // Grouped allocation is where the engine does its most intricate work, and
    // the only place it makes offers rather than answering yes/no.
    expect(groups.length, "grouped scenarios").toBeGreaterThanOrEqual(10);
    const totalOffers = groups.reduce((n, f) => n + groupOffers(f as never).length, 0);
    expect(totalOffers, "individual allocations checked against the database").toBeGreaterThanOrEqual(
      50,
    );
    const sizes = new Set(groups.flatMap((f) => (f as never as { dogs: string[] }).dogs));
    expect([...sizes].sort(), "group scenarios must span every dog size").toEqual([
      "large",
      "medium",
      "small",
    ]);
  });

  it("matches the expectation encoded in the pgTAP parity test", () => {
    const sql = readFileSync(PARITY_SQL, "utf8");
    let cases = 0;

    for (const fixture of singles) {
      const result = singleVerdict(fixture as never);
      const marker = `parity[${fixture.id}]`;
      const helper = helperFor(sql, marker);
      expect(helper, `${fixture.id} is missing from the pgTAP parity test`).not.toBeNull();
      expect(
        helper,
        `${fixture.id}: the engine ${result.allowed ? "allows" : "refuses"} this, so the pgTAP ` +
          `assertion must be ${result.allowed ? "lives_ok" : "throws_ok"}. Regenerate the SQL ` +
          `after changing a capacity rule.`,
      ).toBe(result.allowed ? "lives_ok" : "throws_ok");
      cases += 1;
    }

    for (const fixture of groups) {
      const offers = groupOffers(fixture as never);
      offers.forEach((_, n) => {
        const caseId = `${fixture.id}#${n}`;
        const helper = helperFor(sql, `parity[${caseId}]`);
        expect(helper, `${caseId} is missing from the pgTAP parity test`).not.toBeNull();
        const known = caseId in KNOWN_REFUSED_OFFERS;
        expect(
          helper,
          known
            ? `${caseId} is a KNOWN refused offer, so the SQL must pin the refusal. If the engine ` +
              `no longer offers it, remove the KNOWN_REFUSED_OFFERS entry.`
            : `${caseId}: every allocation the engine offers must be one PostgreSQL accepts. A ` +
              `throws_ok here means the wizard can offer a booking that then fails — either fix ` +
              `the engine or record it in KNOWN_REFUSED_OFFERS with an explanation.`,
        ).toBe(known ? "throws_ok" : "lives_ok");
        cases += 1;
      });

      if (offers.length === 0) {
        const caseId = `${fixture.id}#naive`;
        const helper = helperFor(sql, `parity[${caseId}]`);
        expect(helper, `${caseId} is missing from the pgTAP parity test`).not.toBeNull();
        const overConservative = fixture.id in KNOWN_OVER_CONSERVATIVE;
        expect(
          helper,
          overConservative
            ? `${fixture.id}: recorded as over-conservative — the database accepts a placement the ` +
              `engine will not offer. If the engine now offers one, remove the ` +
              `KNOWN_OVER_CONSERVATIVE entry.`
            : `${fixture.id}: the engine offers nothing and the database refuses too, which is ` +
              `agreement. If the database now accepts, record it in KNOWN_OVER_CONSERVATIVE.`,
        ).toBe(overConservative ? "lives_ok" : "throws_ok");
        cases += 1;
      }
    }

    expect(sql, "the pgTAP plan must cover every case").toContain(`select plan(${cases});`);
  });

  it("keeps the divergence register honest", () => {
    // Every registered divergence must still correspond to a real case, so a
    // fix cannot leave a stale claim behind.
    for (const caseId of Object.keys(KNOWN_REFUSED_OFFERS)) {
      const [fixtureId, index] = caseId.split("#");
      const fixture = groups.find((f) => f.id === fixtureId);
      expect(fixture, `KNOWN_REFUSED_OFFERS names ${fixtureId}, which is not a group fixture`).toBeTruthy();
      expect(
        groupOffers(fixture as never).length,
        `KNOWN_REFUSED_OFFERS names ${caseId}, but the engine no longer offers that many ` +
          `allocations — the divergence may be fixed; remove the entry.`,
      ).toBeGreaterThan(Number(index));
    }

    for (const fixtureId of Object.keys(KNOWN_OVER_CONSERVATIVE)) {
      const fixture = groups.find((f) => f.id === fixtureId);
      expect(fixture, `KNOWN_OVER_CONSERVATIVE names ${fixtureId}, which is not a group fixture`).toBeTruthy();
      expect(
        groupOffers(fixture as never).length,
        `KNOWN_OVER_CONSERVATIVE names ${fixtureId}, but the engine now offers allocations — ` +
          `the over-conservatism may be fixed; remove the entry.`,
      ).toBe(0);
    }
  });
});
