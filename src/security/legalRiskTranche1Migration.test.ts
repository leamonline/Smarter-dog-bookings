import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function getAllMigrationSqls(): string[] {
  const migrationsDir = join(root, "supabase/migrations");

  return readdirSync(migrationsDir)
    .filter((file: string) => file.endsWith(".sql"))
    .sort()
    .map((file: string) => readFileSync(join(migrationsDir, file), "utf8"));
}

function finalPolicyState(
  policyName: string,
  table: string,
): "created" | "dropped" | "absent" {
  const tablePat = `(?:public\\.)?${table}`;
  const createRe = new RegExp(
    `create\\s+policy\\s+"?${policyName}"?\\s+on\\s+${tablePat}`,
    "gi",
  );
  const dropRe = new RegExp(
    `drop\\s+policy(?:\\s+if\\s+exists)?\\s+"?${policyName}"?\\s+on\\s+${tablePat}`,
    "gi",
  );
  let state: "created" | "dropped" | "absent" = "absent";

  for (const sql of getAllMigrationSqls()) {
    const events = [
      ...Array.from(sql.matchAll(createRe), (match) => ({
        index: match.index ?? 0,
        kind: "created" as const,
      })),
      ...Array.from(sql.matchAll(dropRe), (match) => ({
        index: match.index ?? 0,
        kind: "dropped" as const,
      })),
    ].sort((a, b) => a.index - b.index);

    for (const { kind } of events) state = kind;
  }

  return state;
}

const latestMigration = readProjectFile(
  "supabase/migrations/20260712115759_legal_risk_tranche1.sql",
);

function extractFunction(sql: string, name: string): string {
  const start = sql.search(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`,
      "i",
    ),
  );
  expect(start, `expected ${name} definition`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", start);
  expect(end, `expected ${name} closing delimiter`).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
}

describe("Tranche 1 human write boundary", () => {
  it("leaves the broad customer humans UPDATE policy dropped", () => {
    expect(finalPolicyState("customer_update_own_human", "humans")).toBe(
      "dropped",
    );
  });

  it("exposes only narrow customer profile RPCs", () => {
    const contact = extractFunction(
      latestMigration,
      "update_customer_contact_details",
    );
    const completion = extractFunction(
      latestMigration,
      "complete_customer_profile",
    );
    expect(contact).toMatch(/update public\.humans/i);
    expect(completion).toMatch(/update public\.humans/i);
    expect(contact).toMatch(/auth\.uid\(\)/i);
    expect(completion).toMatch(/auth\.uid\(\)/i);
    expect(contact).not.toMatch(
      /approved_at|approved_by|source|signup_submitted_at|archived_at/i,
    );
    expect(completion).not.toMatch(
      /approved_by|source|signup_submitted_at|archived_at/i,
    );
  });

  it("routes both customer components through the narrow wrappers", () => {
    const profileGate = readProjectFile(
      "src/components/customer/onboarding/ProfileGate.jsx",
    );
    const dashboard = readProjectFile(
      "src/components/customer/CustomerDashboard.jsx",
    );

    expect(profileGate).toContain("completeCustomerProfile");
    expect(dashboard).toContain("updateCustomerContactDetails");
    expect(profileGate).not.toMatch(/\.from\(["']humans["']\)\s*\.update\(/);
    expect(dashboard).not.toMatch(/\.from\(["']humans["']\)\s*\.update\(/);
  });
});
