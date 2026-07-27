import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260726144004_customer_visit_commands.sql",
  "utf8",
);

function publicFunctionBody(name: string): string {
  const definition = `create or replace function public.${name}(`;
  const start = sql.indexOf(definition);
  expect(start, `${name} definition`).toBeGreaterThanOrEqual(0);
  const bodyStart = sql.indexOf("as $$", start);
  const end = sql.indexOf("$$;", bodyStart);
  expect(bodyStart, `${name} body start`).toBeGreaterThan(start);
  expect(end, `${name} body end`).toBeGreaterThan(bodyStart);
  return sql.slice(bodyStart, end);
}

function privateFunctionBody(name: string): string {
  const definition = `create or replace function smarter_dog_private.${name}(`;
  const start = sql.indexOf(definition);
  expect(start, `${name} definition`).toBeGreaterThanOrEqual(0);
  const bodyStart = sql.indexOf("as $$", start);
  const end = sql.indexOf("$$;", bodyStart);
  expect(bodyStart, `${name} body start`).toBeGreaterThan(start);
  expect(end, `${name} body end`).toBeGreaterThan(bodyStart);
  return sql.slice(bodyStart, end);
}

describe("customer booking-policy review contracts", () => {
  it("authenticates and resolves ownership before an inactive preview returns", () => {
    const body = publicFunctionBody("preview_customer_cancel_visit");
    const owner = body.indexOf(
      "v_human := smarter_dog_private.owned_human_id()",
    );
    const visit = body.indexOf("from public.booking_visits");
    const runtime = body.indexOf(
      "public.booking_policy_runtime() <> 'active'",
    );
    const tokenWrite = body.indexOf(
      "insert into smarter_dog_private.booking_change_reviews",
    );

    expect(owner).toBeGreaterThanOrEqual(0);
    expect(visit).toBeGreaterThan(owner);
    expect(runtime).toBeGreaterThan(visit);
    expect(tokenWrite).toBeGreaterThan(runtime);
    expect(body).toContain("blocked_receipt('policy_not_active'");
  });

  it("rejects a review when its runtime or settings snapshot is stale", () => {
    const body = privateFunctionBody("cancel_customer_visit_dispatch");

    expect(body).toContain("rev.runtime_state");
    expect(body).toContain("rev.settings_version");
    expect(body).toContain("rev.auto_confirm");
    expect(body).toContain("s.updated_at");
    expect(body).toContain("s.auto_confirm");
  });

  it("locks the visit before the request and revalidates ownership after both locks", () => {
    const body = publicFunctionBody(
      "withdraw_customer_booking_change_request",
    );
    const resolve = body.indexOf(
      "select source_visit_id into v_source_visit_id",
    );
    const visitLock = body.indexOf("from public.booking_visits", resolve);
    const requestLock = body.indexOf(
      "from public.booking_change_requests",
      visitLock,
    );
    const revalidate = body.indexOf(
      "cr.human_id is distinct from v_human",
      requestLock,
    );

    expect(resolve).toBeGreaterThanOrEqual(0);
    expect(body.slice(resolve, visitLock)).toContain("human_id = v_human");
    expect(visitLock).toBeGreaterThan(resolve);
    expect(body.slice(visitLock, requestLock)).toContain("for update");
    expect(requestLock).toBeGreaterThan(visitLock);
    expect(body.slice(requestLock, revalidate)).toContain("for update");
    expect(revalidate).toBeGreaterThan(requestLock);
  });
});
