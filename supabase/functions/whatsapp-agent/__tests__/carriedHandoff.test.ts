// A known customer asked for a person ("I need help", "Not me", a medical
// question) and nobody has answered yet. Each new inbound message supersedes
// the pending handoff draft (trigger 20260520240000), and before this branch a
// known customer's ordinary follow-up wrote no draft at all, so the "needs a
// person" flag simply vanished from the inbox (October 2026). Now the agent
// carries it onto the newest message until a member of staff replies or
// decides the draft, and sends no further scripts in the meantime.
import { assertEquals, assertMatch, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "test-key",
  ANTHROPIC_API_KEY: "test-model", AGENT_CALLBACK_SECRET: "test-secret",
  SEND_INTERNAL_SECRET: "test-send", WHATSAPP_MANAGE_BOOKING_ENABLED: "true",
  WHATSAPP_BOOK_ENTRY_ENABLED: "true",
  AI_ASSISTANT_ENABLED: "true", AI_KNOWN_CUSTOMER_REVIEW_DRAFTS: "false",
})) Deno.env.set(key, value);
const { handleAgentRequest } = await import("../handler.ts?carried-handoff");

const HUMAN = "human-carried";
const EARLIER = new Date(Date.now() - 60_000).toISOString();

type LatestDraft = {
  created_at: string;
  state: string;
  rejected_reason: string | null;
  handoff_required: boolean;
  tool_calls: Record<string, unknown> | null;
};

const unansweredHelp: LatestDraft = {
  created_at: EARLIER,
  state: "superseded",
  rejected_reason: "newer_inbound",
  handoff_required: true,
  tool_calls: { reason: "book_entry: customer tapped 'I need help'" },
};

async function send(
  text: string,
  opts: { latest?: LatestDraft | null; staffReplied?: boolean; state?: string } = {},
) {
  const { latest = unansweredHelp, staffReplied = false, state = "ai_handling" } = opts;
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const conversation = { id: "conv-carried", state, human_id: HUMAN, phone_e164: "+447700900444", auto_send_enabled: false, autonomous_booking_enabled: false, agent_state_rev: 0, agent_state: {}, lead_status: "records_created", lead_payload: null };
  const message = { id: "synthetic-carried", from: "447700900444", type: "text", text: { body: text }, timestamp: String(Math.floor(Date.now() / 1000)) };
  const payload = { entry: [{ changes: [{ value: { messages: [message] } }] }] };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, path: url.pathname, body });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.pathname === "/rest/v1/whatsapp_events") return method === "PATCH" ? new Response(null, { status: 204 }) : reply({ id: "event-carried", processing_status: "pending", signature_valid: true, payload });
    if (url.pathname === "/rest/v1/humans") return url.searchParams.get("select")?.startsWith("name") ? reply({ name: "Synthetic", surname: "Person" }) : reply([{ id: HUMAN, phone: "07700900444" }]);
    if (url.pathname === "/rest/v1/whatsapp_conversations") return reply(conversation);
    if (url.pathname === "/rest/v1/whatsapp_messages") {
      if (method === "POST") return reply({ id: "message-carried" }, 201);
      // Only a staff-marked outbound (raw.sent_by = 'staff', #1063) answers the request.
      if (url.searchParams.get("raw->>sent_by") === "eq.staff") return reply(staffReplied ? [{ id: "staff-reply" }] : []);
      return reply([]);
    }
    if (url.pathname === "/rest/v1/whatsapp_drafts") return method === "POST" ? reply({ id: "draft-carried" }, 201) : reply(latest ? [latest] : []);
    if (url.pathname === "/rest/v1/bookings") return reply([]);
    if (url.pathname === "/rest/v1/salon_todos") return method === "POST" ? reply(null, 201) : (url.searchParams.get("select") === "sort_order" ? reply({ sort_order: 3 }) : reply([]));
    if (url.pathname.endsWith("/functions/v1/whatsapp-send")) return reply({ ok: true, meta_message_id: "wamid.synthetic" });
    return reply([]);
  };
  try {
    const response = await handleAgentRequest(new Request("http://agent.test", { method: "POST", headers: { "x-agent-secret": "test-secret", "content-type": "application/json" }, body: JSON.stringify({ event_id: "event-carried" }) }));
    assertEquals(response.status, 200);
  } finally {
    globalThis.fetch = oldFetch;
  }
  const sends = calls.filter((c) => c.path.endsWith("/functions/v1/whatsapp-send"));
  const drafts = calls.filter((c) => c.path === "/rest/v1/whatsapp_drafts" && c.method === "POST").map((c) => c.body);
  return { sends, drafts };
}

Deno.test("an unanswered request for a person is carried onto the next message", async () => {
  const { sends, drafts } = await send("Hello?");
  assertEquals(sends.length, 0, "nothing is sent to the customer");
  assertEquals(drafts.length, 1);
  assertEquals(drafts[0].intent, "escalate");
  assertEquals(drafts[0].handoff_required, true);
  assertEquals(drafts[0].auto_send_eligible, false);
  assertStringIncludes(String((drafts[0].tool_calls as Record<string, unknown>).reason), "still unanswered");
});

Deno.test("while it is open, a booking request gets a person, not the tap-to-book prompt", async () => {
  const { sends, drafts } = await send("Can I book Max in for a groom next week please?");
  assertEquals(sends.length, 0);
  assertEquals(drafts.length, 1);
  assertEquals(drafts[0].handoff_required, true);
});

Deno.test("booking-page trouble on an open request keeps the offer to book it by hand", async () => {
  const { drafts } = await send("I'm still struggling with the app");
  assertEquals(drafts.length, 1);
  assertEquals(drafts[0].handoff_required, true);
  assertMatch(String(drafts[0].proposed_text), /book this in for you here/);
});

Deno.test("a staff reply since the request closes it", async () => {
  const { drafts } = await send("Hello?", { staffReplied: true });
  assertEquals(drafts.length, 0);
});

Deno.test("a request staff already answered is not revived", async () => {
  const { drafts } = await send("Hello?", { latest: { ...unansweredHelp, rejected_reason: "staff_replied" } });
  assertEquals(drafts.length, 0);
});

Deno.test("a routine draft that went stale is not promoted to a handoff", async () => {
  const { drafts } = await send("Hello?", { latest: { ...unansweredHelp, handoff_required: false } });
  assertEquals(drafts.length, 0);
});

Deno.test("a request older than 14 days is not carried (staff replies before #1063 carry no marker)", async () => {
  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  const { sends, drafts } = await send("Hello?", { latest: { ...unansweredHelp, created_at: fifteenDaysAgo } });
  assertEquals(sends.length, 0);
  assertEquals(drafts.length, 0);
});

Deno.test("a STOP acknowledgement is never carried forward", async () => {
  const { drafts } = await send("Hello?", { latest: { ...unansweredHelp, tool_calls: { opt_out_acknowledgement: true } } });
  assertEquals(drafts.length, 0);
});

Deno.test("in Human only mode nothing automatic is written", async () => {
  const { drafts } = await send("Hello?", { state: "human_takeover" });
  assertEquals(drafts.length, 0);
});

Deno.test("with no earlier draft at all, an ordinary message is unchanged", async () => {
  const { sends, drafts } = await send("Hello?", { latest: null });
  assertEquals(sends.length, 0);
  assertEquals(drafts.length, 0);
});
