// Static contract for the booking visit foundation migration.
// The migration introduces the visit aggregate WITHOUT activating the new
// policy: previous_day_1500_v1 must be seeded with a null effective instant,
// and bookings.visit_id must stay nullable during the compatibility rollout.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260726144000_booking_visit_foundation.sql",
  "utf8",
);

describe("booking visit foundation migration", () => {
  it("creates a visit aggregate without activating the new policy", () => {
    expect(sql).toContain("create table public.booking_visits");
    expect(sql).toContain("add column if not exists visit_id uuid");
    expect(sql).toMatch(/previous_day_1500_v1[\s\S]+null/);
    expect(sql).not.toContain("alter column visit_id set not null");
  });

  it("separates the immutable lineage ordinal from the optimistic row revision", () => {
    expect(sql).toContain(
      "revision smallint not null default 1 check (revision > 0)",
    );
    expect(sql).toContain(
      "row_revision integer not null default 1 check (row_revision > 0)",
    );
    expect(sql).toContain(
      "on public.booking_visits(lineage_id, revision)",
    );
    expect(sql).toContain(
      "new.row_revision := old.row_revision + 1",
    );
    expect(sql).toContain(
      "create trigger booking_visits_row_revision",
    );
    expect(sql).toContain(
      "new.lineage_id is distinct from old.lineage_id",
    );
    expect(sql).toContain(
      "new.supersedes_visit_id is distinct from old.supersedes_visit_id",
    );
    const guardStart = sql.indexOf(
      "create or replace function public.guard_booking_visit_linkage()",
    );
    const guardEnd = sql.indexOf("$$;", guardStart);
    expect(sql.slice(guardStart, guardEnd)).not.toContain("and exists (");
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
