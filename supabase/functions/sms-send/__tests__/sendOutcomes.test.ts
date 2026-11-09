// Stage 1, PR A: what sms-send tells its caller when Twilio's answer is
// uncertain, when the text went but could not be recorded, and when the
// request's own pieces (channel, number, customer, conversation) disagree.
//
// Write-path rule (AGENTS.md): these assert the rows that end up in the tables
// and how many times Twilio was called, not the arguments handed to a client.
// Every case has its own fixture. "Not sent" always asserts ZERO Twilio calls
// and a send always asserts exactly ONE: nothing here may retry. (Twilio's
// credentials and sender are read when _shared/twilio.ts loads, so the
// "sender missing" case lives in its own file.)
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  SUPABASE_ANON_KEY: "test-anon",
  SEND_INTERNAL_SECRET: "test-send",
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: "token",
  TWILIO_MESSAGING_SERVICE_SID: "MGtest",
})) Deno.env.set(key, value);
const { handleSendRequest } = await import("../handler.ts");

type Row = Record<string, unknown>;
type TwilioBehaviour = "ok" | "reject" | "stop" | "rate_limited" | "server_error" | "network" | "non_json" | "no_sid";

interface Scenario {
  body: Record<string, unknown>;
  staff?: boolean;
  twilio?: TwilioBehaviour;
  conversations?: Row[];
  humans?: Row[];
  messageInsertFails?: boolean;
  conversationUpdateFails?: boolean;
  conversationCreateFails?: boolean;
}

const SMS_CONV = (over: Row = {}): Row => ({
  id: "conv-sms-1",
  channel: "sms",
  phone_e164: "+447700900123",
  human_id: "h-1",
  ...over,
});
const HUMAN = (over: Row = {}): Row => ({ id: "h-1", phone: "07700 900123", ...over });

function filtered(rows: Row[], params: URLSearchParams): Row[] {
  return rows.filter((row) => {
    for (const [key, raw] of params) {
      if (["select", "order", "limit", "on_conflict"].includes(key)) continue;
      const dot = raw.indexOf(".");
      const op = raw.slice(0, dot);
      const value = raw.slice(dot + 1);
      if (op === "match") return false;
      if (op === "eq" && String(row[key]) !== value) return false;
    }
    return true;
  });
}

async function run(scenario: Scenario) {
  const {
    body, staff = true, twilio = "ok", conversations = [SMS_CONV()], humans = [HUMAN()],
    messageInsertFails = false, conversationUpdateFails = false, conversationCreateFails = false,
  } = scenario;
  const conversationsTable = conversations.map((r) => ({ ...r }));
  const messagesTable: Row[] = [];
  const twilioCalls: URLSearchParams[] = [];

  const oldFetch = globalThis.fetch;
  const { error: oldError, warn: oldWarn } = console;
  console.error = () => {};
  console.warn = () => {};
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const parsed = init?.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : null;
    const single = (new Headers(init?.headers).get("accept") ?? "").includes("vnd.pgrst.object");
    const reply = (value: unknown, status = 200) =>
      Response.json(single && Array.isArray(value) ? value[0] ?? null : value, { status });
    const p = url.searchParams;

    if (url.hostname === "api.twilio.com") {
      twilioCalls.push(new URLSearchParams(String(init?.body)));
      switch (twilio) {
        case "ok": return Response.json({ sid: "SM123" }, { status: 201 });
        case "reject": return Response.json({ code: 21211, message: "Invalid 'To' Phone Number" }, { status: 400 });
        case "stop": return Response.json({ code: 21610, message: "unsubscribed" }, { status: 400 });
        case "rate_limited": return Response.json({ code: 20429, message: "Too many requests" }, { status: 429 });
        case "server_error": return Response.json({ code: 20500, message: "Internal" }, { status: 500 });
        case "network": throw new TypeError("connection reset");
        case "non_json": return new Response("<html>gateway</html>", { status: 200 });
        case "no_sid": return Response.json({}, { status: 201 });
      }
    }
    if (url.pathname === "/auth/v1/user") return reply({ id: "staff-user-1", aud: "authenticated", role: "authenticated" });
    if (url.pathname === "/rest/v1/rpc/is_staff") return reply(true);
    if (url.pathname === "/rest/v1/humans") return reply(filtered(humans, p));
    if (url.pathname === "/rest/v1/whatsapp_conversations") {
      if (method === "POST") {
        if (conversationCreateFails) return reply({ message: "insert failed" }, 500);
        const row = parsed as Row;
        const exists = conversationsTable.some((c) => c.phone_e164 === row.phone_e164 && c.channel === row.channel);
        if (!exists) conversationsTable.push({ id: `conv-new-${conversationsTable.length}`, ...row });
        return reply([], 201);
      }
      if (method === "PATCH") {
        if (conversationUpdateFails) return reply({ message: "update failed" }, 500);
        const hit = filtered(conversationsTable, p);
        for (const row of hit) Object.assign(row, parsed);
        return reply(hit.map((row) => ({ id: row.id })));
      }
      return reply(filtered(conversationsTable, p));
    }
    if (url.pathname === "/rest/v1/whatsapp_messages") {
      if (method === "POST") {
        if (messageInsertFails) return reply({ message: "insert failed" }, 500);
        const row = parsed as Row;
        if (!conversationsTable.some((c) => c.id === row.conversation_id)) return reply({ message: "fk violation", code: "23503" }, 409);
        messagesTable.push(row);
        return reply([{ id: "msg-1" }], 201);
      }
      return reply([]);
    }
    return reply([]);
  };
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (staff) headers.authorization = "Bearer staff-jwt";
    else headers["x-internal-secret"] = "test-send";
    const response = await handleSendRequest(new Request("http://send.test", { method: "POST", headers, body: JSON.stringify(body) }));
    return { status: response.status, json: await response.json() as Record<string, unknown>, twilioCalls, messagesTable, conversationsTable };
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldError;
    console.warn = oldWarn;
  }
}

const MANUAL = { mode: "manual", to: "07700 900123", text: "See you at 9", human_id: "h-1", conversation_id: "conv-sms-1" };
const TEMPLATE = { mode: "template", to: "07700 900123", text: "Reminder: 9am tomorrow", template_name: "appointment_reminder", human_id: "h-1" };
const UNKNOWN_TEXT = "We couldn't confirm whether this message was sent. Check the thread or the customer's phone before sending again.";

// ── Twilio outcomes ─────────────────────────────────────────────────

Deno.test("Twilio rejects (4xx): not sent, one attempt, nothing recorded", async () => {
  const r = await run({ body: MANUAL, twilio: "reject" });
  assertEquals(r.status, 502);
  assertEquals(r.json.ok, false);
  assertEquals(r.json.outcome, "not_sent");
  assertEquals(r.json.code, "provider_rejected");
  assertEquals(r.twilioCalls.length, 1);
  assertEquals(r.messagesTable.length, 0);
});

Deno.test("Twilio rate limit (429) is a rejection: the text was never created", async () => {
  const r = await run({ body: MANUAL, twilio: "rate_limited" });
  assertEquals(r.json.outcome, "not_sent");
  assertEquals(r.json.code, "provider_rejected");
});

Deno.test("a dropped connection is unknown, and is NOT reported as 'Twilio not configured'", async () => {
  const r = await run({ body: MANUAL, twilio: "network" });
  assertEquals(r.status, 502);
  assertEquals(r.json.ok, false);
  assertEquals(r.json.outcome, "unknown");
  assertEquals(r.json.code, "delivery_outcome_unknown");
  assertEquals(r.json.error, UNKNOWN_TEXT);
  assertEquals(r.twilioCalls.length, 1, "exactly one attempt, no internal retry");
  assertEquals(r.messagesTable.length, 0, "nothing is recorded as sent");
});

Deno.test("Twilio 5xx is unknown", async () => {
  const r = await run({ body: MANUAL, twilio: "server_error" });
  assertEquals(r.json.outcome, "unknown");
  assertEquals(r.twilioCalls.length, 1);
  assertEquals(r.messagesTable.length, 0);
});

Deno.test("a 200 with an unreadable body is unknown", async () => {
  const r = await run({ body: MANUAL, twilio: "non_json" });
  assertEquals(r.json.outcome, "unknown");
  assertEquals(r.messagesTable.length, 0);
});

Deno.test("a 201 with no message sid is unknown, not 'sent'", async () => {
  const r = await run({ body: MANUAL, twilio: "no_sid" });
  assertEquals(r.json.outcome, "unknown");
  assertEquals(r.messagesTable.length, 0);
});

Deno.test("a STOP (21610) keeps its own answer: opted out, 409, one attempt", async () => {
  const r = await run({ body: MANUAL, twilio: "stop" });
  assertEquals(r.status, 409);
  assertEquals(r.json.error, "recipient opted out");
  assertEquals(r.twilioCalls.length, 1);
});

// ── Sent, but not recorded ──────────────────────────────────────────

Deno.test("a clean send reports recorded true and no warnings", async () => {
  const r = await run({ body: MANUAL });
  assertEquals(r.status, 200);
  assertEquals(r.json.ok, true);
  assertEquals(r.json.recorded, true);
  assertEquals(r.json.warnings, []);
  assertEquals(r.json.twilio_sid, "SM123");
  assertEquals(r.messagesTable.length, 1);
  assertEquals(r.messagesTable[0].channel, "sms");
  assertEquals(r.twilioCalls.length, 1);
});

Deno.test("sent but the message row could not be saved: ok, recorded false, one send", async () => {
  const r = await run({ body: MANUAL, messageInsertFails: true });
  assertEquals(r.status, 200);
  assertEquals(r.json.ok, true);
  assertEquals(r.json.recorded, false);
  assert((r.json.warnings as string[]).includes("message_not_recorded"));
  assertEquals(r.twilioCalls.length, 1, "a recording failure never triggers a second text");
});

Deno.test("sent and saved but the conversation timestamp could not move: its own warning", async () => {
  const r = await run({ body: MANUAL, conversationUpdateFails: true });
  assertEquals(r.json.recorded, true);
  assertEquals(r.json.warnings, ["conversation_not_updated"]);
});

Deno.test("conversation creation fails: the text still went, and says it was not recorded", async () => {
  const r = await run({ body: { ...TEMPLATE, human_id: null }, conversations: [], humans: [], conversationCreateFails: true });
  assertEquals(r.status, 200);
  assertEquals(r.json.ok, true);
  assertEquals(r.json.recorded, false);
  const warnings = r.json.warnings as string[];
  assert(warnings.includes("conversation_unavailable"));
  assert(warnings.includes("message_not_recorded"));
  assertEquals(r.twilioCalls.length, 1);
});

Deno.test("with no conversation supplied, one is created and the text is recorded on it", async () => {
  const r = await run({ body: { ...TEMPLATE, human_id: null }, conversations: [], humans: [] });
  assertEquals(r.json.recorded, true);
  assertEquals(r.conversationsTable.length, 1);
  assertEquals(r.conversationsTable[0].channel, "sms");
  assertEquals(r.messagesTable.length, 1);
});

// ── Identity: observed, never refused (PR A) ────────────────────────

const warningsOf = (r: { json: Record<string, unknown> }) => r.json.warnings as string[];

Deno.test("consistent channel, number, customer and conversation report nothing", async () => {
  assertEquals(warningsOf(await run({ body: MANUAL })), []);
});

Deno.test("wrong channel: a text recorded on a WhatsApp conversation is flagged, and still goes", async () => {
  const r = await run({ body: MANUAL, conversations: [SMS_CONV({ channel: "whatsapp" })] });
  assertEquals(r.json.ok, true);
  assertEquals(warningsOf(r), ["conversation_channel_mismatch"]);
  assertEquals(r.twilioCalls.length, 1);
});

Deno.test("wrong number: the conversation belongs to a different phone", async () => {
  const r = await run({ body: { ...MANUAL, to: "07700 900999", human_id: null } });
  assertEquals(r.json.ok, true);
  assertEquals(warningsOf(r), ["conversation_phone_mismatch"]);
});

Deno.test("conflicting human: the conversation belongs to a different customer", async () => {
  const r = await run({ body: MANUAL, humans: [HUMAN(), HUMAN({ id: "h-2" })], conversations: [SMS_CONV({ human_id: "h-2" })] });
  assertEquals(r.json.ok, true);
  assertEquals(warningsOf(r), ["conversation_human_conflict"]);
});

Deno.test("unknown conversation: sent, flagged, and honestly not recorded", async () => {
  const r = await run({ body: { ...MANUAL, conversation_id: "conv-ghost" } });
  assertEquals(r.json.ok, true);
  assert(warningsOf(r).includes("conversation_not_found"));
  assertEquals(r.json.recorded, false);
  assertEquals(r.twilioCalls.length, 1);
});

Deno.test("unknown human is flagged", async () => {
  const r = await run({ body: { ...TEMPLATE, human_id: "h-ghost" }, humans: [], conversations: [] });
  assertEquals(r.json.ok, true);
  assertEquals(warningsOf(r), ["human_not_found"]);
});

Deno.test("a human with no usable number is flagged", async () => {
  const r = await run({ body: TEMPLATE, humans: [HUMAN({ phone: null })], conversations: [] });
  assertEquals(r.json.ok, true);
  assertEquals(warningsOf(r), ["human_phone_invalid"]);
});

Deno.test("a destination that differs from the customer's number is flagged", async () => {
  const r = await run({ body: { ...TEMPLATE, to: "07700 900999" }, conversations: [] });
  assertEquals(r.json.ok, true);
  assertEquals(warningsOf(r), ["human_phone_mismatch"]);
});

Deno.test("an invalid destination is still refused before any observation or send", async () => {
  const r = await run({ body: { ...TEMPLATE, to: "12" } });
  assertEquals(r.status, 400);
  assertEquals(r.twilioCalls.length, 0);
});
