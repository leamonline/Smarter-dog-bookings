import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fixturePath =
  "supabase/tests/fixtures/ensure_local_vault_secrets.psql";
const fixture = readFileSync(fixturePath, "utf8");
const policyTests = [
  "140_booking_visit_foundation.test.sql",
  "145_booking_policy_rules.test.sql",
  "150_visit_deposits_incidents_credits.test.sql",
  "155_customer_visit_commands.test.sql",
  "160_staff_visit_policy_commands.test.sql",
  "165_visit_policy_events.test.sql",
  "170_staff_visit_write_commands.test.sql",
  "172_booking_policy_projections.test.sql",
  "173_staff_booking_policy_projections.test.sql",
];

describe("booking policy pgTAP Vault fixtures", () => {
  it("creates only missing inert secrets", () => {
    expect(fixture).toContain(
      "if not exists (\n    select 1 from vault.secrets where name = 'supabase_url'",
    );
    expect(fixture).toContain(
      "if not exists (\n    select 1 from vault.secrets where name = 'webhook_secret'",
    );
    expect(fixture).toContain("'http://localhost:54321'");
    expect(fixture).toContain("'pgtap-local-secret'");
  });

  it.each(policyTests)("%s includes the fixture before inserting rows", (file) => {
    const sql = readFileSync(`supabase/tests/${file}`, "utf8");
    const plan = sql.indexOf("select plan(");
    const include = sql.indexOf(
      "\\ir fixtures/ensure_local_vault_secrets.psql",
    );
    const firstInsert = sql.indexOf("insert into ");

    expect(plan).toBeGreaterThanOrEqual(0);
    expect(include).toBeGreaterThan(plan);
    expect(firstInsert).toBeGreaterThan(include);
  });
});
