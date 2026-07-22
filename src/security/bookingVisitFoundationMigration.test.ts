// Static contract for the booking visit foundation migration.
// The migration introduces the visit aggregate WITHOUT activating the new
// policy: previous_day_1500_v1 must be seeded with a null effective instant,
// and bookings.visit_id must stay nullable during the compatibility rollout.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260722120000_booking_visit_foundation.sql",
  "utf8",
);

describe("booking visit foundation migration", () => {
  it("creates a visit aggregate without activating the new policy", () => {
    expect(sql).toContain("create table public.booking_visits");
    expect(sql).toContain("add column if not exists visit_id uuid");
    expect(sql).toMatch(/previous_day_1500_v1[\s\S]+null/);
    expect(sql).not.toContain("alter column visit_id set not null");
  });

  it("keeps visit helpers private", () => {
    expect(sql).toContain(
      "revoke all on function public.visit_rows(uuid) from public, anon, authenticated",
    );
  });

  it("enables RLS and revokes aggregate tables from customer roles", () => {
    expect(sql).toContain("alter table public.booking_visits enable row level security");
    expect(sql).toContain("revoke all on public.booking_visits from anon, authenticated");
  });
});
