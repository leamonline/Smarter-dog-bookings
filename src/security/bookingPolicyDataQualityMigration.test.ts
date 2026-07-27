import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260726144012_data_quality_local_only.sql",
  "utf8",
);

describe("final booking visit data-quality classifier", () => {
  it("requires every mandatory snapshot before calling a confirmed v1 visit authoritative", () => {
    const structuralCheck = sql.indexOf(
      "when (select runtime_generation from v) = 'visit_v1'\n" +
        "     and (select confirmation_state from v) = 'confirmed'",
    );
    const authoritativeResult = sql.indexOf(
      "when (select runtime_generation from v) = 'visit_v1' then 'v1_authoritative'",
    );

    expect(structuralCheck).toBeGreaterThanOrEqual(0);
    for (const snapshot of [
      "commercial_eligibility_at",
      "eligibility_policy_code",
      "policy_code",
      "customer_change_deadline_at",
      "terms_publication_id",
    ]) {
      const snapshotCheck = sql.indexOf(
        `(select ${snapshot} from v) is null`,
        structuralCheck,
      );
      expect(snapshotCheck).toBeGreaterThan(structuralCheck);
      expect(snapshotCheck).toBeLessThan(authoritativeResult);
    }
    expect(authoritativeResult).toBeGreaterThan(structuralCheck);
  });
});
