import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Drift guard: the SQL default and the shared TS constant must name the exact
// same cancel_reason string, or notify-booking-cancelled's skip check
// (supabase/functions/_shared/recipients.ts) silently stops matching what the
// reschedule RPC actually stamps. Uses the dynamic-import-of-Deno-source
// pattern established in rescheduleConfirm.test.ts, since Vitest never
// resolves Deno's https:// specifiers and this file has none to trip over.
async function loadConstant(): Promise<string> {
  const mod = (await import(
    "../../../supabase/functions/_shared/cancelReasons.ts"
  )) as { WHATSAPP_RESCHEDULE_CANCEL_REASON: string };
  return mod.WHATSAPP_RESCHEDULE_CANCEL_REASON;
}

function migrationSql(): string {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260723090000_whatsapp_atomic_reschedule.sql",
    ),
    "utf8",
  );
}

describe("WHATSAPP_RESCHEDULE_CANCEL_REASON", () => {
  it("matches the p_reason default in the atomic reschedule migration", async () => {
    const constant = await loadConstant();
    const sql = migrationSql();

    const match = sql.match(/p_reason\s+text\s+default\s+'([^']*)'/);
    expect(match, "expected to find the p_reason default in the migration").toBeTruthy();
    expect(match?.[1]).toBe(constant);
  });
});
