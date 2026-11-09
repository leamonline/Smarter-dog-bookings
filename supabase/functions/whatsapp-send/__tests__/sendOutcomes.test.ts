// Stage 1, PR A: what whatsapp-send tells its caller when a send is uncertain,
// when the message went but could not be recorded, and when the request's own
// pieces (channel, number, customer, conversation) disagree.
//
// Write-path rule (AGENTS.md): these assert the rows that end up in the tables
// and how many times the provider was called, not the arguments handed to a
// client. Every case has its own fixture, so one failure cannot mask another.
// Whenever a case promises "not sent" it also asserts ZERO provider calls, and
// whenever the message went it asserts exactly ONE: nothing here may retry.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  SUPABASE_ANON_KEY: "test-anon",
  META_ACCESS_TOKEN: "test-meta",
  META_PHONE_NUMBER_ID: "123456",
  SEND_INTERNAL_SECRET: "test-send",
})) Deno.env.set(key, value);
const { handleSendRequest } = await import("../handler.ts?send-outcomes");

// A second copy of the handler with Meta's credentials missing (they are read
// once, when the module loads).
Deno.env.set("META_ACCESS_TOKEN", "");
const { handleSendRequest: handleSendNoCreds } = await import("../handler.ts?send-outcomes-no-creds");
Deno.env.set("META_ACCESS_TOKEN", "test-meta");

type Row = Record<string, unknown>;
type MetaBehaviour = "ok" | "reject" | "server_error" | "network" | "non_json" | "no_id";

interface Scenario {
  body: Record<string, unknown>;
  /** true: a signed-in member of staff. false: the internal secret (the agent). */
  staff?: boolean;
  meta?: MetaBehaviour;
  conversations?: Row[];
  humans?: Row[];
  drafts?: Row[];
  /** The whatsapp_messages insert fails. */
  messageInsertFails?: boolean;
  /** Updates to whatsapp_conversations fail. */
  conversationUpdateFails?: boolean;
  /** Creating a conversation fails. */
  conversationCreateFails?: boolean;
  /** Reads of whatsapp_drafts fail once the message has gone. */
  supersedeFails?: boolean;
  handler?: typeof handleSendRequest;
}

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const WA_CONV = (over: Row = {}): Row => ({
  id: "conv-1",
  channel: "whatsapp",
  phone_e164: "+447700900123",
  human_id: "h-1",
  last_inbound_at: ago(1000),
  whatsapp_opted_out_at: null,
  ...over,
});
const HUMAN = (over: Row = {}): Row => ({
  id: "h-1",
  phone: "07700 900123",
  whatsapp_opted_out: false,
  whatsapp_opted_out_reason: null,
  ...over,
});
const DRAFT = (over: Row = {}): Row => ({
  id: "d-1",
  conversation_id: "conv-1",
  state: "pending",
  created_at: ago(2 * HOUR),
  proposed_text: "See you at 9",
  tool_calls: null,
  decided_by: null,
  decided_at: null,
  edited_text: null,
  ...over,
});

/** Filters the way PostgREST would for the operators the handler uses; a `match` (phone pattern) finds nothing. */
function filtered(rows: Row[], params: URLSearchParams): Row[] {
  return rows.filter((row) => {
    for (const [key, raw] of params) {
      if (["select", "order", "limit", "on_conflict"].includes(key)) continue;
      const dot = raw.indexOf(".");
      const op = raw.slice(0, dot);
      const value = raw.slice(dot + 1);
      if (op === "match") return false;
      if (op === "eq" && String(row[key]) !== value) return false;
      if (op === "in") {
        const list = value.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
        if (!list.includes(String(row[key]))) return false;
      }
      if (op === "lt" && !(String(row[key]) < value)) return false;
    }
    return true;
  });
}

async function run(scenario: Scenario) {
  const {
    body, staff = true, meta = "ok", conversations = [WA_CONV()], humans = [HUMAN()], drafts = [],
    messageInsertFails = false, conversationUpdateFails = false, conversationCreateFails = false,
    supersedeFails = false, handler = handleSendRequest,
  } = scenario;
  const conversationsTable = conversations.map((r) => ({ ...r }));
  const draftsTable = drafts.map((r) => ({ ...r }));
  const messagesTable: Row[] = [];
  const metaCalls: unknown[] = [];

  const oldFetch = globalThis.fetch;
  const { error: oldError, warn: oldWarn, log: oldLog } = console;
  console.error = () => {};
  console.warn = () => {};
  console.log = () => {};
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const parsed = init?.body ? JSON.parse(String(init.body)) : null;
    const single = (new Headers(init?.headers).get("accept") ?? "").includes("vnd.pgrst.object");
    const reply = (value: unknown, status = 200) =>
      Response.json(single && Array.isArray(value) ? value[0] ?? null : value, { status });
    const p = url.searchParams;

    if (url.hostname === "graph.facebook.com") {
      metaCalls.push(parsed);
      switch (meta) {
        case "ok": return Response.json({ messaging_product: "whatsapp", contacts: [], messages: [{ id: "wamid.1" }] });
        case "reject": return Response.json({ error: { message: "bad", code: 131030, type: "OAuthException" } }, { status: 400 });
        case "server_error": return Response.json({ error: { message: "oops", code: 2 } }, { status: 500 });
        case "network": throw new TypeError("connection reset");
        case "non_json": return new Response("<html>gateway</html>", { status: 200 });
        case "no_id": return Response.json({ messaging_product: "whatsapp", contacts: [], messages: [] });
      }
    }
    if (url.pathname === "/auth/v1/user") return reply({ id: "staff-user-1", aud: "authenticated", role: "authenticated" });
    if (url.pathname === "/rest/v1/rpc/is_staff") return reply(true);
    if (url.pathname === "/rest/v1/humans") return reply(filtered(humans, p));
    if (url.pathname === "/rest/v1/whatsapp_booking_actions") return reply([]);
    if (url.pathname === "/rest/v1/whatsapp_drafts") {
      if (supersedeFails && metaCalls.length > 0 && method === "GET" && !(p.get("select") ?? "").includes("whatsapp_conversations")) {
        return reply({ message: "connection reset" }, 500);
      }
      const hit = filtered(draftsTable, p);
      if (method === "PATCH") {
        for (const row of hit) Object.assign(row, parsed);
        if (single && hit.length === 0) return reply({ message: "no rows" }, 406);
        return reply(hit.map((row) => ({ id: row.id })));
      }
      if ((p.get("select") ?? "").includes("whatsapp_conversations")) {
        return reply(hit.map((row) => ({
          ...row,
          whatsapp_conversations: conversationsTable.find((c) => c.id === row.conversation_id) ?? null,
        })));
      }
      return reply(hit);
    }
    if (url.pathname === "/rest/v1/whatsapp_conversations") {
      if (method === "POST") {
        if (conversationCreateFails) return reply({ message: "insert failed" }, 500);
        const row = parsed as Row;
        const exists = conversationsTable.some((c) => c.phone_e164 === row.phone_e164 && c.channel === row.channel);
        if (!exists) conversationsTable.push({ id: `conv-new-${conversationsTable.length}`, last_inbound_at: null, ...row });
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
        // The foreign key: a message needs a conversation that exists.
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
    const response = await handler(new Request("http://send.test", { method: "POST", headers, body: JSON.stringify(body) }));
    return {
      status: response.status,
      json: await response.json() as Record<string, unknown>,
      metaCalls,
      messagesTable,
      conversationsTable,
      draftsTable,
    };
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldError;
    console.warn = oldWarn;
    console.log = oldLog;
  }
}

const MANUAL = { mode: "manual", conversation_id: "conv-1", text: "See you at 9" };
const TEMPLATE = {
  mode: "template", to: "07700 900123", template_name: "appointment_reminder_v1", params: ["Sam"], human_id: "h-1", conversation_id: "conv-1",
};
const UNKNOWN_TEXT = "We couldn't confirm whether this message was sent. Check the thread or the customer's phone before sending again.";

// ── Provider outcomes ───────────────────────────────────────────────

Deno.test("Meta rejects (4xx): not sent, safe to try again after a fix", async () => {
  const r = await run({ body: MANUAL, meta: "reject" });
  assertEquals(r.status, 502);
  assertEquals(r.json.ok, false);
  assertEquals(r.json.outcome, "not_sent");
  assertEquals(r.json.code, "provider_rejected");
  assertEquals(r.metaCalls.length, 1, "exactly one attempt, no internal retry");
  assertEquals(r.messagesTable.length, 0);
});

Deno.test("Meta 5xx: the outcome is unknown, and says so in a full sentence", async () => {
  const r = await run({ body: MANUAL, meta: "server_error" });
  assertEquals(r.status, 502);
  assertEquals(r.json.ok, false);
  assertEquals(r.json.outcome, "unknown");
  assertEquals(r.json.code, "delivery_outcome_unknown");
  assertEquals(r.json.error, UNKNOWN_TEXT);
  assertEquals(r.metaCalls.length, 1);
  assertEquals(r.messagesTable.length, 0, "nothing is recorded as sent");
});

Deno.test("a dropped connection after the request went is unknown, not a clean failure", async () => {
  const r = await run({ body: MANUAL, meta: "network" });
  assertEquals(r.json.outcome, "unknown");
  assertEquals(r.json.code, "delivery_outcome_unknown");
  assertEquals(r.metaCalls.length, 1);
  assertEquals(r.messagesTable.length, 0);
});

Deno.test("a 200 with an unreadable body is unknown", async () => {
  const r = await run({ body: MANUAL, meta: "non_json" });
  assertEquals(r.json.outcome, "unknown");
  assertEquals(r.metaCalls.length, 1);
});

Deno.test("a 200 with no message id is unknown, and is not recorded as sent", async () => {
  const r = await run({ body: MANUAL, meta: "no_id" });
  assertEquals(r.json.outcome, "unknown");
  assertEquals(r.messagesTable.length, 0);
});

Deno.test("missing Meta credentials: definitely not sent, and not called a network problem", async () => {
  const r = await run({ body: MANUAL, handler: handleSendNoCreds });
  assertEquals(r.status, 500);
  assertEquals(r.json.outcome, "not_sent");
  assertEquals(r.json.code, "provider_not_configured");
  assertEquals(r.metaCalls.length, 0, "no request leaves the server");
});

Deno.test("a template whose outcome is unknown is not recorded and completes nothing", async () => {
  const r = await run({ body: { ...TEMPLATE, template_name: "booking_confirmed_v1" }, meta: "server_error" });
  assertEquals(r.json.outcome, "unknown");
  assertEquals(r.messagesTable.length, 0);
  assertEquals(r.conversationsTable[0].closed_at, undefined, "the conversation is not closed on a message that may not have gone");
  assertEquals(r.metaCalls.length, 1);
});

// ── Draft claim after each outcome ──────────────────────────────────

Deno.test("draft: a definite rejection hands the draft back for another approval", async () => {
  const r = await run({ body: { mode: "draft", draft_id: "d-1" }, meta: "reject", drafts: [DRAFT()] });
  assertEquals(r.json.outcome, "not_sent");
  assertEquals(r.draftsTable[0].state, "pending");
  assertEquals(r.draftsTable[0].decided_at, null);
  assertEquals(r.metaCalls.length, 1);
});

Deno.test("draft: an unknown outcome leaves the draft claimed, so it cannot be approved twice", async () => {
  const r = await run({ body: { mode: "draft", draft_id: "d-1" }, meta: "network", drafts: [DRAFT()] });
  assertEquals(r.json.outcome, "unknown");
  assertEquals(r.draftsTable[0].state, "approved");
  assert(r.draftsTable[0].decided_at, "the claim stands");
  assertEquals(r.metaCalls.length, 1);
  // A second approval is refused without calling Meta again.
  const again = await run({ body: { mode: "draft", draft_id: "d-1" }, drafts: r.draftsTable });
  assertEquals(again.status, 409);
  assertEquals(again.metaCalls.length, 0);
});

// ── Sent, but not recorded ──────────────────────────────────────────

Deno.test("sent but the message row could not be saved: ok, recorded false, one send", async () => {
  const r = await run({ body: MANUAL, messageInsertFails: true });
  assertEquals(r.status, 200);
  assertEquals(r.json.ok, true);
  assertEquals(r.json.recorded, false);
  assertEquals((r.json.warnings as string[]).includes("message_not_recorded"), true);
  assertEquals(r.metaCalls.length, 1, "a recording failure never triggers a second send");
  assertEquals(r.messagesTable.length, 0);
});

Deno.test("sent and saved but the conversation timestamp could not move: its own warning", async () => {
  const r = await run({ body: MANUAL, conversationUpdateFails: true });
  assertEquals(r.json.ok, true);
  assertEquals(r.json.recorded, true);
  assertEquals(r.json.warnings, ["conversation_not_updated"]);
  assertEquals(r.messagesTable.length, 1);
});

Deno.test("a clean send reports recorded true and no warnings", async () => {
  const r = await run({ body: MANUAL });
  assertEquals(r.json.ok, true);
  assertEquals(r.json.recorded, true);
  assertEquals(r.json.warnings, []);
  assertEquals(r.messagesTable.length, 1);
  assertEquals(r.metaCalls.length, 1);
});

Deno.test("conversation creation fails: the template still went, and says it was not recorded", async () => {
  const r = await run({
    body: { mode: "template", to: "07700 900555", template_name: "appointment_reminder_v1", params: ["Sam"] },
    conversations: [],
    humans: [],
    conversationCreateFails: true,
  });
  assertEquals(r.status, 200);
  assertEquals(r.json.ok, true);
  assertEquals(r.json.recorded, false);
  const warnings = r.json.warnings as string[];
  assert(warnings.includes("conversation_unavailable"));
  assert(warnings.includes("message_not_recorded"));
  assertEquals(r.metaCalls.length, 1);
});

Deno.test("a draft that cannot be superseded after a staff reply: the send stands, with a warning", async () => {
  const r = await run({ body: MANUAL, drafts: [DRAFT({ id: "d-old" })], supersedeFails: true });
  assertEquals(r.json.ok, true);
  assert((r.json.warnings as string[]).includes("draft_supersede_failed"));
  assertEquals(r.metaCalls.length, 1);
});

Deno.test("free-text sends are marked so the inbox can tell them from templates", async () => {
  const r = await run({ body: MANUAL });
  const raw = r.messagesTable[0].raw as Record<string, unknown>;
  assertEquals(raw.sent_kind, "text");
  assertEquals(raw.sent_by, "staff");
  assertEquals((raw.messages as { id: string }[])[0].id, "wamid.1", "Meta's own keys stay where readers expect them");
  const tpl = await run({ body: TEMPLATE });
  assertEquals((tpl.messagesTable[0].raw as Record<string, unknown>).sent_kind, undefined, "a template is never marked as text");
});

// ── Identity: observed, never refused (PR A) ────────────────────────

const warningsOf = (r: { json: Record<string, unknown> }) => r.json.warnings as string[];

Deno.test("consistent channel, number, customer and conversation report nothing", async () => {
  const r = await run({ body: TEMPLATE });
  assertEquals(warningsOf(r), []);
});

Deno.test("wrong channel: a reply on an SMS thread still goes, and is flagged", async () => {
  const r = await run({ body: MANUAL, conversations: [WA_CONV({ channel: "sms" })] });
  assertEquals(r.json.ok, true);
  assertEquals(warningsOf(r), ["conversation_channel_mismatch"]);
  assertEquals(r.metaCalls.length, 1);
});

Deno.test("wrong number: a template whose number is not the conversation's is flagged", async () => {
  const r = await run({ body: { ...TEMPLATE, to: "07700 900999", human_id: null } });
  assertEquals(r.json.ok, true);
  assertEquals(warningsOf(r), ["conversation_phone_mismatch"]);
  assertEquals(r.metaCalls.length, 1);
});

Deno.test("conflicting human: the conversation belongs to a different customer", async () => {
  const r = await run({
    body: TEMPLATE,
    humans: [HUMAN(), HUMAN({ id: "h-2" })],
    conversations: [WA_CONV({ human_id: "h-2" })],
  });
  assertEquals(r.json.ok, true);
  assertEquals(warningsOf(r), ["conversation_human_conflict"]);
});

Deno.test("unknown conversation: sent, flagged, and honestly not recorded", async () => {
  const r = await run({ body: { ...TEMPLATE, conversation_id: "conv-ghost" } });
  assertEquals(r.json.ok, true);
  assert(warningsOf(r).includes("conversation_not_found"));
  assertEquals(r.json.recorded, false, "the message cannot be written to a conversation that does not exist");
  assertEquals(r.metaCalls.length, 1);
});

Deno.test("unknown human is flagged", async () => {
  const r = await run({ body: { ...TEMPLATE, human_id: "h-ghost", conversation_id: undefined }, humans: [], conversations: [] });
  assertEquals(r.json.ok, true);
  assertEquals(warningsOf(r), ["human_not_found"]);
});

Deno.test("a human with no usable number is flagged", async () => {
  const r = await run({ body: { ...TEMPLATE, conversation_id: undefined }, humans: [HUMAN({ phone: null })], conversations: [] });
  assertEquals(r.json.ok, true);
  assertEquals(warningsOf(r), ["human_phone_invalid"]);
});

Deno.test("a destination that differs from the customer's number is flagged", async () => {
  const r = await run({ body: { ...TEMPLATE, to: "07700 900999", conversation_id: undefined }, conversations: [] });
  assertEquals(r.json.ok, true);
  assertEquals(warningsOf(r), ["human_phone_mismatch"]);
});

Deno.test("manual send to a conversation that does not exist is still refused, with no send", async () => {
  const r = await run({ body: { ...MANUAL, conversation_id: "conv-ghost" } });
  assertEquals(r.status, 404);
  assertEquals(r.metaCalls.length, 0);
});

Deno.test("internal-only modes are observed too, and still send", async () => {
  const r = await run({
    body: { mode: "book_entry", to: "07700 900999", conversation_id: "conv-1", human_id: "h-1", ai_initiated: false },
    staff: false,
  });
  assertEquals(r.json.ok, true);
  assert(warningsOf(r).includes("conversation_phone_mismatch"));
  assertEquals(r.metaCalls.length, 1);
});
