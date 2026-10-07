// The manage-booking menu: only a genuine timeout is a dead end that raises a
// staff to-do. A second tap on a used menu, a tap on an older menu, or a menu
// id that isn't this customer's must not tell them the team will step in or
// put a task on the staff list.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "test-key",
  ANTHROPIC_API_KEY: "test-model", AGENT_CALLBACK_SECRET: "test-secret",
  SEND_INTERNAL_SECRET: "test-send", WHATSAPP_MANAGE_BOOKING_ENABLED: "true",
  AI_ASSISTANT_ENABLED: "true", AI_KNOWN_CUSTOMER_REVIEW_DRAFTS: "false",
})) Deno.env.set(key, value);
const { handleAgentRequest } = await import("../handler.ts?manage-dead-ends");

const HUMAN = "human-manage";
const NONCE = "00000000-0000-4000-8000-0000000000aa";

type Session = { id: string; human_id: string; action: string; status: string; expires_at: string } | null;

async function tapMenu(session: Session) {
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const conversation = { id: "conv-manage", state: "ai_handling", human_id: HUMAN, phone_e164: "+447700900222", auto_send_enabled: false, autonomous_booking_enabled: false, agent_state_rev: 0, agent_state: {}, lead_status: "records_created", lead_payload: null };
  const message = { id: "synthetic-tap", from: "447700900222", type: "interactive", timestamp: String(Math.floor(Date.now() / 1000)), interactive: { type: "list_reply", list_reply: { id: `manage:${NONCE}:visit-1`, title: "Synthetic visit" } } };
  const payload = { entry: [{ changes: [{ value: { messages: [message] } }] }] };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, path: url.pathname, body });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.pathname === "/rest/v1/whatsapp_events") return method === "PATCH" ? new Response(null, { status: 204 }) : reply({ id: "event-manage", processing_status: "pending", signature_valid: true, payload });
    if (url.pathname === "/rest/v1/humans") return url.searchParams.get("select")?.startsWith("name") ? reply({ name: "Synthetic", surname: "Person" }) : reply([{ id: HUMAN, phone: "07700900222" }]);
    if (url.pathname === "/rest/v1/whatsapp_conversations") return reply(conversation);
    if (url.pathname === "/rest/v1/whatsapp_messages") return method === "POST" ? reply({ id: "message-manage" }, 201) : reply([]);
    if (url.pathname === "/rest/v1/whatsapp_manage_sessions") return reply(session);
    if (url.pathname === "/rest/v1/salon_todos") return method === "POST" ? reply(null, 201) : (url.searchParams.get("select") === "sort_order" ? reply({ sort_order: 3 }) : reply([]));
    if (url.pathname.endsWith("/functions/v1/whatsapp-send")) return reply({ ok: true });
    return reply([]);
  };
  try {
    const response = await handleAgentRequest(new Request("http://agent.test", { method: "POST", headers: { "x-agent-secret": "test-secret", "content-type": "application/json" }, body: JSON.stringify({ event_id: "event-manage" }) }));
    assertEquals(response.status, 200);
  } finally {
    globalThis.fetch = oldFetch;
  }
  const sent = calls.filter((c) => c.path.endsWith("/functions/v1/whatsapp-send")).map((c) => String(c.body.text ?? ""));
  const todoInserts = calls.filter((c) => c.path === "/rest/v1/salon_todos" && c.method === "POST");
  return { sent, todoInserts };
}

const future = () => new Date(Date.now() + 3600_000).toISOString();
const past = () => new Date(Date.now() - 3600_000).toISOString();

Deno.test("a genuinely timed-out menu hands over to the team and raises one to-do", async () => {
  const { sent, todoInserts } = await tapMenu({ id: NONCE, human_id: HUMAN, action: "cancel", status: "pending_selection", expires_at: past() });
  assertEquals(sent.length, 1);
  assertStringIncludes(sent[0], "passed it to the team");
  assertEquals(todoInserts.length, 1);
  assertEquals(todoInserts[0].body.human_id, HUMAN);
  assertEquals(todoInserts[0].body.kind, "general");
});

Deno.test("a second tap on a menu already used gets no hand-off and no to-do", async () => {
  const { sent, todoInserts } = await tapMenu({ id: NONCE, human_id: HUMAN, action: "cancel", status: "consumed", expires_at: future() });
  assertEquals(sent.length, 1);
  assertStringIncludes(sent[0], "already picked");
  assert(!sent[0].includes("team"));
  assertEquals(todoInserts.length, 0);
});

Deno.test("a tap on an older, superseded menu points to the newer one without a to-do", async () => {
  const { sent, todoInserts } = await tapMenu({ id: NONCE, human_id: HUMAN, action: "reschedule", status: "superseded", expires_at: future() });
  assertStringIncludes(sent[0], "latest one");
  assertEquals(todoInserts.length, 0);
});

Deno.test("a menu id that isn't this customer's raises no to-do", async () => {
  for (const session of [null, { id: NONCE, human_id: "someone-else", action: "cancel", status: "pending_selection", expires_at: future() }]) {
    const { sent, todoInserts } = await tapMenu(session);
    assertStringIncludes(sent[0], 'send "cancel" or "reschedule" again');
    assertEquals(todoInserts.length, 0);
  }
});
