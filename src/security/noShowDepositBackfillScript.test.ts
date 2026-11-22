import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = join(process.cwd(), "scripts/no-show-deposit-backfill.sql");
const source = readFileSync(scriptPath, "utf8");

/** SQL with comments removed, so a commented-out update cannot hide. */
function executableSql(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("the no-show deposit backfill script", () => {
  const live = executableSql(source);

  it("is not a migration and says it changes nothing until someone asks", () => {
    expect(scriptPath).not.toContain("supabase/migrations");
    expect(source).toMatch(/THIS IS NOT A MIGRATION/);
    expect(source).toMatch(/does not change/i);
  });

  it("lists the customers a past no-show would tag, without contact details", () => {
    expect(live).toMatch(/from public\.bookings b/i);
    expect(live).toMatch(/b\.status = 'No-show'/);
    expect(live).toMatch(/h\.deposit_required = false/);
    expect(live.toLowerCase()).not.toMatch(/\b(phone|email|address)\b/);
  });

  it("contains no statement that writes, until the apply block is uncommented", () => {
    expect(live).not.toMatch(/\b(insert|update|delete|alter|drop|truncate|grant|revoke)\b/i);
  });

  it("keeps the apply wording in a comment, matching the trigger's sentence", () => {
    expect(source).toMatch(/Deposit required after a no-show/);
    expect(source).toMatch(/begin;/);
    expect(source).toMatch(/commit;/);
    expect(live).not.toMatch(/\bbegin\b/i);
    expect(live).not.toMatch(/\bcommit\b/i);
  });
});
