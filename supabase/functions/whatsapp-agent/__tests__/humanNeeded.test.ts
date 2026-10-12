// A known customer who needs a person, not a script: standing at a closed
// salon, or chasing a message nobody answered. Before this branch the first
// got the tap-to-book prompt (the word "appointment") and the second got the
// automated 24-hour cutoff reply again (the word "reschedule"). Now neither
// path runs: nothing is sent to the customer, a no-link handoff draft is left
// while the AI handles the thread, and a staff to-do is raised in every state.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "test-key",
  ANTHROPIC_API_KEY: "test-model", AGENT_CALLBACK_SECRET: "test-secret",
  SEND_INTERNAL_SECRET: "test-send", WHATSAPP_MANAGE_BOOKING_ENABLED: "true",
  WHATSAPP_BOOK_ENTRY_ENABLED: "true",
  AI_ASSISTANT_ENABLED: "true", AI_KNOWN_CUSTOMER_REVIEW_DRAFTS: "false",
})) Deno.env.set(key, value);
const { handleAgentRequest } = await import("../handler.ts?human-needed");

const HUMAN = "human-needed";

async function send(text: string, state = "ai_handling") {
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const conversation = { id: "conv-needed", state, human_id: HUMAN, phone_e164: "+447700900333", auto_send_enabled: false, autonomous_booking_enabled: false, agent_state_rev: 0, agent_state: {}, lead_status: "records_created", lead_payload: null };
  const message = { id: "synthetic-text", from: "447700900333", type: "text", text: { body: text }, timestamp: String(Math.floor(Date.now() / 1000)) };
  const payload = { entry: [{ changes: [{ value: { messages: [message] } }] }] };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, path: url.pathname, body });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.pathname === "/rest/v1/whatsapp_events") return method === "PATCH" ? new Response(null, { status: 204 }) : reply({ id: "event-needed", processing_status: "pending", signature_valid: true, payload });
    if (url.pathname === "/rest/v1/humans") return url.searchParams.get("select")?.startsWith("name") ? reply({ name: "Synthetic", surname: "Person" }) : reply([{ id: HUMAN, phone: "07700900333" }]);
    if (url.pathname === "/rest/v1/whatsapp_conversations") return reply(conversation);
    if (url.pathname === "/rest/v1/whatsapp_messages") return method === "POST" ? reply({ id: "message-needed" }, 201) : reply([]);
    if (url.pathname === "/rest/v1/whatsapp_drafts") return reply({ id: "draft-needed" }, 201);
    // An upcoming visit, so the manage-booking path WOULD have something to act on.
    if (url.pathname === "/rest/v1/bookings") return reply([]);
    if (url.pathname === "/rest/v1/salon_todos") return method === "POST" ? reply(null, 201) : (url.searchParams.get("select") === "sort_order" ? reply({ sort_order: 3 }) : reply([]));
    if (url.pathname.endsWith("/functions/v1/whatsapp-send")) return reply({ ok: true, meta_message_id: "wamid.synthetic" });
    return reply([]);
  };
  try {
    const response = await handleAgentRequest(new Request("http://agent.test", { method: "POST", headers: { "x-agent-secret": "test-secret", "content-type": "application/json" }, body: JSON.stringify({ event_id: "event-needed" }) }));
    assertEquals(response.status, 200);
  } finally {
    globalThis.fetch = oldFetch;
  }
  const sends = calls.filter((c) => c.path.endsWith("/functions/v1/whatsapp-send"));
  const drafts = calls.filter((c) => c.path === "/rest/v1/whatsapp_drafts" && c.method === "POST").map((c) => c.body);
  const todos = calls.filter((c) => c.path === "/rest/v1/salon_todos" && c.method === "POST").map((c) => c.body);
  return { sends, drafts, todos };
}

Deno.test("at a closed salon: nothing sent, an apology draft for staff, one to-do", async () => {
  const { sends, drafts, todos } = await send("I had a 1pm appointment today, I'm at the salon and it's closed?");
  assertEquals(sends.length, 0, "no tap-to-book prompt and no script");
  assertEquals(drafts.length, 1);
  assertEquals(drafts[0].intent, "escalate");
  assertEquals(drafts[0].handoff_required, true);
  assertEquals(drafts[0].auto_send_eligible, false);
  assertStringIncludes(String(drafts[0].proposed_text), "so sorry");
  assert(!String(drafts[0].proposed_text).includes("http"), "the draft carries no link");
  assertEquals(todos.length, 1);
  assertEquals(todos[0].human_id, HUMAN);
  assertStringIncludes(String(todos[0].text), "found the salon closed");
  assertStringIncludes(String(todos[0].text), "still waiting");
});

Deno.test("chasing a reschedule: the cutoff script is NOT repeated, a person is asked for", async () => {
  const { sends, drafts, todos } = await send("I already sent a message last week asking to reschedule");
  assertEquals(sends.length, 0);
  assertEquals(drafts.length, 1);
  assertEquals(drafts[0].intent, "escalate");
  assertEquals(todos.length, 1);
  assertStringIncludes(String(todos[0].text), "chasing a reply");
});

Deno.test("in Human only mode: no automatic draft is written, but the to-do still is", async () => {
  const { sends, drafts, todos } = await send("We've just turned up for his groom and the shop is shut", "human_takeover");
  assertEquals(sends.length, 0);
  assertEquals(drafts.length, 0);
  assertEquals(todos.length, 1);
});

Deno.test("an ordinary new-booking message still takes the booking-entry fast path", async () => {
  const { sends, drafts, todos } = await send("Can I book Max in for a groom next week please?");
  assertEquals(sends.length, 1, "the tap-to-book prompt is unchanged for a real booking request");
  assertEquals(sends[0].body.mode, "book_entry");
  assertEquals(drafts.length, 0);
  assertEquals(todos.length, 0);
});
