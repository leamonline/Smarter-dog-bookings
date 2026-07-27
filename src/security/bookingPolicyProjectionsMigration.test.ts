import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customerSql = readFileSync(
  "supabase/migrations/20260726144011_customer_visit_projection.sql",
  "utf8",
);
const staffSql = readFileSync(
  "supabase/migrations/20260726144013_staff_booking_policy_projections.sql",
  "utf8",
);

describe("booking policy projection migrations", () => {
  it("keeps the customer projection owner-scoped and structurally stable", () => {
    expect(customerSql).toContain(
      "create or replace function public.list_customer_booking_visits",
    );
    expect(customerSql).toContain("where h.customer_user_id = (select auth.uid())");
    expect(customerSql).toContain("'id', v.id");
    expect(customerSql).toContain("'pendingChange'");
    expect(customerSql).toContain("settles_event_id = obligation.id");
    expect(customerSql).toContain(
      "public.visit_actionability(v.id, 'cancel', statement_timestamp())",
    );
    expect(customerSql).toContain("staff_review_required");
  });

  it("creates both staff projections behind the staff assertion", () => {
    expect(staffSql).toContain(
      "create or replace function public.list_staff_booking_policy_attention()",
    );
    expect(staffSql).toContain(
      "create or replace function public.list_staff_booking_visit(p_visit_id uuid)",
    );
    expect(staffSql.match(/perform smarter_dog_private\.require_staff\(\)/g)).toHaveLength(
      2,
    );
  });

  it("derives due work at the exact server-time boundary", () => {
    expect(staffSql).toContain(
      "create or replace function smarter_dog_private.booking_policy_due_at_or_before",
    );
    expect(staffSql).toMatch(
      /d\.state in \('awaiting_terms','awaiting_payment'\)[\s\S]+booking_policy_due_at_or_before\(\s*d\.due_at,\s*v_generated_at\s*\)/,
    );
    expect(staffSql).toMatch(
      /obligation\.event_kind = 'refund_due'[\s\S]+settles_event_id = obligation\.id/,
    );
    expect(staffSql).toMatch(
      /'overdue',\s*smarter_dog_private\.booking_policy_due_at_or_before\(\s*obligation\.due_at,\s*v_generated_at\s*\)/,
    );
  });

  it("returns every mutable revision needed for stale-review protection", () => {
    expect(customerSql).toContain("'revision', v.row_revision");
    expect(staffSql).toContain("'visitRevision', v.row_revision");
    expect(staffSql).toContain("'revision', request.revision");
    expect(staffSql).toContain(
      "'sourceVisitRevision', source_visit.row_revision",
    );
    expect(staffSql).toContain("'revision', incident.revision");
    expect(staffSql).toContain(
      "'visitRevision', incident_visit.row_revision",
    );
  });

  it("uses hardened security-definer functions with narrow execute grants", () => {
    expect(staffSql.match(/security definer/g)).toHaveLength(2);
    expect(staffSql.match(/set search_path = public, pg_temp/g)).toHaveLength(3);
    expect(staffSql).toContain(
      "revoke all on function smarter_dog_private.booking_policy_due_at_or_before",
    );
    expect(staffSql).toContain(
      "revoke all on function public.list_staff_booking_policy_attention() from public, anon, authenticated",
    );
    expect(staffSql).toContain(
      "grant execute on function public.list_staff_booking_policy_attention() to authenticated",
    );
    expect(staffSql).toContain(
      "revoke all on function public.list_staff_booking_visit(uuid) from public, anon, authenticated",
    );
    expect(staffSql).toContain(
      "grant execute on function public.list_staff_booking_visit(uuid) to authenticated",
    );
  });
});
