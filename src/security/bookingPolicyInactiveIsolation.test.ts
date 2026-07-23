// The new booking policy must stay genuinely dark until it is activated.
//
// The v1 commands deliberately refuse while `previous_day_1500_v1.effective_at`
// is null. That is only safe while nothing in production calls them: a UI or
// hook wired to a v1 command would start failing the moment it shipped, for a
// policy that is not even in force. This test is the drift guard.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(root, rel)).isDirectory()) {
      sourceFiles(rel, acc);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      acc.push(rel);
    }
  }
  return acc;
}

/** Production source: excludes tests and the RPC wrapper definitions. */
function productionSources(): Array<{ path: string; text: string }> {
  return sourceFiles("src")
    .filter((p) => !/\.test\.|\.component\.test\./.test(p))
    .filter((p) => p !== join("src", "supabase", "rpc.ts"))
    .map((p) => ({ path: p, text: readFileSync(join(root, p), "utf8") }));
}

// Commands that return policy_not_active while the policy is inactive.
const V1_ONLY_COMMANDS = [
  "createStaffBookingVisit",
  "cancelStaffBookingVisit",
  "rescheduleStaffBookingVisit",
  "updateStaffBookingVisit",
  "cancelCustomerBookingVisit",
  "withdrawCustomerBookingVisit",
  "withdrawCustomerBookingChangeRequest",
  "create_staff_booking_visit",
  "cancel_staff_booking_visit",
  "reschedule_staff_booking_visit",
  "update_staff_booking_visit",
  "cancel_customer_booking_visit",
];

describe("the inactive policy does not reach production consumers", () => {
  it("has no production caller of a v1-only command", () => {
    const offenders: string[] = [];
    for (const { path, text } of productionSources()) {
      for (const command of V1_ONLY_COMMANDS) {
        if (text.includes(command)) offenders.push(`${path} -> ${command}`);
      }
    }
    // A failure here means a screen or hook would call a command that refuses
    // with policy_not_active. Either the policy is being activated (in which
    // case update this list deliberately) or the wiring is premature.
    expect(offenders).toEqual([]);
  });

  it("leaves the staff booking UI on the legacy path", () => {
    const hook = readFileSync(join(root, "src/supabase/hooks/useBookings.js"), "utf8");
    // create_staff_booking_group has no Terms requirement and creates a
    // legacy_compat visit, so ordinary staff booking keeps working with the
    // policy inactive and no Terms published.
    expect(hook).toContain("createStaffBookingGroup");
    expect(hook).not.toContain("createStaffBookingVisit");
  });

  it("keeps the legacy staff group command free of any v1 policy requirement", () => {
    const migrations = readdirSync(join(root, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const latest = migrations
      .map((f) => readFileSync(join(root, "supabase/migrations", f), "utf8"))
      .filter((sql) => sql.includes("create or replace function public.create_staff_booking_group"))
      .pop();
    expect(latest).toBeDefined();
    // The legacy path must not depend on a Terms publication, a deposit
    // resolver or the runtime predicate — otherwise an unpublished policy
    // would stop ordinary staff bookings.
    expect(latest).not.toContain("current_terms_publication_id");
    expect(latest).not.toContain("resolve_deposit_requirement");
    expect(latest).not.toContain("booking_policy_runtime");
  });
});
