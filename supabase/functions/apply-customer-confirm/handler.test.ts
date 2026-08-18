// Runtime auth-gate tests for apply-customer-confirm.
//
// Why this function gets runtime tests when most rely on the static
// verdict-flow guard: its x-internal-secret check is the ONLY gate on the
// autonomous booking path — the action it applies deliberately bypasses
// is_staff() (state='confirmed'), so nothing downstream re-checks the caller.
// docs/edge-function-auth.md calls this out as the highest-blast-radius
// internal-secret endpoint.
//
// Every case below runs with NO database and NO network. That is not a
// convenience — it is the property under test: the method gate, the secret
// gate and input validation must all reject BEFORE the handler constructs a
// Supabase client or touches anything stateful. If someone reorders the
// handler so that work precedes auth, these tests start failing with
// connection errors instead of clean statuses, which is exactly the alarm
// they exist to raise.
//
// Env is set before the dynamic import because handler.ts reads its secrets
// at module scope. The values are test-only stand-ins; nothing here can
// reach a real project.
import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

const TEST_SECRET = "test-internal-secret-0123456789abcdef";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("APPLY_CONFIRM_INTERNAL_SECRET", TEST_SECRET);
// Unset on purpose: sendAckText() must no-op rather than fetch.
Deno.env.delete("SEND_INTERNAL_SECRET");

const { handleApplyCustomerConfirm } = await import("./handler.ts");

function post(headers: Record<string, string>, body: string): Request {
  return new Request("http://localhost/apply-customer-confirm", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

const VALID_BODY = JSON.stringify({
  booking_action_id: "00000000-0000-0000-0000-000000000000",
  choice: "yes",
  caller_conversation_id: "00000000-0000-0000-0000-000000000001",
});

Deno.test("a non-POST method is refused before anything else", async () => {
  const res = await handleApplyCustomerConfirm(
    new Request("http://localhost/apply-customer-confirm", { method: "GET" }),
  );
  assertEquals(res.status, 405);
});

Deno.test("a missing x-internal-secret header gets 401", async () => {
  const res = await handleApplyCustomerConfirm(post({}, VALID_BODY));
  assertEquals(res.status, 401);
  assertEquals(await res.text(), "unauthorized");
});

Deno.test("a wrong secret gets 401", async () => {
  const res = await handleApplyCustomerConfirm(
    post({ "x-internal-secret": "not-the-secret" }, VALID_BODY),
  );
  assertEquals(res.status, 401);
});

Deno.test("a near-miss secret (right prefix, wrong tail) gets 401", async () => {
  const res = await handleApplyCustomerConfirm(
    post({ "x-internal-secret": TEST_SECRET.slice(0, -1) + "X" }, VALID_BODY),
  );
  assertEquals(res.status, 401);
});

Deno.test("an empty secret header gets 401", async () => {
  const res = await handleApplyCustomerConfirm(
    post({ "x-internal-secret": "" }, VALID_BODY),
  );
  assertEquals(res.status, 401);
});

// The positive control: with the correct secret the gate OPENS, proven by the
// request advancing to input validation (400s) rather than 401 — still before
// any Supabase client exists, so still no database in the picture.
Deno.test("the correct secret advances past auth to body validation", async () => {
  const badJson = await handleApplyCustomerConfirm(
    post({ "x-internal-secret": TEST_SECRET }, "{not json"),
  );
  assertEquals(badJson.status, 400);
  assertEquals(await badJson.text(), "bad json");

  const missingFields = await handleApplyCustomerConfirm(
    post({ "x-internal-secret": TEST_SECRET }, JSON.stringify({ choice: "yes" })),
  );
  assertEquals(missingFields.status, 400);

  const invalidChoice = await handleApplyCustomerConfirm(
    post(
      { "x-internal-secret": TEST_SECRET },
      JSON.stringify({ booking_action_id: "x", choice: "maybe" }),
    ),
  );
  assertNotEquals(invalidChoice.status, 401);
  assertEquals(invalidChoice.status, 400);
});
