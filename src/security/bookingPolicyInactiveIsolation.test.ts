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
    .filter((p) => p !== join("src", "supabase", "database.types.ts"))
    .map((p) => ({ path: p, text: readFileSync(join(root, p), "utf8") }));
}

// WHAT THIS GUARD IS FOR, AND WHEN IT CHANGES
//
// It targets exactly one hazard: wiring a screen or hook to a v1 *mutation*
// that refuses with policy_not_active while the policy is inactive. It is not
// a general prohibition on touching booking-policy code.
//
// Explicitly NOT blocked, and deliberately absent from the list below:
//   * read-only projections (Task 2): list_customer_booking_visits,
//     list_staff_booking_policy_attention, list_staff_booking_visit and their
//     repository/hook wrappers. Reading is safe in every runtime state.
//   * Settings status reads: booking_policy_runtime_status,
//     current_booking_rules, booking_refund_calendar_status.
//   * the legacy staff and customer write paths, which stay authoritative.
//
// HOW IT CHANGES: at the activation task, the UI is deliberately wired to
// these commands. At that point remove the specific command from
// V1_ONLY_COMMANDS **in the same commit that adds its caller**, so the change
// is visible in review as "this command is now live" rather than as a deleted
// test. Deleting this file, or emptying the list wholesale, is never the
// right change — a reviewer should always be able to see which v1 mutations
// are considered live and which are still dark.
const V1_ONLY_COMMANDS = [
  "createStaffBookingVisit",
  "cancelStaffBookingVisit",
  "rescheduleStaffBookingVisit",
  "updateStaffBookingVisit",
  "previewCustomerCancelVisit",
  "cancelCustomerBookingVisit",
  "withdrawCustomerBookingVisit",
  "withdrawCustomerBookingChangeRequest",
  "requestCustomerCreditRefund",
  "cancelCustomerCreditRefund",
  "approveBookingVisit",
  "declineBookingVisit",
  "recordVisitDepositOutcome",
  "resolveVisitDepositMoney",
  "settleBookingRefundDue",
  "recordBookingIncident",
  "markBookingVisitNoShow",
  "setBookingIncidentWaiver",
  "setCustomerDepositOverride",
  "waiveVisitDepositRequirement",
  "recordCustomerBookingContact",
  "decideBookingChangeRequest",
  "create_staff_booking_visit",
  "cancel_staff_booking_visit",
  "reschedule_staff_booking_visit",
  "update_staff_booking_visit",
  "preview_customer_cancel_visit",
  "cancel_customer_booking_visit",
  "withdraw_customer_booking_visit",
  "withdraw_customer_booking_change_request",
  "request_customer_credit_refund",
  "cancel_customer_credit_refund",
  "approve_booking_visit",
  "decline_booking_visit",
  "record_visit_deposit_outcome",
  "resolve_visit_deposit_money",
  "settle_booking_refund_due",
  "record_booking_incident",
  "mark_booking_visit_no_show",
  "set_booking_incident_waiver",
  "set_customer_deposit_override",
  "waive_visit_deposit_requirement",
  "record_customer_booking_contact",
  "decide_booking_change_request",
];

function publicFunctionBody(sql: string, name: string): string {
  const definition = `create or replace function public.${name}(`;
  const start = sql.indexOf(definition);
  expect(start, `${name} definition`).toBeGreaterThanOrEqual(0);
  const bodyStart = sql.indexOf("as $$", start);
  const end = sql.indexOf("$$;", bodyStart);
  expect(bodyStart, `${name} body start`).toBeGreaterThan(start);
  expect(end, `${name} body end`).toBeGreaterThan(bodyStart);
  return sql.slice(bodyStart, end);
}

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

  it("does not block read-only projections or status reads", () => {
    // These names must never be added to the guard list: they are safe in
    // every runtime state and Task 2 depends on being able to call them.
    const readOnly = [
      "list_customer_booking_visits",
      "list_staff_booking_policy_attention",
      "list_staff_booking_visit",
      "booking_policy_runtime_status",
      "current_booking_rules",
      "booking_refund_calendar_status",
      "get_customer_booking_visit_capabilities",
    ];
    for (const name of readOnly) {
      expect(V1_ONLY_COMMANDS).not.toContain(name);
    }
  });

  it("leaves the staff booking UI on the legacy path", () => {
    const hook = readFileSync(join(root, "src/supabase/hooks/useBookings.ts"), "utf8");
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

  it("makes every direct v1 policy mutation inert while the runtime is inactive", () => {
    const customerSql = readFileSync(
      join(
        root,
        "supabase/migrations/20260726144004_customer_visit_commands.sql",
      ),
      "utf8",
    );
    const staffSql = readFileSync(
      join(
        root,
        "supabase/migrations/20260726144005_staff_visit_policy_commands.sql",
      ),
      "utf8",
    );
    const customerCommands = [
      "preview_customer_cancel_visit",
      "withdraw_customer_booking_change_request",
      "request_customer_credit_refund",
      "cancel_customer_credit_refund",
    ];
    const staffCommands = [
      "approve_booking_visit",
      "decline_booking_visit",
      "record_visit_deposit_outcome",
      "resolve_visit_deposit_money",
      "settle_booking_refund_due",
      "record_booking_incident",
      "mark_booking_visit_no_show",
      "set_booking_incident_waiver",
      "set_customer_deposit_override",
      "waive_visit_deposit_requirement",
      "record_customer_booking_contact",
      "decide_booking_change_request",
    ];

    for (const name of customerCommands) {
      const body = publicFunctionBody(customerSql, name);
      expect(body, name).toContain("public.booking_policy_runtime() <> 'active'");
      expect(body, name).toContain("blocked_receipt('policy_not_active'");
    }
    for (const name of staffCommands) {
      const body = publicFunctionBody(staffSql, name);
      expect(body, name).toContain("perform smarter_dog_private.require_staff()");
      expect(body, name).toContain("public.booking_policy_runtime() <> 'active'");
      expect(body, name).toContain("blocked_receipt('policy_not_active'");
    }
  });
});
