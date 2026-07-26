// Static contract for the authoritative booking policy rules migration.
// Typed settings replace free-form salon_config JSON for behaviour-critical
// values; the runtime predicate and deadline helpers are created; nothing in
// this migration activates previous_day_1500_v1.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260726144001_authoritative_booking_policy_rules.sql",
  "utf8",
);

describe("authoritative booking policy rules migration", () => {
  it("creates the typed settings singleton with the signed defaults", () => {
    expect(sql).toContain("create table public.booking_policy_settings");
    expect(sql).toMatch(/booking_horizon_days integer not null default 180/);
    expect(sql).toMatch(/deposit_hold_hours smallint not null default 12/);
    expect(sql).toMatch(/check \(deposit_hold_hours in \(6,12,24,36,48\)\)/);
    expect(sql).toContain("create table public.booking_terms_publication_versions");
    expect(sql).toContain("create table public.booking_deposit_bank_instruction_versions");
    expect(sql).toContain("create table public.booking_policy_settings_audit");
  });

  it("keeps the new policy inactive and the runtime seam private", () => {
    expect(sql).not.toMatch(/update public\.booking_policy_versions[\s\S]{0,200}set effective_at/);
    expect(sql).toContain(
      "revoke all on function public.booking_policy_runtime_at(timestamptz) from public, anon, authenticated, service_role",
    );
    expect(sql).toContain("create or replace function public.booking_policy_runtime()");
    expect(sql).toContain("create or replace function public.booking_policy_runtime_status()");
  });

  it("pins the fixed previous-day deadline rule", () => {
    expect(sql).toContain("create or replace function public.change_deadline_for(");
    expect(sql).toMatch(/15:00/);
    expect(sql).toMatch(/previous_day_1500/);
  });

  it("locks the settings write path to the audited RPC", () => {
    expect(sql).toContain("revoke all on public.booking_policy_settings from anon, authenticated");
    expect(sql).toContain("create or replace function public.update_booking_rules(");
    expect(sql).toContain("create or replace function public.set_customer_booking_intake_enabled(");
    expect(sql).toContain("add column if not exists terms_publication_id");
    expect(sql).not.toContain(
      "create trigger booking_policy_settings_updated before update",
    );
    expect(sql.match(/updated_at = clock_timestamp\(\)/g)).toHaveLength(2);
  });

  it("keeps customer capability reads server-timed", () => {
    expect(sql).toContain(
      "create or replace function public.get_customer_booking_visit_capabilities(",
    );
    expect(sql).toContain("revoke all on function public.visit_actionability(uuid, text, timestamptz) from public, anon, authenticated");
  });
});
