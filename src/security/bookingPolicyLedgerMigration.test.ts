// Static contract for the visit deposits / incidents / credits migration.
// Money is immutable ledger events; deposit state never invents a payment;
// nothing here releases capacity on an unpaid or unchecked deposit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260726144002_visit_deposits_incidents_credits.sql",
  "utf8",
);

describe("visit deposits, incidents and credits migration", () => {
  it("creates the visit-level money and incident tables", () => {
    for (const table of [
      "booking_visit_deposits",
      "booking_deposit_money_reconciliations",
      "booking_change_requests",
      "booking_change_destination_reservations",
      "booking_deposit_transfer_reservations",
      "booking_late_deposit_satisfaction_requests",
      "booking_service_prepayment_reconciliations",
      "booking_visit_service_payments",
      "booking_customer_contact_events",
      "booking_policy_incidents",
      "booking_policy_incident_audit",
      "customer_booking_rule_overrides",
      "booking_financial_ledger",
      "customer_credit_reservations",
      "booking_refund_non_working_days",
      "booking_refund_calendar_coverage",
      "booking_policy_audit",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).toContain("create table smarter_dog_private.booking_command_receipts");
    expect(sql).toContain("create or replace view public.booking_visit_bill_summary");
  });

  it("pins the £10 visit deposit in integer pence", () => {
    expect(sql).toMatch(/amount_pence integer not null default 1000 check \(amount_pence = 1000\)/);
  });

  it("has no credit expiry and no automatic deposit release", () => {
    expect(sql).not.toMatch(/credit_expires_at|expires_at/);
    expect(sql).not.toMatch(/credit_refunded/);
    // The guarded legacy sweep must never touch a visit_v1 aggregate.
    expect(sql).toMatch(/runtime_generation\s*=\s*'legacy_compat'/);
  });

  it("adds the resolver, refund calendar helper and legacy money commands", () => {
    expect(sql).toContain("create or replace function public.resolve_deposit_requirement(");
    expect(sql).toContain("create or replace function public.refund_due_at(");
    expect(sql).toContain("create or replace function public.preview_legacy_visit_opening_money(");
    expect(sql).toContain("create or replace function public.record_legacy_visit_opening_money(");
  });

  it("denies customer roles every ledger table", () => {
    for (const table of [
      "booking_financial_ledger",
      "booking_visit_deposits",
      "booking_policy_incidents",
      "customer_credit_reservations",
    ]) {
      expect(sql).toContain(`revoke all on public.${table} from anon, authenticated`);
    }
  });
});
