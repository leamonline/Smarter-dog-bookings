import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");

function latestSlotsHelperMigration(): string {
  // Select the most recent migration that GOVERNS the helper's grants, not
  // merely the most recent one that mentions it. A migration can touch the
  // function without changing who may execute it — 20260819170000 pins its
  // search_path and says nothing about grants — and such a migration
  // sorting last must not be mistaken for the one that revoked anon.
  const matches = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
    .filter((sql) =>
      /(grant|revoke)[^;]*\bslots_are_hhmm\s*\(\s*text\[\]\s*\)/i.test(sql),
    );

  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1];
}

describe("human booking-rules slot validation permissions", () => {
  it("lets authenticated staff and service-role writes execute the CHECK helper", () => {
    const sql = latestSlotsHelperMigration();
    expect(sql).toMatch(
      /grant execute on function public\.slots_are_hhmm\s*\(\s*text\[\]\s*\)\s+to authenticated, service_role/i,
    );
  });

  it("keeps the validation helper unavailable to anonymous callers", () => {
    const sql = latestSlotsHelperMigration();
    expect(sql).toMatch(
      /revoke all on function public\.slots_are_hhmm\s*\(\s*text\[\]\s*\)\s+from public, anon/i,
    );
    expect(sql).not.toMatch(/grant execute[^;]+to anon/i);
  });
});
