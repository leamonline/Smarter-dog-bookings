// The TypeScript half of the cross-runtime capacity parity harness.
//
// supabase/tests/036_capacity_parity.test.sql asserts that PostgreSQL reaches
// the same verdict as this engine for every shared scenario. That SQL has to
// state the expected verdict inline, because pgTAP cannot call TypeScript — so
// the two halves could drift apart the moment someone changes a capacity rule
// here and does not regenerate the SQL.
//
// This test closes that loop. It recomputes every verdict from the real engine
// and checks the committed SQL still encodes the same expectation, scenario by
// scenario. Change a rule and forget the SQL, and this fails naming the
// scenario — long before CI gets as far as running the database half.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canBookSlot } from "./capacity";
import { SALON_SLOTS } from "../constants/salon";
import { CAPACITY_PARITY_FIXTURES } from "./capacityParityFixtures";

const PARITY_SQL = join(process.cwd(), "supabase/tests/036_capacity_parity.test.sql");

function verdictFor(fixture: (typeof CAPACITY_PARITY_FIXTURES)[number]) {
  const bookings = fixture.existing.map((b, i) => ({
    id: `existing-${i}`,
    dog_id: `dog-${i}`,
    slot: b.slot,
    size: b.size,
  })) as never[];

  return canBookSlot(
    bookings,
    fixture.candidate.slot,
    fixture.candidate.size,
    [...SALON_SLOTS],
    { overrides: fixture.overrides, dogId: "candidate-dog" },
  );
}

describe("capacity parity fixtures", () => {
  it("gives every scenario a unique id", () => {
    const ids = CAPACITY_PARITY_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size, "scenario ids correlate the two runtimes and must be unique").toBe(
      ids.length,
    );
  });

  it("covers every capacity rule the harness claims to probe", () => {
    // A harness that quietly lost a rule would still pass its own assertions,
    // so the rule set is pinned rather than inferred.
    const rules = new Set(CAPACITY_PARITY_FIXTURES.map((f) => f.rule));
    expect([...rules].sort()).toEqual([
      "2-2-1",
      "blocked-seats",
      "early-close",
      "large-dog-adjacency",
      "large-dog-seats",
      "per-slot-seats",
    ]);
  });

  it("produces a decisive verdict for every scenario", () => {
    for (const fixture of CAPACITY_PARITY_FIXTURES) {
      const result = verdictFor(fixture);
      expect(typeof result.allowed, `${fixture.id} must yield a boolean verdict`).toBe("boolean");
      if (!result.allowed) {
        expect(result.reason, `${fixture.id} must explain a refusal`).toBeTruthy();
      }
    }
  });

  it("keeps both allow and refuse cases, so neither runtime can pass by always agreeing", () => {
    const allowed = CAPACITY_PARITY_FIXTURES.filter((f) => verdictFor(f).allowed).length;
    const refused = CAPACITY_PARITY_FIXTURES.length - allowed;
    expect(allowed, "the harness needs scenarios the engine allows").toBeGreaterThan(0);
    expect(refused, "the harness needs scenarios the engine refuses").toBeGreaterThan(0);
  });

  it("matches the expectation encoded in the pgTAP parity test", () => {
    const sql = readFileSync(PARITY_SQL, "utf8");

    // plan(N) must match the scenario count, or pgTAP silently under-runs.
    expect(sql, "the pgTAP plan must cover every scenario").toContain(
      `select plan(${CAPACITY_PARITY_FIXTURES.length});`,
    );

    for (const fixture of CAPACITY_PARITY_FIXTURES) {
      const result = verdictFor(fixture);
      const marker = `parity[${fixture.id}]`;
      expect(sql, `${fixture.id} is missing from the pgTAP parity test`).toContain(marker);

      // The assertion for this scenario is the statement whose description
      // carries its marker; check the right pgTAP helper wraps it.
      const idx = sql.indexOf(marker);
      const preceding = sql.slice(Math.max(0, idx - 700), idx);
      const helper = preceding.lastIndexOf("select lives_ok(") > preceding.lastIndexOf("select throws_ok(")
        ? "lives_ok"
        : "throws_ok";

      expect(
        helper,
        `${fixture.id}: the engine ${result.allowed ? "allows" : "refuses"} this, so the pgTAP ` +
          `assertion must be ${result.allowed ? "lives_ok" : "throws_ok"}. Regenerate ` +
          `supabase/tests/036_capacity_parity.test.sql after changing a capacity rule.`,
      ).toBe(result.allowed ? "lives_ok" : "throws_ok");
    }
  });
});
