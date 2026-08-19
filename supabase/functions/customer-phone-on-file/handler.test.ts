// Runtime gate tests for customer-phone-on-file.
//
// Third of the shortlist, and the odd one out: this endpoint is PUBLIC by
// design — a pre-auth login helper with no caller identity to check. Its
// contract (authManifest.json, family public-rate-limited) is that the only
// things standing between the internet and the phone-existence oracle are an
// origin allowlist and a two-tier rate limit, and that the answer never
// exceeds two booleans.
//
// Every case below runs with NO database and NO network. The input gates
// (method, JSON shape, phone shape) reject before any RPC. The final test
// pins the property that makes a public oracle safe to operate: the rate
// limiter FAILS CLOSED — checkAndRecordAttempt returns false on any RPC
// error, by explicit design ("better to block one legitimate request than to
// let an attacker through") — so an unreachable rate-limit store yields 429,
// never an on_file/has_password answer.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("CUSTOMER_PHONE_ALLOWED_ORIGINS", "https://example.test");

const { handleCustomerPhoneOnFile } = await import("./handler.ts");

function post(body: string): Request {
  return new Request("http://localhost/customer-phone-on-file", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

Deno.test("OPTIONS preflight gets 204", async () => {
  const res = await handleCustomerPhoneOnFile(
    new Request("http://localhost/customer-phone-on-file", { method: "OPTIONS" }),
  );
  assertEquals(res.status, 204);
});

Deno.test("a non-POST method is refused", async () => {
  const res = await handleCustomerPhoneOnFile(
    new Request("http://localhost/customer-phone-on-file", { method: "GET" }),
  );
  assertEquals(res.status, 405);
});

Deno.test("invalid JSON gets 400 before anything is counted or queried", async () => {
  const res = await handleCustomerPhoneOnFile(post("{not json"));
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "invalid_json");
});

Deno.test("an empty or garbage phone gets 400 before anything is counted or queried", async () => {
  for (const phone of ["", "12345", "x".repeat(21)]) {
    const res = await handleCustomerPhoneOnFile(post(JSON.stringify({ phone })));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, "invalid_phone");
  }
});

Deno.test("an unreachable rate-limit store fails closed — 429, never an answer", async () => {
  // The store is unreachable here, so the per-IP limiter's error path runs.
  // It must refuse (fail closed) rather than fall through to the lookup.
  const res = await handleCustomerPhoneOnFile(
    post(JSON.stringify({ phone: "07700900000" })),
  );
  assertEquals(res.status, 429);
  const body = await res.text();
  assert(!body.includes("on_file"), "a refusal must not carry the oracle answer");
  assert(!body.includes("has_password"), "a refusal must not carry the oracle answer");
});
