// Static contract for the trigger-function grant class.
//
// Postgres grants EXECUTE to PUBLIC on every new function, so a trigger
// function without an explicit revoke block is reachable by anon over
// /rest/v1/rpc/. The class has regressed repeatedly (docs/migrations.md), most
// recently across the booking-policy visit batch.
//
// The authoritative check is supabase/tests/179_trigger_function_grants.test.sql,
// which asserts the property against a real rebuilt database. That suite only
// runs in the DB Tests workflow, so this file keeps a fast guard in the ordinary
// `npm run test` run: it fails if a migration adds a trigger function without a
// matching revoke, without needing Postgres.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = "supabase/migrations";

const REVOKE_MIGRATION = "20260731100000_revoke_anon_trigger_function_grants.sql";

// Trigger functions that are created and revoked inside their own migration,
// so they never relied on the retrospective sweep.
const SELF_REVOKED = new Set([
  "enforce_dog_not_pregnant",
  "sync_whatsapp_conversation_last_message",
]);

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Names of functions declared `returns trigger` across the whole history. */
function declaredTriggerFunctions(): Set<string> {
  const names = new Set<string>();
  for (const file of migrationFiles()) {
    const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8");
    const re =
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\([^)]*\)\s*returns\s+trigger/gis;
    for (const m of sql.matchAll(re)) names.add(m[1].toLowerCase());
  }
  return names;
}

/** Function names appearing in any `revoke ... execute ... from ... anon` line. */
function revokedFromAnon(): Set<string> {
  const names = new Set<string>();
  for (const file of migrationFiles()) {
    const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8");
    const re =
      /revoke\s+(?:execute|all)[\s\S]{0,40}?on\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\([^)]*\)\s*from\s+([^;]+);/gis;
    for (const m of sql.matchAll(re)) {
      if (/\banon\b/i.test(m[2])) names.add(m[1].toLowerCase());
    }
  }
  return names;
}

describe("trigger-function grant convention", () => {
  it("ships the retrospective revoke sweep", () => {
    expect(migrationFiles()).toContain(REVOKE_MIGRATION);
  });

  it("revokes anon EXECUTE on every trigger function the migrations create", () => {
    const declared = declaredTriggerFunctions();
    const revoked = revokedFromAnon();

    expect(declared.size).toBeGreaterThan(20);

    const unrevoked = [...declared]
      .filter((name) => !revoked.has(name) && !SELF_REVOKED.has(name))
      .sort();

    // A failure here means a migration added a trigger function without the
    // revoke block docs/migrations.md requires. Add it to that migration —
    // triggers fire without an EXECUTE check, so nothing breaks.
    expect(unrevoked).toEqual([]);
  });

  it("keeps the deliberate customer-safe policy runtime grants", () => {
    const sql = readFileSync(
      `${MIGRATIONS_DIR}/20260726144001_authoritative_booking_policy_rules.sql`,
      "utf8",
    );
    expect(sql).toContain(
      "grant execute on function public.booking_policy_runtime() to authenticated, anon, service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.booking_policy_runtime_status() to authenticated, anon, service_role",
    );

    // The sweep must not have touched them — they are not trigger functions.
    // Only statements count; the migration names them in its header comment to
    // record why they are deliberately excluded.
    const statements = readFileSync(`${MIGRATIONS_DIR}/${REVOKE_MIGRATION}`, "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(statements).not.toMatch(/booking_policy_runtime\s*\(/);
    expect(statements).not.toMatch(/booking_policy_runtime_status\s*\(/);
  });
});
