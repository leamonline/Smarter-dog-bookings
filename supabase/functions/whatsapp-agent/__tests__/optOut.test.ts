// A customer who replies STOP (or "please stop messaging me") is asking us not
// to message them. The agent flags the customer so whatsapp-send refuses every
// later WhatsApp, switches auto-send off on the thread, sends nothing itself,
// and leaves staff one acknowledgement draft to decide on (#990).
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "test-key",
  ANTHROPIC_API_KEY: "test-model", AGENT_CALLBACK_SECRET: "test-secret",
  SEND_INTERNAL_SECRET: "test-send", WHATSAPP_MANAGE_BOOKING_ENABLED: "true",
  WHATSAPP_BOOK_ENTRY_ENABLED: "true",
  AI_ASSISTANT_ENABLED: "true", AI_KNOWN_CUSTOMER_REVIEW_DRAFTS: "false",
})) Deno.env.set(key, value);
const { handleAgentRequest } = await import("../handler.ts?opt-out");

const HUMAN = "human-opt-out";

interface Faults {
  /** The humans PATCH returns an error. */
  humanWriteFails?: boolean;
  /** The humans PATCH "succeeds" but changes no row (and the row is not opted out). */
  humanWriteMatchesNothing?: boolean;
  /** The customer had already opted out before this message. */
  alreadyOptedOut?: boolean;
  /** The conversation PATCH returns an error. */
  conversationWriteFails?: boolean;
}

async function send(text: string, state = "ai_handling", humanId: string | null = HUMAN, faults: Faults = {}) {
  const calls: { method: string; path: string; search: string; body: Record<string, unknown> }[] = [];
  // A stateful humans row: the STOP write is applied with PostgREST's eq
  // filters, so a test can assert what was STORED, not only what was sent.
  const humanRow: Record<string, unknown> = {
    id: humanId,
    phone: "07700900444",
    whatsapp_opted_out: faults.alreadyOptedOut === true,
    whatsapp_opted_out_at: null,
    whatsapp_opted_out_reason: null,
  };
  let eventPatch: Record<string, unknown> = {};
  const conversation = { id: "conv-opt-out", state, human_id: humanId, phone_e164: "+447700900444", auto_send_enabled: true, autonomous_booking_enabled: false, agent_state_rev: 0, agent_state: {}, lead_status: "records_created", lead_payload: null };
  const message = { id: "synthetic-stop", from: "447700900444", type: "text", text: { body: text }, timestamp: String(Math.floor(Date.now() / 1000)) };
  const payload = { entry: [{ changes: [{ value: { messages: [message] } }] }] };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, path: url.pathname, search: url.search, body });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.pathname === "/rest/v1/whatsapp_events") {
      if (method === "PATCH") {
        eventPatch = { ...eventPatch, ...body };
        return new Response(null, { status: 204 });
      }
      return reply({ id: "event-opt-out", processing_status: "pending", signature_valid: true, payload });
    }
    if (url.pathname === "/rest/v1/humans") {
      if (method === "PATCH") {
        if (faults.humanWriteFails) return reply({ message: "connection reset" }, 500);
        const idFilter = url.searchParams.get("id");
        const optedFilter = url.searchParams.get("whatsapp_opted_out");
        const matches = !faults.humanWriteMatchesNothing
          && idFilter === `eq.${humanRow.id}`
          && (optedFilter === null || optedFilter === `eq.${humanRow.whatsapp_opted_out}`);
        if (matches) Object.assign(humanRow, body);
        return reply(matches ? [{ id: humanRow.id }] : []);
      }
      const select = url.searchParams.get("select") ?? "";
      if (select.startsWith("name")) return reply({ name: "Synthetic", surname: "Person" });
      if (select === "whatsapp_opted_out") return reply([{ whatsapp_opted_out: humanRow.whatsapp_opted_out }]);
      return reply(humanId ? [{ id: humanId, phone: "07700900444" }] : []);
    }
    if (url.pathname === "/rest/v1/whatsapp_conversations") {
      if (method === "PATCH") {
        return faults.conversationWriteFails ? reply({ message: "connection reset" }, 500) : new Response(null, { status: 204 });
      }
      return reply(conversation);
    }
    if (url.pathname === "/rest/v1/whatsapp_messages") return method === "POST" ? reply({ id: "message-opt-out" }, 201) : reply([]);
    if (url.pathname === "/rest/v1/whatsapp_drafts") return reply({ id: "draft-opt-out" }, 201);
    if (url.pathname === "/rest/v1/bookings") return reply([]);
    if (url.pathname === "/rest/v1/salon_todos") return method === "POST" ? reply(null, 201) : (url.searchParams.get("select") === "sort_order" ? reply({ sort_order: 3 }) : reply([]));
    if (url.pathname.endsWith("/functions/v1/whatsapp-send")) return reply({ ok: true, meta_message_id: "wamid.synthetic" });
    return reply([]);
  };
  try {
    const response = await handleAgentRequest(new Request("http://agent.test", { method: "POST", headers: { "x-agent-secret": "test-secret", "content-type": "application/json" }, body: JSON.stringify({ event_id: "event-opt-out" }) }));
    assertEquals(response.status, 200);
  } finally {
    globalThis.fetch = oldFetch;
  }
  const sends = calls.filter((c) => c.path.endsWith("/functions/v1/whatsapp-send"));
  const drafts = calls.filter((c) => c.path === "/rest/v1/whatsapp_drafts" && c.method === "POST").map((c) => c.body);
  const humanPatches = calls.filter((c) => c.path === "/rest/v1/humans" && c.method === "PATCH");
  const conversationPatches = calls.filter((c) => c.path === "/rest/v1/whatsapp_conversations" && c.method === "PATCH").map((c) => c.body);
  return { sends, drafts, humanPatches, conversationPatches, humanRow, eventPatch };
}

Deno.test("STOP flags the customer, switches auto-send off, sends nothing and leaves one draft", async () => {
  const { sends, drafts, humanPatches, conversationPatches, humanRow, eventPatch } = await send("STOP");
  // What was STORED, not just what was sent (#1016 review).
  assertEquals(humanRow.whatsapp_opted_out, true);
  assertEquals(humanRow.whatsapp_opted_out_reason, "asked_on_whatsapp");
  assertEquals(eventPatch.processing_status, "processed");
  assertEquals(sends.length, 0, "nothing is sent to someone who asked us to stop");
  assertEquals(humanPatches.length, 1);
  assertEquals(humanPatches[0].body.whatsapp_opted_out, true);
  assertEquals(humanPatches[0].body.whatsapp_opted_out_reason, "asked_on_whatsapp");
  assert(typeof humanPatches[0].body.whatsapp_opted_out_at === "string");
  assertStringIncludes(decodeURIComponent(humanPatches[0].search), `id=eq.${HUMAN}`);
  assert(conversationPatches.some((p) => p.auto_send_enabled === false), "auto-send is switched off on the thread");
  assertEquals(drafts.length, 1);
  assertEquals(drafts[0].intent, "escalate");
  assertEquals(drafts[0].handoff_required, true);
  assertEquals(drafts[0].auto_send_eligible, false);
  assertStringIncludes(String(drafts[0].proposed_text), "stopped WhatsApp messages");
  // The marker whatsapp-send needs before it lets staff send this one draft.
  assertEquals((drafts[0].tool_calls as Record<string, unknown>).opt_out_acknowledgement, true);
});

Deno.test("a sentence form is recognised too", async () => {
  const { sends, drafts, humanPatches } = await send("Please stop messaging me, I don't have a dog any more");
  assertEquals(sends.length, 0);
  assertEquals(humanPatches.length, 1);
  assertEquals(drafts.length, 1);
});

Deno.test("in Human only mode the flag is still set but no automatic draft is written", async () => {
  const { sends, drafts, humanPatches } = await send("unsubscribe", "human_takeover");
  assertEquals(sends.length, 0);
  assertEquals(humanPatches.length, 1);
  assertEquals(drafts.length, 0);
});

Deno.test("an ordinary message is untouched by the opt-out branch", async () => {
  const { humanPatches } = await send("Can I stop by at 10 to pick up Max's lead?");
  assertEquals(humanPatches.length, 0, "no opt-out flag for a customer who said 'stop by'");
});

// ── A suppression that is not stored is not honoured (#1016 review) ──

Deno.test("a failed opt-out write fails the event instead of reading as processed", async () => {
  const { sends, drafts, humanRow, eventPatch } = await send("STOP", "ai_handling", HUMAN, { humanWriteFails: true });
  assertEquals(eventPatch.processing_status, "failed");
  assertStringIncludes(String(eventPatch.error_message), "STOP not recorded");
  assertEquals(humanRow.whatsapp_opted_out, false);
  assertEquals(sends.length, 0);
  assertEquals(drafts.length, 0, "no acknowledgement draft for a STOP we could not record");
});

Deno.test("an opt-out write that changes no row, with the row still opted in, fails the event", async () => {
  const { eventPatch } = await send("STOP", "ai_handling", HUMAN, { humanWriteMatchesNothing: true });
  assertEquals(eventPatch.processing_status, "failed");
  assertStringIncludes(String(eventPatch.error_message), "could not be confirmed");
});

Deno.test("a customer who had already opted out is confirmed, not failed", async () => {
  const { eventPatch, humanRow, drafts } = await send("STOP", "ai_handling", HUMAN, { alreadyOptedOut: true });
  assertEquals(eventPatch.processing_status, "processed");
  assertEquals(humanRow.whatsapp_opted_out, true);
  assertEquals(drafts.length, 1);
});

Deno.test("for an unknown number, a failed auto-send switch-off fails the event", async () => {
  // With no customer record, the conversation flag is the only suppression.
  const { eventPatch, sends } = await send("STOP", "ai_handling", null, { conversationWriteFails: true });
  assertEquals(eventPatch.processing_status, "failed");
  assertStringIncludes(String(eventPatch.error_message), "auto-send");
  assertEquals(sends.length, 0);
});
