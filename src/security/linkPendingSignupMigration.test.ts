// link_pending_signup() moves a portal login and a verified phone between
// customer records. It must stay staff-gated and unreachable by anon: a
// migration that redefines it without the revoke block would expose it over
// /rest/v1/rpc/ to anyone with the publishable key.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const FN = /link_pending_signup\s*\(\s*uuid\s*,\s*uuid\s*\)/i;

function latestGoverningMigration(): string {
  // The most recent migration that GOVERNS the function's grants, not merely
  // the most recent one that mentions it (see humanBookingRulesMigration).
  const matches = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
    .filter((sql) => new RegExp(`(grant|revoke)[^;]*\\b${FN.source}`, "i").test(sql));

  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1];
}

describe("link_pending_signup permissions", () => {
  it("is executable by authenticated callers only (the function itself checks is_staff())", () => {
    const sql = latestGoverningMigration();
    expect(sql).toMatch(
      /grant execute on function public\.link_pending_signup\s*\(\s*uuid\s*,\s*uuid\s*\)\s+to authenticated/i,
    );
    expect(sql).toMatch(/if not is_staff\(\) then/i);
  });

  it("revokes the default PUBLIC grant and anon's direct grant", () => {
    const sql = latestGoverningMigration();
    expect(sql).toMatch(
      /revoke all on function public\.link_pending_signup\s*\(\s*uuid\s*,\s*uuid\s*\)\s+from public/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.link_pending_signup\s*\(\s*uuid\s*,\s*uuid\s*\)\s+from anon/i,
    );
    expect(sql).not.toMatch(/grant execute[^;]+to anon/i);
  });

  it("refuses to steal a portal login that already belongs to another record", () => {
    const sql = latestGoverningMigration();
    expect(sql).toMatch(/already has a portal login/i);
    expect(sql).toMatch(/is not a pending self-signup/i);
  });
});
