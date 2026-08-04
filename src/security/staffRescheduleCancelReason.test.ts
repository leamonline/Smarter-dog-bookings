import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Drift guard: the SQL literal stamped by the staff visit reschedule RPC and
// the shared TS constant must name the exact same cancel_reason string, or
// notify-booking-cancelled's skip check (supabase/functions/_shared/recipients.ts)
// silently stops matching what the RPC actually stamps. Uses the
// dynamic-import-of-Deno-source pattern established in
// rescheduleCancelReason.test.ts, since Vitest never resolves Deno's https://
// specifiers and this file has none to trip over.
async function loadConstant(): Promise<string> {
  const mod = (await import(
    "../../supabase/functions/_shared/cancelReasons.ts"
  )) as { STAFF_RESCHEDULE_CANCEL_REASON: string };
  return mod.STAFF_RESCHEDULE_CANCEL_REASON;
}

function migrationSql(): string {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260726144007_staff_visit_write_commands.sql",
    ),
    "utf8",
  );
}

describe("STAFF_RESCHEDULE_CANCEL_REASON", () => {
  it("matches the cancel_reason literal in the staff visit reschedule migration", async () => {
    const constant = await loadConstant();
    const sql = migrationSql();

    const match = sql.match(
      /set\s+status\s*=\s*'Cancelled',\s*cancel_reason\s*=\s*'([^']*)'/,
    );
    expect(match, "expected to find the cancel_reason literal in the migration").toBeTruthy();
    expect(match?.[1]).toBe(constant);
  });
});
