// A known customer asked for a person ("I need help", "Not me", a medical
// question) and nobody has answered yet. Each new inbound message supersedes
// the pending handoff draft (trigger 20260520240000), and before this branch a
// known customer's ordinary follow-up wrote no draft at all, so the "needs a
// person" flag simply vanished from the inbox (October 2026). Now the agent
// carries it onto the newest message until a member of staff replies or
// decides the draft, and sends no further scripts in the meantime.
import { assert, assertEquals, assertMatch, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "test-key",
  ANTHROPIC_API_KEY: "test-model", AGENT_CALLBACK_SECRET: "test-secret",
  SEND_INTERNAL_SECRET: "test-send", WHATSAPP_MANAGE_BOOKING_ENABLED: "true",
  WHATSAPP_BOOK_ENTRY_ENABLED: "true", APPLY_CONFIRM_INTERNAL_SECRET: "test-apply",
  WHATSAPP_BOOKING_FLOW_ID: "synthetic-flow",
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

// Another handler's carried draft, written after this message was stored and
// so never superseded by it: the two messages overlapped.
const carriedByOverlap: LatestDraft = {
  ...unansweredHelp,
  created_at: new Date().toISOString(),
  state: "pending",
  rejected_reason: null,
  tool_calls: { reason: "carried_handoff: an earlier request for a person is still unanswered" },
};

type Opts = {
  latest?: LatestDraft | null;
  staffReplied?: boolean;
  state?: string;
  // The newest-draft lookup fails (PostgREST 500).
  lookupError?: boolean;
  // The inbound row is already stored: a replayed event or a redelivery.
  duplicate?: boolean;
};

/** `input` is the customer's text, or the Meta message fields for a tap. */
async function send(input: string | Record<string, unknown>, opts: Opts = {}) {
  const { latest = unansweredHelp, staffReplied = false, state = "ai_handling", lookupError = false, duplicate = false } = opts;
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const conversation = { id: "conv-carried", state, human_id: HUMAN, phone_e164: "+447700900444", auto_send_enabled: false, autonomous_booking_enabled: false, agent_state_rev: 0, agent_state: {}, lead_status: "records_created", lead_payload: null };
  const content = typeof input === "string" ? { type: "text", text: { body: input } } : input;
  const message = { id: "synthetic-carried", from: "447700900444", timestamp: String(Math.floor(Date.now() / 1000)), ...content };
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
      if (method === "POST") {
        return duplicate
          ? reply({ code: "23505", message: "duplicate key idx_whatsapp_messages_meta_msg" }, 409)
          : reply({ id: "message-carried" }, 201);
      }
      // Only a staff-marked outbound (raw.sent_by = 'staff', #1063) answers the request.
      if (url.searchParams.get("raw->>sent_by") === "eq.staff") return reply(staffReplied ? [{ id: "staff-reply" }] : []);
      return reply([]);
    }
    if (url.pathname === "/rest/v1/whatsapp_drafts") {
      if (method === "POST") return reply({ id: "draft-carried" }, 201);
      if (lookupError) return reply({ message: "synthetic lookup failure" }, 500);
      return reply(latest ? [latest] : []);
    }
    if (url.pathname === "/rest/v1/bookings") return reply([]);
    if (url.pathname === "/rest/v1/rpc/mark_reminder_confirmed") return reply([]);
    if (url.pathname === "/rest/v1/salon_todos") return method === "POST" ? reply(null, 201) : (url.searchParams.get("select") === "sort_order" ? reply({ sort_order: 3 }) : reply([]));
    if (url.pathname.endsWith("/functions/v1/whatsapp-send")) return reply({ ok: true, meta_message_id: "wamid.synthetic" });
    if (url.pathname.endsWith("/functions/v1/apply-customer-confirm")) return reply({ ok: true });
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
  const reasons = drafts.map((d) => String((d.tool_calls as Record<string, unknown>).reason));
  const called = (suffix: string) => calls.some((c) => c.path.endsWith(suffix));
  return { sends, drafts, reasons, called };
}

const tap = (id: string, title: string) => ({ type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } });

// ── The carry itself ────────────────────────────────────────────

Deno.test("an unanswered request for a person is carried onto the next message", async () => {
  const { sends, drafts, reasons } = await send("Hello?");
  assertEquals(sends.length, 0, "nothing is sent to the customer");
  assertEquals(drafts.length, 1);
  assertEquals(drafts[0].intent, "escalate");
  assertEquals(drafts[0].handoff_required, true);
  assertEquals(drafts[0].auto_send_eligible, false);
  assertStringIncludes(reasons[0], "still unanswered");
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

// ── Button taps take their own route first, then keep the request open ──

Deno.test("a reminder Confirm tap still confirms, and the request is carried", async () => {
  const { sends, drafts, called } = await send({ type: "button", button: { text: "Confirm", payload: "Confirm" } });
  assert(called("/rpc/mark_reminder_confirmed"), "the reminder is still stamped");
  assertEquals(sends.length, 0);
  assertEquals(drafts.length, 1);
  assertEquals(drafts[0].handoff_required, true);
});

Deno.test("a Book my dogs tap still opens the booking form, and the request is carried", async () => {
  const { sends, drafts } = await send(tap("bookentry:start", "Book my dogs"));
  assertEquals(sends.map((s) => s.body.mode), ["flow"], "the customer chose the form, so it still opens");
  assertEquals(drafts.length, 1);
  assertEquals(drafts[0].handoff_required, true);
});

Deno.test("a Yes/No booking tap is still applied, and the request is carried", async () => {
  const { drafts, called } = await send(tap("11111111-1111-4111-8111-111111111111:yes", "Yes"));
  assert(called("/functions/v1/apply-customer-confirm"), "the customer's choice is still applied");
  assertEquals(drafts.length, 1);
  assertEquals(drafts[0].handoff_required, true);
});

Deno.test("a reminder Confirm tap with no open request writes no draft", async () => {
  const { drafts, called } = await send({ type: "button", button: { text: "Confirm", payload: "Confirm" } }, { latest: null });
  assert(called("/rpc/mark_reminder_confirmed"));
  assertEquals(drafts.length, 0);
});

// ── Overlap, failure and replay ─────────────────────────────────

Deno.test("an overlapping message that finds the carried draft already pending sends no script and adds no draft", async () => {
  const { sends, drafts } = await send("Can I book Max in for a groom next week please?", { latest: carriedByOverlap });
  assertEquals(sends.length, 0, "no tap-to-book prompt while the request is open");
  assertEquals(drafts.length, 0, "the pending carried draft already flags it");
});

Deno.test("when the open-request check cannot be read, it fails closed: a person is asked for, no script is sent", async () => {
  const { sends, drafts, reasons } = await send("Can I book Max in for a groom next week please?", { lookupError: true });
  assertEquals(sends.length, 0);
  assertEquals(drafts.length, 1);
  assertEquals(drafts[0].handoff_required, true);
  assertStringIncludes(reasons[0], "could not be checked");
});

Deno.test("a replayed event whose carried draft never saved writes it now", async () => {
  const { sends, drafts } = await send("Hello?", { duplicate: true });
  assertEquals(sends.length, 0);
  assertEquals(drafts.length, 1);
  assertEquals(drafts[0].handoff_required, true);
});

Deno.test("a redelivery after the carried draft saved writes nothing more", async () => {
  const { drafts } = await send("Hello?", { duplicate: true, latest: carriedByOverlap });
  assertEquals(drafts.length, 0);
});

// ── What stays out ──────────────────────────────────────────────

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
