// Runtime gate tests for staff-invite.
//
// This function mints staff accounts with the service-role key, so what must
// never happen is work before authentication. Every gate-ordering case runs
// with NO database and NO network: the method gate, the origin gate and the
// missing-credential gate all have to refuse BEFORE a Supabase client is
// constructed. If someone reorders the handler so work precedes auth, these
// start failing with connection errors instead of clean statuses.
//
// Whether a *signed-in non-owner* is refused needs a live Auth server, so that
// path is covered by the static verdict-flow guard (npm run check:edge-auth),
// which requires auth.getUser and is_staff to reach an exiting if-guard, and by
// the owner check living in the same helper. The input rules are pure and are
// tested exhaustively below.
//
// Env is set before the dynamic import because handler.ts reads it at module
// scope. The values are test-only stand-ins and cannot reach a real project.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("STAFF_INVITE_ALLOWED_ORIGINS", "https://smarterdog.co.uk");

const { handleStaffInvite, validateInviteInput } = await import("./handler.ts");

const GOOD_ORIGIN = "https://smarterdog.co.uk";
const VALID_BODY = JSON.stringify({ email: "new.person@example.com", display_name: "New Person" });

function post(headers: Record<string, string>, body = VALID_BODY): Request {
  return new Request("http://localhost/staff-invite", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

Deno.test("a non-POST method is refused first", async () => {
  const res = await handleStaffInvite(
    new Request("http://localhost/staff-invite", { method: "GET" }),
  );
  assertEquals(res.status, 405);
});

Deno.test("a CORS preflight is answered without any auth work", async () => {
  const res = await handleStaffInvite(
    new Request("http://localhost/staff-invite", {
      method: "OPTIONS",
      headers: { origin: GOOD_ORIGIN },
    }),
  );
  assertEquals(res.status, 204);
});

Deno.test("a request with no origin is refused before auth", async () => {
  const res = await handleStaffInvite(post({ authorization: "Bearer anything" }));
  assertEquals(res.status, 403);
});

Deno.test("an origin that is not on the allowlist is refused before auth", async () => {
  const res = await handleStaffInvite(
    post({ origin: "https://evil.example", authorization: "Bearer anything" }),
  );
  assertEquals(res.status, 403);
});

Deno.test("an allowed origin with no authorization header gets 401", async () => {
  const res = await handleStaffInvite(post({ origin: GOOD_ORIGIN }));
  assertEquals(res.status, 401);
});

Deno.test("a refusal never echoes an origin that is not allowed", async () => {
  const res = await handleStaffInvite(
    post({ origin: "https://evil.example", authorization: "Bearer anything" }),
  );
  assertEquals(res.headers.get("access-control-allow-origin"), null);
});

// ---- validateInviteInput ---------------------------------------------------

Deno.test("valid input is accepted and normalised", () => {
  const r = validateInviteInput({ email: "  New.Person@Example.COM ", display_name: "  New   Person " });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value, { email: "new.person@example.com", displayName: "New Person", role: "staff" });
  }
});

Deno.test("role defaults to staff and owner is only granted when asked for", () => {
  const base = { email: "a@b.co", display_name: "A" };
  const none = validateInviteInput(base);
  const owner = validateInviteInput({ ...base, role: "owner" });
  assertEquals(none.ok && none.value.role, "staff");
  assertEquals(owner.ok && owner.value.role, "owner");
});

Deno.test("anything other than staff or owner is rejected as a role", () => {
  for (const role of ["admin", "Owner", "", "superuser", 1, true, {}]) {
    const r = validateInviteInput({ email: "a@b.co", display_name: "A", role });
    assertEquals(r.ok, false, `role ${JSON.stringify(role)} should be rejected`);
  }
});

Deno.test("bad emails are rejected", () => {
  for (const email of ["", "   ", "nope", "a@b", "a b@c.co", "a@b.co, c@d.co", "<x>@b.co", undefined, 5, null]) {
    const r = validateInviteInput({ email, display_name: "A" });
    assertEquals(r.ok, false, `email ${JSON.stringify(email)} should be rejected`);
  }
  const long = `${"a".repeat(250)}@b.co`;
  assertEquals(validateInviteInput({ email: long, display_name: "A" }).ok, false);
});

Deno.test("a missing, blank or over-long name is rejected", () => {
  for (const display_name of [undefined, "", "   ", "\n\t", 7]) {
    assertEquals(validateInviteInput({ email: "a@b.co", display_name }).ok, false);
  }
  assertEquals(validateInviteInput({ email: "a@b.co", display_name: "x".repeat(61) }).ok, false);
  assertEquals(validateInviteInput({ email: "a@b.co", display_name: "x".repeat(60) }).ok, true);
});

Deno.test("control characters are stripped from the name", () => {
  const r = validateInviteInput({ email: "a@b.co", display_name: "Sam\u0000\u0007\nJones" });
  assertEquals(r.ok && r.value.displayName, "Sam Jones");
});

Deno.test("a body that is not an object is rejected", () => {
  for (const body of [null, undefined, "x", 1, true]) {
    assertEquals(validateInviteInput(body).ok, false);
  }
});
