import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function migrationSqls(): string[] {
  const dir = join(root, "supabase/migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"));
}

// SQL of the LAST migration (filename order) matching the predicate — the
// definition currently in effect.
function lastDefinitionOf(predicate: RegExp): string {
  const matches = migrationSqls().filter((sql) => predicate.test(sql));
  expect(matches.length, "expected at least one matching migration").toBeGreaterThan(0);
  return matches[matches.length - 1];
}

describe("pregnancy gate: dogs.is_pregnant column", () => {
  it("adds an is_pregnant boolean defaulting to false", () => {
    const sql = lastDefinitionOf(/add column if not exists is_pregnant/i);
    expect(sql).toMatch(/is_pregnant\s+boolean\s+not\s+null\s+default\s+false/i);
  });
});

describe("pregnancy gate: trigger-only helper", () => {
  const helper = () =>
    lastDefinitionOf(/create\s+or\s+replace\s+function\s+public\.assert_booking_dog_not_pregnant/i);

  it("is SECURITY DEFINER with a pinned search_path", () => {
    const sql = helper();
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*public,\s*pg_temp/i);
  });

  it("locks the dog row FOR SHARE", () => {
    expect(helper()).toMatch(/from\s+public\.dogs[\s\S]*?where\s+id\s*=\s*p_dog_id[\s\S]*?for\s+share/i);
  });

  it("raises distinct integrity vs pregnancy messages", () => {
    const sql = helper();
    expect(sql).toMatch(/no longer available/i);
    expect(sql).toMatch(/pregnant dog online/i);
  });

  it("is not client-callable (revoked from public/anon/authenticated)", () => {
    const sql = helper();
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.assert_booking_dog_not_pregnant\(uuid\)\s+from\s+public/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.assert_booking_dog_not_pregnant\(uuid\)\s+from\s+anon/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.assert_booking_dog_not_pregnant\(uuid\)\s+from\s+authenticated/i);
  });
});

describe("pregnancy gate: trigger function + wiring", () => {
  const trig = () =>
    lastDefinitionOf(/create\s+or\s+replace\s+function\s+public\.enforce_dog_not_pregnant/i);

  it("gates on NOT is_staff() and calls the helper with NEW.dog_id", () => {
    const sql = trig();
    expect(sql).toMatch(/if\s+not\s+is_staff\(\)\s+then/i);
    expect(sql).toMatch(/perform\s+public\.assert_booking_dog_not_pregnant\(\s*new\.dog_id\s*\)/i);
  });

  it("is SECURITY DEFINER so the definer-owned call chain reaches the revoked helper (AC1)", () => {
    expect(trig()).toMatch(/security\s+definer/i);
  });

  it("is wired BEFORE INSERT on bookings, for each row", () => {
    const sql = lastDefinitionOf(/create\s+trigger\s+trg_enforce_dog_not_pregnant/i);
    expect(sql).toMatch(
      /create\s+trigger\s+trg_enforce_dog_not_pregnant\s+before\s+insert\s+on\s+public\.bookings\s+for\s+each\s+row\s+execute\s+function\s+public\.enforce_dog_not_pregnant\(\)/i,
    );
  });
});

describe("pregnancy gate: is_pregnant write boundary", () => {
  it("the customer update_customer_dog RPC does NOT write is_pregnant", () => {
    const sql = lastDefinitionOf(/create\s+or\s+replace\s+function\s+public\.update_customer_dog/i);
    expect(sql).not.toMatch(/is_pregnant/i);
  });
});
