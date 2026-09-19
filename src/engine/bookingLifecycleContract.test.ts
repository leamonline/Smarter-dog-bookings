// The CONTRACT phase of the status rename, asserted against the SQL text.
//
// Split out of bookingLifecycle.test.ts because the contract migration ships
// separately from the application change: the `Protect main` ruleset requires
// every migration in a pull request to be live on production before that pull
// request can merge, and the contract migration must land AFTER the new
// frontend is deployed. So it travels in its own pull request, and the
// assertions that read its SQL travel with it.
//
// bookingLifecycle.test.ts remains the statement of the lifecycle itself. This
// file asserts only the things that cannot be true until the contract has run:
// the final CHECK constraint, the final trigger ranking, and the row
// conversions.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ALL_BOOKING_STATUSES, STATUS_RANK } from "../constants/index";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const migrationSql = (needle: string): string => {
  const file = readdirSync(MIGRATIONS).filter((f) => f.includes(needle)).sort().at(-1);
  expect(file, `no migration matching ${needle}`).toBeTruthy();
  return readFileSync(join(MIGRATIONS, file!), "utf8");
};

const sql = () => migrationSql("contract_booking_statuses");

describe("the final constraint", () => {
  it("matches the CHECK constraint the database enforces", () => {
    // The database is the authority. If these disagree, a write the app
    // considers legal is rejected at the gate.
    const text = sql();
    for (const status of ALL_BOOKING_STATUSES) {
      expect(text, `constraint is missing ${status}`).toContain(`'${status}'`);
    }
    expect(text).toMatch(/check\s*\(\s*status\s+in\s*\(/i);
  });

  it("carries a warning that it must not run before the deploy", () => {
    expect(sql()).toMatch(/ONLY AFTER THE NEW FRONTEND IS DEPLOYED/i);
  });

  it("agrees with the trigger's ranking in the database", () => {
    const text = sql();
    for (const [status, rank] of Object.entries(STATUS_RANK)) {
      expect(text).toMatch(new RegExp(`when\\s+'${status}'\\s+then\\s+${rank}`, "i"));
    }
  });
});

describe("the migration's conversions", () => {
  it("maps Checked in and In bath to Arrived", () => {
    // In bath -> Arrived, not Ready: the dog has arrived but is not finished,
    // and every such row already carries checked_in_at with a null ready_at,
    // which is exactly an Arrived row's shape.
    expect(sql()).toMatch(
      /update\s+public\.bookings\s+set\s+status\s*=\s*'Arrived'\s+where\s+status\s+in\s*\(\s*'Checked in'\s*,\s*'In bath'\s*\)/i,
    );
  });

  it("maps Ready for pick-up to Ready for collection", () => {
    expect(sql()).toMatch(
      /set\s+status\s*=\s*'Ready for collection'\s+where\s+status\s*=\s*'Ready for pick-up'/i,
    );
  });

  it("converts the old no-show shape to the No-show status", () => {
    const text = sql();
    expect(text).toMatch(/set\s+status\s*=\s*'No-show'/i);
    expect(text).toMatch(/status\s*=\s*'Cancelled'/i);
    // Matched case-insensitively and trimmed, the same way the application's
    // isNoShowReason() does, so 'no-show ' converts too.
    expect(text).toMatch(/lower\s*\(\s*btrim/i);
  });

  it("keeps cancel_reason rather than clearing it", () => {
    // The reason is history worth keeping; nothing reads it to decide
    // no-show-ness any more.
    expect(sql()).not.toMatch(/set\s+status\s*=\s*'No-show'\s*,\s*cancel_reason\s*=\s*null/i);
  });
});
