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

// humans.phone has no canonical form; store it the way a person typed it so
// every test exercises the formatting-tolerant lookup (#1016 review).
const withStoredPhone = (rows: unknown[]) =>
  rows.map((row) => ({ phone: "07700 900123", ...(row as Record<string, unknown>) }));

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
    if (url.pathname === "/rest/v1/humans") return reply(withStoredPhone(humans));
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
  // The lookup matches the number however it was stored, not one exact string.
  const lookup = calls.find((c) => c.path === "/rest/v1/humans");
  assert(lookup, "the humans row was looked up");
  assert(decodeURIComponent(lookup.search).includes("phone=match."), decodeURIComponent(lookup.search));
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
    if (url.pathname === "/rest/v1/humans") return reply(withStoredPhone([{ id: "h-opt", whatsapp_opted_out: true }]));
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

// ── #1016 review: staff override, shared numbers, lookup failure, and the
//    STOP acknowledgement draft ──────────────────────────────────────────

interface Scenario {
  body: Record<string, unknown>;
  staff?: boolean;
  /** "nonstaff": a valid JWT whose is_staff() is false; "none": no credentials. */
  auth?: "nonstaff" | "none";
  humans?: unknown[] | "error";
  /** Rows for a lookup by phone, when it should differ from a lookup by id. */
  humansByPhone?: unknown[];
  conversation?: Record<string, unknown> | "error";
  draft?: { tool_calls: Record<string, unknown> | null };
}

async function run({ body, staff = false, auth, humans = [], humansByPhone, conversation, draft }: Scenario) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const oldFetch = globalThis.fetch;
  const oldLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    calls.push({ method, host: url.hostname, path: url.pathname, search: url.search, body: null });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    const select = url.searchParams.get("select") ?? "";
    if (url.hostname === "graph.facebook.com") {
      return reply({ messaging_product: "whatsapp", contacts: [], messages: [{ id: "wamid.review" }] });
    }
    if (url.pathname === "/auth/v1/user") return reply({ id: "staff-user-1", aud: "authenticated", role: "authenticated" });
    if (url.pathname === "/rest/v1/rpc/is_staff") return reply(auth !== "nonstaff");
    if (url.pathname === "/rest/v1/humans") {
      if (humans === "error") return reply({ message: "connection reset" }, 500);
      const byPhone = /^(in|match)\./.test(url.searchParams.get("phone") ?? "");
      return reply(withStoredPhone(byPhone && humansByPhone ? humansByPhone : humans));
    }
    if (url.pathname === "/rest/v1/whatsapp_drafts") {
      if (method === "PATCH") return reply({ id: "draft-1" });
      if (select.includes("tool_calls")) return reply(draft ? [{ conversation_id: "conv-1", ...draft }] : []);
      return reply({
        id: "draft-1",
        conversation_id: "conv-1",
        proposed_text: "No problem at all — we've stopped WhatsApp messages to this number.",
        state: "pending",
        whatsapp_conversations: { id: "conv-1", phone_e164: "+447700900123", last_inbound_at: new Date().toISOString() },
      });
    }
    if (url.pathname === "/rest/v1/whatsapp_conversations") {
      if (method !== "GET") return reply([], 201);
      if (conversation === "error") return reply({ message: "connection reset" }, 500);
      return reply([conversation ?? { id: "conv-1", human_id: "h-opt", phone_e164: "+447700900123" }]);
    }
    if (url.pathname === "/rest/v1/whatsapp_messages") return reply({ id: "msg-review" }, 201);
    return reply([]);
  };
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (staff || auth === "nonstaff") headers.authorization = "Bearer staff-jwt";
    else if (auth !== "none") headers["x-internal-secret"] = "test-send";
    const response = await handleSendRequest(
      new Request("http://send.test", { method: "POST", headers, body: JSON.stringify(body) }),
    );
    return { status: response.status, json: await response.json(), calls, logs };
  } finally {
    globalThis.fetch = oldFetch;
    console.log = oldLog;
  }
}

const metaCalls = (calls: Call[]) => calls.filter((c) => c.host === "graph.facebook.com").length;
const OPTED_OUT = [{ id: "h-opt", whatsapp_opted_out: true }];

Deno.test("a member of staff can override an opt-out explicitly, and the override is logged", async () => {
  const { status, json, calls, logs } = await run({
    body: { ...TEMPLATE, override_opt_out: true },
    staff: true,
    humans: OPTED_OUT,
  });
  assertEquals(status, 200, JSON.stringify(json));
  assertEquals(metaCalls(calls), 1);
  assert(
    logs.some((line) => line.includes("staff override of an opt-out (template)") && line.includes("staff-user-1")),
    `override logged with the staff user: ${JSON.stringify(logs)}`,
  );
});

Deno.test("a staff send without the override is still refused", async () => {
  const { status, calls } = await run({ body: TEMPLATE, staff: true, humans: OPTED_OUT });
  assertEquals(status, 409);
  assertEquals(metaCalls(calls), 0);
});

Deno.test("a number shared by two customer records is refused if either opted out", async () => {
  const { status, calls } = await run({
    body: TEMPLATE,
    humans: [{ id: "h-in", whatsapp_opted_out: false }, { id: "h-opt", whatsapp_opted_out: true }],
  });
  assertEquals(status, 409);
  assertEquals(metaCalls(calls), 0);
});

Deno.test("an opt-out lookup that errors fails closed with a retryable 503", async () => {
  const { status, json, calls } = await run({ body: TEMPLATE, humans: "error" });
  assertEquals(status, 503);
  assertEquals(json.reason, "opt_out_check_failed");
  assertEquals(metaCalls(calls), 0);
});

Deno.test("staff approving the agent's STOP acknowledgement draft unedited sends it", async () => {
  const { status, json, calls, logs } = await run({
    body: { mode: "draft", draft_id: "draft-1" },
    staff: true,
    humans: OPTED_OUT,
    draft: { tool_calls: { opt_out_acknowledgement: true } },
  });
  assertEquals(status, 200, JSON.stringify(json));
  assertEquals(metaCalls(calls), 1);
  assert(logs.some((line) => line.includes("STOP acknowledgement")), JSON.stringify(logs));
});

Deno.test("the acknowledgement cannot carry edited text to an opted-out customer", async () => {
  const { status, calls } = await run({
    body: { mode: "draft", draft_id: "draft-1", edited_text: "Book now for 20% off!" },
    staff: true,
    humans: OPTED_OUT,
    draft: { tool_calls: { opt_out_acknowledgement: true } },
  });
  assertEquals(status, 409);
  assertEquals(metaCalls(calls), 0);
});

Deno.test("only staff can send the acknowledgement; any other draft to an opted-out customer is refused", async () => {
  const internal = await run({
    body: { mode: "draft", draft_id: "draft-1" },
    humans: OPTED_OUT,
    draft: { tool_calls: { opt_out_acknowledgement: true } },
  });
  assertEquals(internal.status, 409);
  assertEquals(metaCalls(internal.calls), 0);

  const ordinary = await run({
    body: { mode: "draft", draft_id: "draft-1" },
    staff: true,
    humans: OPTED_OUT,
    draft: { tool_calls: { reason: "booking_propose" } },
  });
  assertEquals(ordinary.status, 409);
  assertEquals(metaCalls(ordinary.calls), 0);
});

// ── #1016 boundary review: what can and cannot unlock the acknowledgement ──

const ACK_DRAFT = { tool_calls: { opt_out_acknowledgement: true } };

Deno.test("the acknowledgement marker is read from the stored draft, never from the request", async () => {
  const { status, calls } = await run({
    body: {
      mode: "draft",
      draft_id: "draft-1",
      opt_out_acknowledgement: true,
      tool_calls: { opt_out_acknowledgement: true },
    },
    staff: true,
    humans: OPTED_OUT,
    draft: { tool_calls: { reason: "booking_propose" } },
  });
  assertEquals(status, 409);
  assertEquals(metaCalls(calls), 0);
});

Deno.test("no credentials, or a signed-in non-staff user, cannot send the acknowledgement", async () => {
  const anonymous = await run({ body: { mode: "draft", draft_id: "draft-1" }, auth: "none", humans: OPTED_OUT, draft: ACK_DRAFT });
  assertEquals(anonymous.status, 401);
  assertEquals(metaCalls(anonymous.calls), 0);

  const customer = await run({ body: { mode: "draft", draft_id: "draft-1" }, auth: "nonstaff", humans: OPTED_OUT, draft: ACK_DRAFT });
  assertEquals(customer.status, 403);
  assertEquals(metaCalls(customer.calls), 0);
});

Deno.test("an AI-initiated send of the acknowledgement never reaches Meta", async () => {
  const { status, calls } = await run({
    body: { mode: "draft", draft_id: "draft-1", ai_initiated: true },
    staff: true,
    humans: OPTED_OUT,
    draft: ACK_DRAFT,
  });
  assert(status >= 400, `refused (got ${status})`);
  assertEquals(metaCalls(calls), 0);
});

Deno.test("the acknowledgement exception is draft-only: staff manual text to the same customer is refused", async () => {
  const { status, calls } = await run({
    body: { mode: "manual", to: "+447700900123", conversation_id: "conv-1", text: "Quick question about Bella" },
    staff: true,
    humans: OPTED_OUT,
  });
  assertEquals(status, 409);
  assertEquals(metaCalls(calls), 0);
});

Deno.test("a whitespace-only edit counts as unedited and sends the acknowledgement's own text", async () => {
  const { status, json, calls } = await run({
    body: { mode: "draft", draft_id: "draft-1", edited_text: "   " },
    staff: true,
    humans: OPTED_OUT,
    draft: ACK_DRAFT,
  });
  assertEquals(status, 200, JSON.stringify(json));
  assertEquals(metaCalls(calls), 1);
  assert(String(json.sent_text).startsWith("No problem at all"), String(json.sent_text));
});

Deno.test("a conversation whose customer has not opted out is still refused when another record on its number has", async () => {
  // Draft mode carries no `to`, so only the conversation's own phone can
  // find the second record: this pins that lookup, not the direct one.
  const { status, calls } = await run({
    body: { mode: "draft", draft_id: "draft-1" },
    staff: true,
    draft: { tool_calls: { reason: "booking_propose" } },
    conversation: { id: "conv-1", human_id: "h-in", phone_e164: "+447700900123" },
    humans: [{ id: "h-in", whatsapp_opted_out: false }],
    humansByPhone: [{ id: "h-in", whatsapp_opted_out: false }, { id: "h-opt", whatsapp_opted_out: true }],
  });
  assertEquals(status, 409);
  assertEquals(metaCalls(calls), 0);
});

Deno.test("a failed conversation lookup also fails closed", async () => {
  const { status, json, calls } = await run({
    body: { mode: "book_entry", to: "+447700900123", conversation_id: "conv-1", body_text: "Tap to book" },
    conversation: "error",
  });
  assertEquals(status, 503);
  assertEquals(json.reason, "opt_out_check_failed");
  assertEquals(metaCalls(calls), 0);
});

Deno.test("an opted-out customer stored as '+44 (0)7700 900 123' is still refused", async () => {
  const { status, calls } = await run({
    body: TEMPLATE,
    humans: [{ id: "h-opt", phone: "+44 (0)7700 900 123", whatsapp_opted_out: true }],
  });
  assertEquals(status, 409);
  assertEquals(metaCalls(calls), 0);
});

Deno.test("a row the loose pattern returns but whose digits differ is not counted", async () => {
  // The database pattern is permissive by design; the digits are re-checked.
  const { status, calls } = await run({
    body: TEMPLATE,
    humans: [{ id: "h-other", phone: "07700 900124", whatsapp_opted_out: true }],
  });
  assertEquals(status, 200);
  assertEquals(metaCalls(calls), 1);
});
