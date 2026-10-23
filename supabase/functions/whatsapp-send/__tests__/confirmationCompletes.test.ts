// A booking confirmation finishes the conversation it lands in. Once Meta has
// accepted booking_confirmed_v1, whatsapp-send marks that conversation complete
// with the same columns the inbox's "Mark complete" writes, so staff no longer
// close every confirmed thread by hand. closed_by stays empty: no person
// closed it. A customer who asked for a person and has not been answered keeps
// the thread open, because closing supersedes their handoff draft as
// `conversation_closed`, which the agent then reads as settled (#1070).
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  SUPABASE_ANON_KEY: "test-anon",
  META_ACCESS_TOKEN: "test-meta",
  META_PHONE_NUMBER_ID: "123456",
  SEND_INTERNAL_SECRET: "test-send",
})) Deno.env.set(key, value);
const { handleSendRequest } = await import("../handler.ts?confirmation-completes");

interface Call { method: string; host: string; path: string; params: URLSearchParams; body: unknown }

interface Draft {
  id: string;
  created_at: string;
  state: string;
  rejected_reason?: string | null;
  handoff_required: boolean;
  tool_calls?: Record<string, unknown> | null;
}

interface Scenario {
  body?: Record<string, unknown>;
  /** true: a signed-in member of staff. false: the internal secret (notify-booking-confirmed). */
  staff?: boolean;
  /** Pending handoff drafts on the conversation. */
  pendingHandoffs?: Draft[];
  /** The conversation's newest draft. */
  latest?: Draft | null;
  /** A staff reply (`raw.sent_by = 'staff'`) exists after the newest draft. */
  staffReplied?: boolean;
  draftLookupFails?: boolean;
  staffReplyLookupFails?: boolean;
  metaFails?: boolean;
  /** Meta answers 200 but names no message. */
  metaNoMessage?: boolean;
  /** The conversation was already closed, so the guarded update matches no row. */
  alreadyClosed?: boolean;
  closeFails?: boolean;
}

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const CONFIRMATION = {
  mode: "template",
  to: "+447700900123",
  template_name: "booking_confirmed_v1",
  params: ["Sam", "Bella", "Mon 20 Oct at 09:00", "Full Groom"],
  human_id: "h-1",
};

async function run({
  body = CONFIRMATION,
  staff = false,
  pendingHandoffs = [],
  latest = null,
  staffReplied = false,
  draftLookupFails = false,
  staffReplyLookupFails = false,
  metaFails = false,
  metaNoMessage = false,
  alreadyClosed = false,
  closeFails = false,
}: Scenario = {}) {
  const calls: Call[] = [];
  const oldFetch = globalThis.fetch;
  const oldError = console.error;
  const oldLog = console.log;
  console.error = () => {};
  console.log = () => {};
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    let parsed: unknown = null;
    try {
      parsed = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      parsed = String(init?.body ?? "");
    }
    calls.push({ method, host: url.hostname, path: url.pathname, params: url.searchParams, body: parsed });
    const headers = new Headers(init?.headers);
    const single = (headers.get("accept") ?? "").includes("vnd.pgrst.object");
    const reply = (value: unknown, status = 200) =>
      Response.json(single && Array.isArray(value) ? value[0] ?? null : value, { status });
    const p = url.searchParams;

    if (url.hostname === "graph.facebook.com") {
      if (metaFails) return reply({ error: { message: "boom", code: 131000 } }, 500);
      return reply({ messaging_product: "whatsapp", contacts: [], messages: metaNoMessage ? [] : [{ id: "wamid.confirm" }] });
    }
    if (url.pathname === "/auth/v1/user") return reply({ id: "staff-user-1", aud: "authenticated", role: "authenticated" });
    if (url.pathname === "/rest/v1/rpc/is_staff") return reply(true);
    if (url.pathname === "/rest/v1/humans") return reply([{ id: "h-1", phone: "07700 900123", whatsapp_opted_out: false }]);
    if (url.pathname === "/rest/v1/whatsapp_drafts") {
      if (draftLookupFails) return reply({ message: "connection reset" }, 500);
      if (p.get("handoff_required") === "eq.true") return reply(pendingHandoffs);
      if ((p.get("order") ?? "").startsWith("created_at.desc")) return reply(latest ? [latest] : []);
      return reply([]);
    }
    if (url.pathname === "/rest/v1/whatsapp_messages") {
      if (method === "GET") {
        if (staffReplyLookupFails) return reply({ message: "connection reset" }, 500);
        return reply(staffReplied ? [{ id: "msg-staff" }] : []);
      }
      return reply([{ id: "msg-1" }], 201);
    }
    if (url.pathname === "/rest/v1/whatsapp_conversations") {
      if (method === "PATCH" && (parsed as Record<string, unknown>)?.closure_reason !== undefined) {
        if (closeFails) return reply({ message: "connection reset" }, 500);
        return reply(alreadyClosed ? [] : [{ id: p.get("id")?.replace("eq.", "") }]);
      }
      if (method !== "GET") return reply([], 201);
      return reply([{ id: "conv-1", human_id: "h-1", phone_e164: "+447700900123", last_inbound_at: ago(DAY) }]);
    }
    return reply([]);
  };
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (staff) headers.authorization = "Bearer staff-jwt";
    else headers["x-internal-secret"] = "test-send";
    const response = await handleSendRequest(
      new Request("http://send.test", { method: "POST", headers, body: JSON.stringify(body) }),
    );
    return { status: response.status, json: await response.json(), calls };
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldError;
    console.log = oldLog;
  }
}

/** The update that marks the conversation complete. */
const closes = (calls: Call[]) =>
  calls.filter((c) =>
    c.method === "PATCH"
    && c.path === "/rest/v1/whatsapp_conversations"
    && (c.body as Record<string, unknown>)?.closure_reason !== undefined
  );
const draftReads = (calls: Call[]) =>
  calls.filter((c) => c.method === "GET" && c.path === "/rest/v1/whatsapp_drafts");

const handoff = (over: Partial<Draft> = {}): Draft => ({
  id: "d-handoff",
  created_at: ago(60 * 60 * 1000),
  state: "pending",
  rejected_reason: null,
  handoff_required: true,
  tool_calls: null,
  ...over,
});

Deno.test("a sent booking confirmation marks its conversation complete, as Mark complete does", async () => {
  const before = Date.now();
  const { status, json, calls } = await run();
  assertEquals(status, 200);
  assertEquals(json.ok, true);

  const [close] = closes(calls);
  assert(close, "the conversation was marked complete");
  const written = close.body as Record<string, unknown>;
  // The same columns resolveConversation writes (useConversationLifecycle.ts).
  assertEquals(Object.keys(written).sort(), [
    "closed_at",
    "closed_by",
    "closure_reason",
    "closure_suggested_at",
    "closure_suggested_reason",
  ]);
  assertEquals(written.closed_by, null, "no person closed it");
  assertEquals(written.closure_reason, "booking_confirmed_quiet");
  assertEquals(written.closure_suggested_at, null);
  assertEquals(written.closure_suggested_reason, null);
  const closedAt = Date.parse(String(written.closed_at));
  assert(closedAt >= before - 1000 && closedAt <= Date.now() + 1000, String(written.closed_at));

  // Only the conversation the confirmation was recorded in, and only while it
  // is still open: a closure staff already made is left exactly as it is.
  assertEquals(close.params.get("id"), "eq.conv-1");
  assertEquals(close.params.get("closed_at"), "is.null");
  assertEquals(closes(calls).length, 1);
});

Deno.test("the confirmation is in the thread before the thread is closed", async () => {
  const { calls } = await run();
  const recorded = calls.findIndex((c) => c.method === "POST" && c.path === "/rest/v1/whatsapp_messages");
  const closed = calls.findIndex((c) => closes([c]).length === 1);
  assert(recorded >= 0 && closed > recorded, `recorded at ${recorded}, closed at ${closed}`);
});

Deno.test("a confirmation staff send by hand completes the thread too", async () => {
  const { status, calls } = await run({ staff: true, body: { ...CONFIRMATION, conversation_id: "conv-7" } });
  assertEquals(status, 200);
  const [close] = closes(calls);
  assert(close);
  assertEquals(close.params.get("id"), "eq.conv-7");
  assertEquals((close.body as Record<string, unknown>).closed_by, null);
});

Deno.test("an unanswered request for a person keeps the thread open", async () => {
  const { status, calls } = await run({ pendingHandoffs: [handoff()], latest: handoff() });
  assertEquals(status, 200, "the confirmation itself still went");
  assertEquals(closes(calls).length, 0);
  const [lookup] = draftReads(calls);
  assertEquals(lookup.params.get("conversation_id"), "eq.conv-1");
  assertEquals(lookup.params.get("state"), "eq.pending");
  assertEquals(lookup.params.get("handoff_required"), "eq.true");
});

Deno.test("so does a pending handoff older than the newest draft", async () => {
  const { calls } = await run({
    pendingHandoffs: [handoff({ created_at: ago(20 * DAY) })],
    latest: { id: "d-new", created_at: ago(60_000), state: "pending", handoff_required: false },
  });
  assertEquals(closes(calls).length, 0);
});

Deno.test("a handoff the agent is carrying onto a newer message keeps the thread open", async () => {
  // Superseded only by the customer's next message, with no staff reply since:
  // the agent writes it again for that message (or will on replay).
  const { calls } = await run({
    latest: handoff({ state: "superseded", rejected_reason: "newer_inbound", created_at: ago(2 * DAY) }),
  });
  assertEquals(closes(calls).length, 0);
  const reply = calls.find((c) => c.method === "GET" && c.path === "/rest/v1/whatsapp_messages");
  assert(reply, "staff replies were checked");
  assertEquals(reply.params.get("conversation_id"), "eq.conv-1");
  assertEquals(reply.params.get("direction"), "eq.outbound");
  assertEquals(reply.params.get("raw->>sent_by"), "eq.staff");
  assert((reply.params.get("sent_at") ?? "").startsWith("gt."), reply.params.get("sent_at") ?? "");
});

Deno.test("a handoff staff have since answered no longer holds the thread open", async () => {
  const { calls } = await run({
    latest: handoff({ state: "superseded", rejected_reason: "newer_inbound" }),
    staffReplied: true,
  });
  assertEquals(closes(calls).length, 1);
});

Deno.test("settled handoffs do not hold the thread open", async (t) => {
  const settled: Record<string, Draft> = {
    "approved and sent by staff": handoff({ state: "approved" }),
    "rejected": handoff({ state: "rejected", rejected_reason: "not_needed" }),
    "superseded by an earlier closure": handoff({ state: "superseded", rejected_reason: "conversation_closed" }),
    "superseded by a staff reply": handoff({ state: "superseded", rejected_reason: "staff_replied" }),
    "carried for more than 14 days": handoff({ state: "superseded", rejected_reason: "newer_inbound", created_at: ago(15 * DAY) }),
    "a STOP acknowledgement": handoff({ state: "superseded", rejected_reason: "newer_inbound", tool_calls: { opt_out_acknowledgement: true } }),
  };
  for (const [name, latest] of Object.entries(settled)) {
    await t.step(name, async () => {
      const { calls } = await run({ latest });
      assertEquals(closes(calls).length, 1);
    });
  }
});

Deno.test("a pending STOP acknowledgement is not a request for a person", async () => {
  const ack = handoff({ tool_calls: { opt_out_acknowledgement: "true" } });
  const { calls } = await run({ pendingHandoffs: [ack], latest: ack });
  assertEquals(closes(calls).length, 1);
});

Deno.test("an ordinary pending draft does not hold the thread open", async () => {
  // Closing supersedes it as conversation_closed, exactly as Mark complete does.
  const { calls } = await run({
    latest: { id: "d-routine", created_at: ago(60_000), state: "pending", handoff_required: false },
  });
  assertEquals(closes(calls).length, 1);
});

Deno.test("a failed handoff lookup fails closed: the thread stays open and the send still succeeds", async (t) => {
  for (const [name, scenario] of Object.entries({
    "draft lookup": { draftLookupFails: true },
    "staff reply lookup": {
      staffReplyLookupFails: true,
      latest: handoff({ state: "superseded", rejected_reason: "newer_inbound" }),
    },
  } satisfies Record<string, Scenario>)) {
    await t.step(name, async () => {
      const { status, json, calls } = await run(scenario);
      assertEquals(status, 200);
      assertEquals(json.ok, true);
      assertEquals(closes(calls).length, 0);
    });
  }
});

Deno.test("a failed close does not fail the send: the confirmation has already gone", async () => {
  const { status, json, calls } = await run({ closeFails: true });
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assertEquals(json.meta_message_id, "wamid.confirm");
  assertEquals(closes(calls).length, 1);
});

Deno.test("an already-closed conversation is left as staff closed it", async () => {
  const { status, json } = await run({ alreadyClosed: true });
  assertEquals(status, 200);
  assertEquals(json.ok, true);
});

Deno.test("nothing is closed when Meta did not accept the confirmation", async (t) => {
  await t.step("Meta refused it", async () => {
    const { status, calls } = await run({ metaFails: true });
    assertEquals(status, 502);
    assertEquals(closes(calls).length, 0);
    assertEquals(draftReads(calls).length, 0);
  });
  await t.step("Meta named no message", async () => {
    const { calls } = await run({ metaNoMessage: true });
    assertEquals(closes(calls).length, 0);
    assertEquals(draftReads(calls).length, 0);
  });
});

Deno.test("other templates leave the conversation alone", async () => {
  const { status, calls } = await run({
    body: { mode: "template", to: "+447700900123", template_name: "appointment_reminder_v1", params: ["Sam", "Bella", "Mon 20 Oct"] },
  });
  assertEquals(status, 200);
  assertEquals(closes(calls).length, 0);
  assertEquals(draftReads(calls).length, 0);
});
