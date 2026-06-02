import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Static invariants over the SQL capacity trigger. validate_booking_capacity()
// lives only in Postgres (it is NOT modelled by the TS engine), so the engine
// unit tests can't cover its short-circuit behaviour. These assertions read
// the migrations directly — the same approach as supabaseSecurityReview.test.ts
// — and check the FINAL (latest) definition, so a future migration that
// re-issues the function without the guard makes the test fail.

const root = process.cwd();

function migrationSqlsSorted(): string[] {
  const dir = join(root, "supabase/migrations");

  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(dir, file), "utf8"));
}

// SQL of the LAST migration (filename order) that matches — i.e. the one
// whose definition is currently in effect.
function lastDefinitionOf(predicate: RegExp): string {
  const matches = migrationSqlsSorted().filter((sql) => predicate.test(sql));

  expect(matches.length, "expected at least one matching migration").toBeGreaterThan(0);

  return matches[matches.length - 1];
}

// Matches: and not (old.status = 'Cancelled' and new.status is distinct from 'Cancelled')
const UNCANCEL_GUARD =
  /not\s*\(\s*old\.status\s*=\s*'Cancelled'\s+and\s+new\.status\s+is\s+distinct\s+from\s+'Cancelled'\s*\)/i;

describe("capacity trigger: un-cancel re-validation", () => {
  it("re-validates capacity when a booking is reactivated from Cancelled", () => {
    // Regression for the un-cancel overbooking hole (High). get_seats_used()
    // excludes Cancelled rows, so a Cancelled booking consumes no seat. The
    // status/metadata-only short-circuit therefore let an un-cancel
    // (Cancelled -> Booked, same date/slot/size) slip through WITHOUT a seat
    // check — after the freed seat had been taken by another dog, that put the
    // slot over capacity. The effective definition must exclude un-cancel from
    // the short-circuit so it runs the full check.
    const fn = lastDefinitionOf(
      /create\s+or\s+replace\s+function\s+validate_booking_capacity\(\)/i,
    );

    expect(
      fn,
      "short-circuit must not fire when reactivating from Cancelled",
    ).toMatch(UNCANCEL_GUARD);

    // The advisory lock that serialises same-slot writes must survive any
    // re-issue of the function, so this fix can't silently regress the
    // concurrency race fix from 20260519050000.
    expect(fn, "per-slot advisory lock must remain").toMatch(
      /pg_advisory_xact_lock\(/i,
    );
  });

  it("records un-cancel events in the capacity audit log", () => {
    // The audit logger shares the same short-circuit; keep it in step so an
    // un-cancel (now capacity-relevant) produces a booking_capacity_audit row.
    const fn = lastDefinitionOf(
      /create\s+or\s+replace\s+function\s+log_booking_capacity_event\(\)/i,
    );

    expect(fn, "audit logger must also stop short-circuiting un-cancel").toMatch(
      UNCANCEL_GUARD,
    );
  });
});
