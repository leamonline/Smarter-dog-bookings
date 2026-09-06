// submit_customer_signup() is the only customer write that can end a
// pending signup. The claim path added in 20260902150000 must keep its
// security shape: same grants (authenticated only, never anon), the claim
// recorded without the customer ever writing phone / customer_user_id, and
// nothing about the claimed record disclosed in the return value.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const FN = "submit_customer_signup\\s*\\(\\s*jsonb\\s*,\\s*jsonb\\s*\\)";

function latestDefiningMigration(): string {
  const matches = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
    .filter((sql) => /create (or replace )?function public\.submit_customer_signup\s*\(/i.test(sql));
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1];
}

describe("submit_customer_signup claim path", () => {
  it("keeps the authenticated-only grant and the anon/public revokes", () => {
    const sql = latestDefiningMigration();
    expect(sql).toMatch(new RegExp(`grant execute on function public\\.${FN}\\s+to authenticated`, "i"));
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${FN}\\s+from public`, "i"));
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${FN}\\s+from anon`, "i"));
    expect(sql).not.toMatch(/grant execute[^;]+to anon/i);
  });

  it("records the claim on the caller's own shell without touching identity columns", () => {
    const sql = latestDefiningMigration();
    const claimUpdate = sql.match(/exception when unique_violation then([\s\S]*?)\n {2}end;/i);
    expect(claimUpdate).not.toBeNull();
    const body = claimUpdate![1];
    expect(body).toMatch(/claims_human_id = v_existing_id/);
    expect(body).toMatch(/where h\.id = v_human\.id/);
    // Never phone / customer_user_id / history_flag / approved_at from the customer side.
    expect(body).not.toMatch(/set[^;]*\bphone\s*=/i);
    expect(body).not.toMatch(/customer_user_id\s*=/i);
    expect(body).not.toMatch(/history_flag\s*=/i);
    expect(body).not.toMatch(/approved_at\s*=/i);
    // The claimed record is only ever read, never written.
    expect(body).not.toMatch(/where h\.id = v_existing_id/i);
  });

  it("returns only a boolean about the claim, never the claimed record", () => {
    const sql = latestDefiningMigration();
    expect(sql).toMatch(/return jsonb_build_object\('claims_existing', v_existing_id is not null\)/);
    expect(sql).not.toMatch(/jsonb_build_object\([^)]*(phone|name|surname|email)/i);
  });

  it("still gates on is_staff() for the actual link (link_pending_signup)", () => {
    const link = readFileSync(join(migrationsDir, "20260902120000_link_pending_signup.sql"), "utf8");
    expect(link).toMatch(/if not is_staff\(\) then/i);
  });
});
