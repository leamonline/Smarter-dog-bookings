import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260728133020_customer_override_reschedule_approval.sql";
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

function functionBody(name: string): string {
  const definition = `create or replace function public.${name}(`;
  const start = sql.indexOf(definition);
  expect(start, `${name} definition`).toBeGreaterThanOrEqual(0);
  const bodyStart = sql.indexOf("as $$", start);
  const end = sql.indexOf("$$;", bodyStart);
  expect(bodyStart, `${name} body start`).toBeGreaterThan(start);
  expect(end, `${name} body end`).toBeGreaterThan(bodyStart);
  return sql.slice(bodyStart, end);
}

describe("customer override reschedule approval migration", () => {
  it("blocks the direct customer reschedule command for overridden visits", () => {
    const body = functionBody("reschedule_customer_booking");

    expect(body).toContain("staff_capacity_override");
    expect(body).toContain("visit_id");
    expect(body).toContain("staff_override_requires_approval");
    expect(body).toContain("errcode = 'SDR01'");
    expect(body).toContain("reschedule_customer_booking_direct_unchecked");
  });

  it("creates one owned pending request without moving the booking", () => {
    const body = functionBody("request_customer_override_reschedule");

    expect(body).toContain("auth.uid()");
    expect(body).toContain("customer_user_id");
    expect(body).toContain("staff_capacity_override");
    expect(body).toContain("booking_change_requests");
    expect(body).toContain("'staff_capacity_override'");
    expect(body).toContain("'pending_staff'");
    expect(body).not.toContain("update public.bookings");
  });

  it("keeps staff decisions atomic and reapplies the capacity override on approval", () => {
    const body = functionBody("decide_customer_override_reschedule_request");
    const decline = body.indexOf("p_decision = 'deny'");
    const move = body.indexOf("update public.bookings");

    expect(body).toContain("require_staff()");
    expect(decline).toBeGreaterThanOrEqual(0);
    expect(move).toBeGreaterThan(decline);
    expect(body).toContain("staff_capacity_override = true");
    expect(body).toContain("status = 'declined'");
    expect(body).toContain("status = 'accepted'");
    expect(body).toContain("booking_change_request_id");
  });

  it("exposes only the two narrow authenticated commands", () => {
    expect(sql).toContain(
      "grant execute on function public.request_customer_override_reschedule",
    );
    expect(sql).toContain(
      "grant execute on function public.decide_customer_override_reschedule_request",
    );
    expect(sql).toMatch(
      /revoke all on function public\.reschedule_customer_booking_direct_unchecked[\s\S]*from public, anon, authenticated, service_role/i,
    );
  });
});
