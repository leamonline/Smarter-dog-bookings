// whatsapp-send refuses a customer who has opted out of WhatsApp, whatever the
// mode and whoever is calling, before anything reaches Meta (#990). Until this
// gate only the notify-* callers checked the flag through recipients.ts; staff
// template/compose sends and the agent's own modes did not.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  SUPABASE_ANON_KEY: "test-anon",
  META_ACCESS_TOKEN: "test-meta",
  META_PHONE_NUMBER_ID: "123456",
  SEND_INTERNAL_SECRET: "test-send",
})) Deno.env.set(key, value);
const { handleSendRequest } = await import("../handler.ts?opt-out");

interface Call { method: string; host: string; path: string; search: string; body: unknown }

async function send(body: Record<string, unknown>, humans: unknown[]) {
  const calls: Call[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    let parsed: unknown = null;
    try {
      parsed = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      parsed = String(init?.body ?? "");
    }
    calls.push({ method, host: url.hostname, path: url.pathname, search: url.search, body: parsed });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.hostname === "graph.facebook.com") {
      return reply({ messaging_product: "whatsapp", contacts: [{ input: "447700900123", wa_id: "447700900123" }], messages: [{ id: "wamid.test" }] });
    }
    if (url.pathname === "/rest/v1/humans") return reply(humans);
    if (url.pathname === "/rest/v1/whatsapp_conversations") {
      return method === "POST" ? reply([], 201) : reply([{ id: "conv-opt", human_id: null }]);
    }
    if (url.pathname === "/rest/v1/whatsapp_messages") return reply({ id: "msg-opt" }, 201);
    return reply([]);
  };
  try {
    const response = await handleSendRequest(
      new Request("http://send.test", {
        method: "POST",
        headers: { "x-internal-secret": "test-send", "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    const json = await response.json();
    return { status: response.status, json, calls };
  } finally {
    globalThis.fetch = oldFetch;
  }
}

const TEMPLATE = { mode: "template", to: "+447700900123", template_name: "booking_confirmed_v1", params: ["Bella", "Mon 20 Oct", "09:00"] };

Deno.test("an opted-out customer is refused with 409 and Meta is never called", async () => {
  const { status, json, calls } = await send(TEMPLATE, [{ id: "h-opt", whatsapp_opted_out: true }]);
  assertEquals(status, 409);
  assertEquals(json.reason, "whatsapp_opted_out");
  assert(String(json.error).includes("opted out"), "the error is a sentence staff can read");
  assertEquals(calls.filter((c) => c.host === "graph.facebook.com").length, 0, "nothing reached Meta");
  // The lookup tried every stored format of the number.
  const lookup = calls.find((c) => c.path === "/rest/v1/humans");
  assert(lookup, "the humans row was looked up");
  assert(decodeURIComponent(lookup.search).includes("07700900123"), "UK-local format included");
});

Deno.test("override_opt_out does not help an internal-secret caller: only a member of staff may override", async () => {
  const { status, calls } = await send({ ...TEMPLATE, override_opt_out: true }, [{ id: "h-opt", whatsapp_opted_out: true }]);
  assertEquals(status, 409);
  assertEquals(calls.filter((c) => c.host === "graph.facebook.com").length, 0);
});

Deno.test("an opted-out customer is refused in conversation-addressed modes too", async () => {
  // book_entry carries a conversation_id and a phone; the conversation is
  // linked to the opted-out customer.
  const calls: Call[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push({ method: init?.method ?? "GET", host: url.hostname, path: url.pathname, search: url.search, body: null });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.pathname === "/rest/v1/whatsapp_conversations") return reply([{ human_id: "h-opt", phone_e164: "+447700900123" }]);
    if (url.pathname === "/rest/v1/humans") return reply([{ id: "h-opt", whatsapp_opted_out: true }]);
    if (url.hostname === "graph.facebook.com") return reply({ messaging_product: "whatsapp", contacts: [], messages: [{ id: "wamid.no" }] });
    return reply([]);
  };
  try {
    const response = await handleSendRequest(
      new Request("http://send.test", {
        method: "POST",
        headers: { "x-internal-secret": "test-send", "content-type": "application/json" },
        body: JSON.stringify({ mode: "book_entry", to: "+447700900123", conversation_id: "conv-opt", body_text: "Tap to book" }),
      }),
    );
    assertEquals(response.status, 409);
  } finally {
    globalThis.fetch = oldFetch;
  }
  assertEquals(calls.filter((c) => c.host === "graph.facebook.com").length, 0);
});

Deno.test("a number with no customer record, or a customer who has not opted out, still sends", async () => {
  const unknown = await send(TEMPLATE, []);
  assertEquals(unknown.status, 200, JSON.stringify(unknown.json));
  assertEquals(unknown.calls.filter((c) => c.host === "graph.facebook.com").length, 1);

  const optedIn = await send(TEMPLATE, [{ id: "h-in", whatsapp_opted_out: false }]);
  assertEquals(optedIn.status, 200, JSON.stringify(optedIn.json));
  assertEquals(optedIn.calls.filter((c) => c.host === "graph.facebook.com").length, 1);
});
