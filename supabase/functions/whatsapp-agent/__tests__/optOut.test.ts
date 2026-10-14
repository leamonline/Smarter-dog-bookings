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
  /** The first N humans PATCHes return an error (a transient fault). */
  humanWriteFailures?: number;
  /** The humans PATCH "succeeds" but changes no row (and the row is not opted out). */
  humanWriteMatchesNothing?: boolean;
  /** The customer had already opted out before this message. */
  alreadyOptedOut?: boolean;
  /** Every conversation PATCH returns an error. */
  conversationWriteFails?: boolean;
  /** The number's opt-out PATCH "succeeds" but stores nothing. */
  numberStampMatchesNothing?: boolean;
  /** The number already said STOP at this time. */
  numberStoppedAt?: string;
  /**
   * Customer records stored on the sender's number, as typed. Defaults to the
   * linked customer stored "07700900444"; an unlinked conversation can still
   * have a record on its number stored formatted (#1016 review).
   */
  onNumber?: { id: string; phone: string }[];
  /**
   * A pending acknowledgement already exists for the conversation (a repeated
   * STOP, or a concurrent one that inserted first): the insert hits the
   * whatsapp_drafts_one_pending_opt_out_ack unique index.
   */
  pendingAcknowledgement?: boolean;
}

async function send(text: string | string[], state = "ai_handling", humanId: string | null = HUMAN, faults: Faults = {}) {
  const calls: { method: string; path: string; search: string; body: Record<string, unknown> }[] = [];
  // A stateful humans table: the STOP write is applied with PostgREST's
  // id=in.(…) and whatsapp_opted_out=eq. filters, so a test can assert what
  // was STORED, not only what was sent.
  const seed = faults.onNumber ?? (humanId ? [{ id: humanId, phone: "07700900444" }] : []);
  const humans: Record<string, unknown>[] = seed.map((row) => ({
    ...row,
    whatsapp_opted_out: faults.alreadyOptedOut === true,
    whatsapp_opted_out_at: null,
    whatsapp_opted_out_reason: null,
  }));
  const humanRow = humans[0] ?? {};
  const idsFrom = (filter: string | null) =>
    filter?.startsWith("in.(") ? filter.slice(4, -1).split(",") : filter?.startsWith("eq.") ? [filter.slice(3)] : [];
  let eventPatch: Record<string, unknown> = {};
  const conversation: Record<string, unknown> = { id: "conv-opt-out", state, human_id: humanId, phone_e164: "+447700900444", auto_send_enabled: true, autonomous_booking_enabled: false, agent_state_rev: 0, agent_state: {}, lead_status: "records_created", lead_payload: null, whatsapp_opted_out_at: faults.numberStoppedAt ?? null };
  // Several texts are one webhook batch, in the order the customer sent them.
  const messages = (Array.isArray(text) ? text : [text]).map((body, index) => ({
    id: `synthetic-${index}`, from: "447700900444", type: "text", text: { body }, timestamp: String(Math.floor(Date.now() / 1000) + index),
  }));
  const payload = { entry: [{ changes: [{ value: { messages } }] }] };
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
        if ((faults.humanWriteFailures ?? 0) > 0) {
          faults.humanWriteFailures = (faults.humanWriteFailures ?? 0) - 1;
          return reply({ message: "connection reset" }, 500);
        }
        const ids = idsFrom(url.searchParams.get("id"));
        const optedFilter = url.searchParams.get("whatsapp_opted_out");
        const changed = faults.humanWriteMatchesNothing ? [] : humans.filter((row) =>
          ids.includes(String(row.id))
          && (optedFilter === null || optedFilter === `eq.${row.whatsapp_opted_out}`));
        for (const row of changed) Object.assign(row, body);
        return new Response(null, { status: 204 });
      }
      // supabase-js strips whitespace from select lists.
      const select = (url.searchParams.get("select") ?? "").replace(/\s/g, "");
      if (select.startsWith("name")) return reply({ name: "Synthetic", surname: "Person" });
      if (select === "id,whatsapp_opted_out") {
        const ids = idsFrom(url.searchParams.get("id"));
        return reply(humans.filter((row) => ids.includes(String(row.id))).map((row) => ({ id: row.id, whatsapp_opted_out: row.whatsapp_opted_out })));
      }
      // The phone lookups (agent's own link, and the STOP pattern match):
      // every record on the sender's number, formatted as stored.
      return reply(humans.map((row) => ({ id: row.id, phone: row.phone })));
    }
    if (url.pathname === "/rest/v1/whatsapp_conversations") {
      if (method === "PATCH") {
        if (faults.conversationWriteFails) return reply({ message: "connection reset" }, 500);
        // Honour the guard that keeps the first STOP's time.
        const guardedStamp = url.searchParams.get("whatsapp_opted_out_at") === "is.null";
        if (guardedStamp && (faults.numberStampMatchesNothing || conversation.whatsapp_opted_out_at !== null)) {
          return new Response(null, { status: 204 });
        }
        Object.assign(conversation, body);
        return new Response(null, { status: 204 });
      }
      return reply(conversation);
    }
    if (url.pathname === "/rest/v1/whatsapp_messages") return method === "POST" ? reply({ id: "message-opt-out" }, 201) : reply([]);
    if (url.pathname === "/rest/v1/whatsapp_drafts") {
      const isAcknowledgement = (body.tool_calls as Record<string, unknown> | undefined)?.opt_out_acknowledgement === true;
      if (method === "POST" && isAcknowledgement && faults.pendingAcknowledgement) {
        return reply({
          code: "23505",
          message: 'duplicate key value violates unique constraint "whatsapp_drafts_one_pending_opt_out_ack"',
        }, 409);
      }
      return method === "POST" ? reply({ id: "draft-opt-out" }, 201) : reply([]);
    }
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
  return { sends, drafts, humanPatches, conversationPatches, humanRow, humans, eventPatch, calls, conversation };
}

Deno.test("STOP flags the customer, switches auto-send off, sends nothing and leaves one draft", async () => {
  const { sends, drafts, humanPatches, conversationPatches, humanRow, eventPatch, conversation } = await send("STOP");
  // What was STORED, not just what was sent (#1016 review).
  assertEquals(humanRow.whatsapp_opted_out, true);
  assertEquals(humanRow.whatsapp_opted_out_reason, "asked_on_whatsapp");
  assertEquals(eventPatch.processing_status, "processed");
  assertEquals(sends.length, 0, "nothing is sent to someone who asked us to stop");
  assertEquals(humanPatches.length, 1);
  assertEquals(humanPatches[0].body.whatsapp_opted_out, true);
  assertEquals(humanPatches[0].body.whatsapp_opted_out_reason, "asked_on_whatsapp");
  assert(typeof humanPatches[0].body.whatsapp_opted_out_at === "string");
  assertStringIncludes(decodeURIComponent(humanPatches[0].search), HUMAN);
  assert(conversationPatches.some((p) => p.auto_send_enabled === false), "auto-send is switched off on the thread");
  assertEquals(conversation.auto_send_enabled, false);
  assert(typeof conversation.whatsapp_opted_out_at === "string", "the number's own opt-out is stored");
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

Deno.test("for an unknown number, STOP stores the number's own opt-out", async () => {
  // No customer record anywhere: the number's suppression is the whole of it,
  // and whatsapp-send refuses the number on it (migration 20261014120000).
  const { conversation, humanPatches, eventPatch, sends, drafts } = await send("STOP", "ai_handling", null, { onNumber: [] });
  assertEquals(eventPatch.processing_status, "processed");
  assert(typeof conversation.whatsapp_opted_out_at === "string");
  assertEquals(conversation.auto_send_enabled, false);
  assertEquals(humanPatches.length, 0, "no customer record to flag");
  assertEquals(sends.length, 0);
  assertEquals(drafts.length, 1);
});

Deno.test("a failed write of the number's opt-out fails the event", async () => {
  const { eventPatch, sends, drafts } = await send("STOP", "ai_handling", null, { onNumber: [], conversationWriteFails: true });
  assertEquals(eventPatch.processing_status, "failed");
  assertStringIncludes(String(eventPatch.error_message), "number's opt-out");
  assertEquals(sends.length, 0);
  assertEquals(drafts.length, 0, "no acknowledgement for a STOP we could not record");
});

Deno.test("a number opt-out that does not land fails the event, even with no error", async () => {
  const { eventPatch, conversation } = await send("STOP", "ai_handling", null, { onNumber: [], numberStampMatchesNothing: true });
  assertEquals(conversation.whatsapp_opted_out_at, null);
  assertEquals(eventPatch.processing_status, "failed");
  assertStringIncludes(String(eventPatch.error_message), "could not be confirmed");
});

Deno.test("a repeat STOP keeps the number's first opt-out time and still switches auto-send off", async () => {
  const first = "2026-10-01T09:00:00.000Z";
  const { conversation, eventPatch } = await send("STOP", "ai_handling", HUMAN, { numberStoppedAt: first, alreadyOptedOut: true });
  assertEquals(eventPatch.processing_status, "processed");
  assertEquals(conversation.whatsapp_opted_out_at, first);
  assertEquals(conversation.auto_send_enabled, false);
});

Deno.test("STOP on an unlinked conversation flags the customer whose number is stored formatted", async () => {
  // The agent links conversations by exact phone string, so a customer stored
  // as "07700 900 444" leaves the conversation unlinked. Their STOP must still
  // flag that record, or a later staff send would pass the gate (#1016 review).
  const { humans, eventPatch, sends } = await send("STOP", "ai_handling", null, {
    onNumber: [{ id: "human-formatted", phone: "07700 900 444" }],
  });
  assertEquals(eventPatch.processing_status, "processed");
  assertEquals(humans[0].whatsapp_opted_out, true);
  assertEquals(humans[0].whatsapp_opted_out_reason, "asked_on_whatsapp");
  assertEquals(sends.length, 0);
});

Deno.test("every record on the number is flagged, not just the linked one", async () => {
  const { humans, eventPatch } = await send("STOP", "ai_handling", HUMAN, {
    onNumber: [{ id: HUMAN, phone: "07700900444" }, { id: "human-partner", phone: "+44 7700 900444" }],
  });
  assertEquals(eventPatch.processing_status, "processed");
  assertEquals(humans.map((row) => row.whatsapp_opted_out), [true, true]);
});

Deno.test("a second acknowledgement refused by the one-pending index leaves the STOP recorded", async () => {
  // A repeated STOP, or two processed at once: the database allows one
  // pending acknowledgement per conversation (whatsapp_drafts_one_pending_
  // opt_out_ack; the race itself is pinned in supabase/tests/244). The loser's
  // refusal is expected, not an agent failure (#1016 review).
  const { drafts, eventPatch, humanRow, conversation } = await send("STOP", "ai_handling", HUMAN, {
    alreadyOptedOut: true,
    pendingAcknowledgement: true,
  });
  assertEquals(drafts.length, 1, "the insert was attempted and refused");
  assertEquals(eventPatch.processing_status, "processed");
  assertEquals(humanRow.whatsapp_opted_out, true);
  assert(typeof conversation.whatsapp_opted_out_at === "string");
});

Deno.test("STOP flags only the records whose digits match the sender, not a neighbouring number", async () => {
  const { humans, eventPatch } = await send("STOP", "ai_handling", null, {
    onNumber: [
      { id: "human-uk", phone: "07700 900 444" },
      { id: "human-other", phone: "07700 900 445" },
    ],
  });
  assertEquals(eventPatch.processing_status, "processed");
  assertEquals(humans[0].whatsapp_opted_out, true);
  assertEquals(humans[1].whatsapp_opted_out, false, "a different number is untouched");
});

Deno.test("a STOP batched after an ordinary message is honoured before that message is answered", async () => {
  // Meta can deliver several messages in one webhook. Handling them in order
  // would draft, and could auto-send, a reply to the first after the customer
  // had already asked us to stop in the same payload (#1016 review).
  const { calls, humanRow, eventPatch } = await send(["Can I book Bella in on Tuesday?", "STOP"]);
  assertEquals(eventPatch.processing_status, "processed");
  assertEquals(humanRow.whatsapp_opted_out, true);
  const numberStop = calls.findIndex((c) => c.path === "/rest/v1/whatsapp_conversations" && c.method === "PATCH" && typeof c.body.whatsapp_opted_out_at === "string");
  const autoSendOff = calls.findIndex((c) => c.path === "/rest/v1/whatsapp_conversations" && c.method === "PATCH" && c.body.auto_send_enabled === false);
  const customerStop = calls.findIndex((c) => c.path === "/rest/v1/humans" && c.method === "PATCH");
  assert(numberStop >= 0 && autoSendOff >= 0 && customerStop >= 0, "number, thread and customer suppression all stored");
  const optOutWrite = Math.max(numberStop, autoSendOff, customerStop);
  const ordinaryInbound = calls.findIndex((c, i) => i > optOutWrite && c.path === "/rest/v1/whatsapp_messages" && c.method === "POST");
  assert(ordinaryInbound > optOutWrite, "the ordinary message is handled only after every suppression write");
  // Anything the agent still dispatches for it reaches whatsapp-send after the
  // opt-out is stored, AI-initiated and without an override, so the send gate
  // refuses it (whatsapp-send/__tests__/optOut.test.ts).
  for (const [index, call] of calls.entries()) {
    if (!call.path.endsWith("/functions/v1/whatsapp-send")) continue;
    assert(index > optOutWrite, "no send before the opt-out is stored");
    assertEquals(call.body.ai_initiated, true);
    assertEquals(call.body.override_opt_out, undefined);
  }
});

Deno.test("handling a batched STOP first does not move the inbox preview backwards", async () => {
  const { calls } = await send(["Can I book Bella in on Tuesday?", "STOP"]);
  const upserts = calls.filter((c) => c.path === "/rest/v1/whatsapp_conversations" && c.method === "POST");
  assert(upserts.length >= 2, "one upsert per message");
  const newest = upserts.map((c) => c.body.last_inbound_at as string).sort().at(-1);
  for (const upsert of upserts) {
    assertEquals(upsert.body.last_customer_text, "STOP");
    assertEquals(upsert.body.last_inbound_at, newest);
  }
});

Deno.test("a stale link does not carry the STOP to a customer whose number has changed", async () => {
  // Staff changed this customer's number; the old conversation still links to
  // them. The old number's STOP stops the old number, not their new one
  // (#1016 review). whatsapp-send still refuses the old number itself.
  const { humans, humanPatches, conversation, eventPatch } = await send("STOP", "ai_handling", HUMAN, {
    onNumber: [{ id: HUMAN, phone: "07700 900 999" }],
  });
  assertEquals(eventPatch.processing_status, "processed");
  assertEquals(humanPatches.length, 0);
  assertEquals(humans[0].whatsapp_opted_out, false);
  assert(typeof conversation.whatsapp_opted_out_at === "string", "the old number is suppressed");
});

Deno.test("a transient write failure is retried and the STOP is recorded", async () => {
  const { eventPatch, humanRow, humanPatches } = await send("STOP", "ai_handling", HUMAN, { humanWriteFailures: 1 });
  assertEquals(eventPatch.processing_status, "processed");
  assertEquals(humanRow.whatsapp_opted_out, true);
  assertEquals(humanPatches.length, 2, "one failed attempt, one that landed");
});

Deno.test("a STOP that cannot be recorded leaves the event replayable: nothing half-done", async () => {
  // Recording happens BEFORE the inbound row is stored, so the de-duplication
  // that would make a replay "ignored" has not run (#1016 review).
  const { eventPatch, calls, humanPatches } = await send("STOP", "ai_handling", HUMAN, { humanWriteFails: true });
  assertEquals(eventPatch.processing_status, "failed");
  assertStringIncludes(String(eventPatch.error_message), "STOP not recorded");
  assertEquals(humanPatches.length, 3, "three attempts before failing");
  assertEquals(calls.filter((c) => c.path === "/rest/v1/whatsapp_messages" && c.method === "POST").length, 0, "no inbound row stored");
});
