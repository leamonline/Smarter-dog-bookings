// An expired tap-to-confirm. A late "Yes" is a dead end: the customer is told
// the team will sort it and a staff to-do is raised. A late "No" is still a
// no: nothing is sent and no task is created. A failed customer lookup must
// be logged rather than silently skipping the promised to-do.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

const SECRET = "test-internal-secret-expiry-0123456789";
Deno.env.set("SUPABASE_URL", "http://supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("APPLY_CONFIRM_INTERNAL_SECRET", SECRET);
Deno.env.set("SEND_INTERNAL_SECRET", "test-send");
const { handleApplyCustomerConfirm } = await import("./handler.ts?expiry");

const ACTION = "00000000-0000-4000-8000-0000000000c1";
const CONVO = "00000000-0000-4000-8000-0000000000c2";

async function tapExpired(choice: "yes" | "no", opts: { lookupFails?: boolean } = {}) {
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const errors: string[] = [];
  const oldFetch = globalThis.fetch;
  const oldError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); };
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, path: url.pathname, body });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.pathname === "/rest/v1/whatsapp_booking_actions") {
      return method === "PATCH"
        ? reply([{ id: ACTION }])
        : reply({ id: ACTION, conversation_id: CONVO, action: "create", payload: {}, state: "awaiting_customer_confirm", customer_confirm_expires_at: new Date(Date.now() - 60_000).toISOString(), target_booking_id: null });
    }
    if (url.pathname === "/rest/v1/whatsapp_conversations") return opts.lookupFails ? reply({ message: "synthetic lookup failure" }, 500) : reply({ human_id: "human-expiry" });
    if (url.pathname === "/rest/v1/humans") return reply({ name: "Synthetic", surname: "Person" });
    if (url.pathname === "/rest/v1/salon_todos") return method === "POST" ? reply(null, 201) : (url.searchParams.get("select") === "sort_order" ? reply(null) : reply([]));
    if (url.pathname.endsWith("/functions/v1/whatsapp-send")) return reply({ ok: true });
    throw new Error(`unexpected ${method} ${url.pathname}`);
  };
  try {
    const res = await handleApplyCustomerConfirm(new Request("http://localhost/apply-customer-confirm", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": SECRET },
      body: JSON.stringify({ booking_action_id: ACTION, choice, caller_conversation_id: CONVO }),
    }));
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "expired");
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldError;
  }
  return {
    sends: calls.filter((c) => c.path.endsWith("/functions/v1/whatsapp-send")),
    todoInserts: calls.filter((c) => c.path === "/rest/v1/salon_todos" && c.method === "POST"),
    expiredWrite: calls.find((c) => c.path === "/rest/v1/whatsapp_booking_actions" && c.method === "PATCH"),
    errors,
  };
}

Deno.test("a late Yes hands over to the team and raises a to-do saying we replied", async () => {
  const { sends, todoInserts, expiredWrite } = await tapExpired("yes");
  assertEquals(expiredWrite?.body.rejection_reason, "expired");
  assertEquals(sends.length, 1);
  assertStringIncludes(String(sends[0].body.text), "passed it to the team");
  assertEquals(todoInserts.length, 1);
  assertEquals(todoInserts[0].body.human_id, "human-expiry");
  assertStringIncludes(String(todoInserts[0].body.text), "We replied");
});

Deno.test("a late No expires the action quietly: no message, no to-do", async () => {
  const { sends, todoInserts, expiredWrite } = await tapExpired("no");
  assertEquals(expiredWrite?.body.rejection_reason, "expired");
  assertEquals(sends.length, 0);
  assertEquals(todoInserts.length, 0);
});

Deno.test("a failed customer lookup is logged instead of silently skipping the to-do", async () => {
  const { sends, todoInserts, errors } = await tapExpired("yes", { lookupFails: true });
  assertEquals(sends.length, 1);
  assertEquals(todoInserts.length, 0);
  assert(errors.some((e) => e.includes("follow-up to-do not created")), `expected a logged failure, got: ${errors.join(" | ")}`);
});
