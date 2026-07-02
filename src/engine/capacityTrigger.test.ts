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
    .filter((file: string) => file.endsWith(".sql"))
    .sort()
    .map((file: string) => readFileSync(join(dir, file), "utf8"));
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

describe("capacity trigger: daily dog cap", () => {
  it("enforces a per-day dog cap from salon_config for non-staff writes", () => {
    // Regression for the overbooking hole: the per-slot 2-2-1 rule never
    // looked at the day total, so a 15th dog could book into a free seat on
    // an otherwise-full day. The effective definition must read the
    // configurable cap and reject non-staff writes that cross it.
    const fn = lastDefinitionOf(
      /create\s+or\s+replace\s+function\s+validate_booking_capacity\(\)/i,
    );

    expect(fn, "must read the configurable cap").toMatch(/daily_dog_cap/i);

    // Cap applies to non-staff only (staff overbook deliberately; a
    // `not v_override` gate would wrongly block routine staff bookings).
    expect(fn, "day cap must gate on non-staff").toMatch(
      /not\s+v_is_staff/i,
    );

    // Must actually reject, not just compute.
    expect(fn, "must raise when the day is full").toMatch(
      /Day is fully booked/i,
    );

    // Race safety: the day-total count needs a per-DATE lock — the per-slot
    // lock doesn't serialise inserts into different slots on the same day.
    expect(fn, "must take a per-date advisory lock").toMatch(
      /pg_advisory_xact_lock\(\s*\n?\s*hashtextextended\(\s*'booking_day_cap/i,
    );
  });

  it("records the day count and cap in the capacity audit log", () => {
    const fn = lastDefinitionOf(
      /create\s+or\s+replace\s+function\s+log_booking_capacity_event\(\)/i,
    );

    expect(fn, "audit logger must persist v_day_count").toMatch(/v_day_count/i);
    expect(fn, "audit logger must persist v_daily_cap").toMatch(/v_daily_cap/i);
  });
});

describe("capacity trigger: staff-blocked seats", () => {
  it("subtracts day_settings blocked seats from the target slot's max", () => {
    // Regression for the single-seat-block hole: blocks were client-enforced
    // only, so a direct API caller could book into a slot where staff blocked
    // one seat and the other was taken. The effective definition must read
    // the target slot's overrides and reduce v_max_seats by the block count.
    const fn = lastDefinitionOf(
      /create\s+or\s+replace\s+function\s+validate_booking_capacity\(\)/i,
    );

    expect(fn, "must read the target slot's day_settings overrides").toMatch(
      /ds\.overrides\s*->\s*new\.slot/i,
    );

    // Malformed legacy rows (date-keyed slots, numeric values) must be
    // guarded with the same key/value shape checks as get_blocked_seats.
    expect(fn, "must guard malformed seat keys").toMatch(/\^\[0-9\]\+\$/);
    expect(fn, "must count only 'blocked' values").toMatch(
      /seat\.v\s*=\s*'blocked'/i,
    );

    // The reduction must clamp at zero and actually feed the seat maths.
    expect(fn, "must clamp the reduced max at zero").toMatch(
      /greatest\(\s*v_max_seats\s*-\s*v_blocked_seats\s*,\s*0\s*\)/i,
    );
  });

  it("the small/medium availability RPC applies the same per-slot reduction", () => {
    // Keep the Flow/agent's offered availability in step with the trigger:
    // slot_cap = 2 - blocked_count (clamped), not the old both-blocked-only
    // rule, so a slot the trigger would reject is never offered.
    const fn = lastDefinitionOf(
      /create\s+or\s+replace\s+function\s+get_small_medium_availability\(/i,
    );

    expect(fn, "slot_cap must subtract blocked seats").toMatch(
      /greatest\(\s*\n?\s*2\s*-\s*\(/i,
    );
    expect(fn, "must guard malformed seat keys").toMatch(/\^\[0-9\]\+\$/);
  });
});
