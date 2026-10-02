import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { agentCalendar, addCalendarDays } from "../../_shared/agentContext.ts";

interface Scenario {
  enabled?: boolean;
  memoryFailure?: "error" | "missing";
  state?: string;
  text?: string;
  bookEntry?: boolean;
  outcome?: "accepted" | "refused" | "uncertain" | "timeout" | "malformed";
  recent?: boolean;
  sendSecret?: boolean;
  force?: boolean;
  suggest?: boolean;
  assistant?: boolean;
  bookingError?: boolean;
  calendarError?: boolean;
  horizon?: number;
  crowded?: boolean;
  defaultFlag?: boolean;
  duplicate?: boolean;
  manage?: boolean;
  selfService?: boolean;
  truncated?: boolean;
  emptyBookings?: boolean;
  availabilityError?: boolean;
  extraSlots?: boolean;
}
const dogId = "00000000-0000-4000-8000-000000000001";
async function run(s: Scenario = {}) {
  for (const [key, value] of Object.entries({
    SUPABASE_URL: "http://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "test-key",
    ANTHROPIC_API_KEY: "test-model", AGENT_CALLBACK_SECRET: "test-secret",
    SEND_INTERNAL_SECRET: s.sendSecret === false ? "" : "test-send",
    AI_KNOWN_CUSTOMER_REVIEW_DRAFTS: String(s.enabled !== false),
    AI_AUTO_SEND_LOW_RISK: "true", AI_AUTONOMOUS_BOOKING_ENABLED: "true",
    WHATSAPP_BOOK_ENTRY_ENABLED: String(!!s.bookEntry), WHATSAPP_MANAGE_BOOKING_ENABLED: String(!!s.manage),
    AI_ASSISTANT_ENABLED: String(s.assistant !== false),
  })) Deno.env.set(key, value);
  if (s.defaultFlag) Deno.env.delete("AI_KNOWN_CUSTOMER_REVIEW_DRAFTS");
  // Literal module variants let Deno preload the test graph without --allow-read.
  const { handleAgentRequest } = s.defaultFlag ? await import("../handler.ts?review-default-off")
    : s.manage ? await import("../handler.ts?review-all-automation")
    : s.assistant === false ? await import("../handler.ts?assistant-off")
    : s.sendSecret === false ? await import("../handler.ts?missing-send-secret")
    : s.bookEntry ? (s.enabled === false ? await import("../handler.ts?book-entry-review-off") : await import("../handler.ts?book-entry-review-on"))
    : s.enabled === false ? await import("../handler.ts?review-off") : await import("../handler.ts?review-on");
  const calls: { method: string; path: string; query: URLSearchParams; body: Record<string, unknown> }[] = [];
  const rows: Record<string, unknown>[] = [];
  const today = agentCalendar().today;
  const later = addCalendarDays(today, 42);
  const oldFetch = globalThis.fetch;
  const conversation = { id: "conv-review", state: s.state ?? "ai_handling", human_id: "human-review", phone_e164: "+447700900111", auto_send_enabled: true, autonomous_booking_enabled: !s.selfService, agent_state: { breed: "Cockapoo", dogName: "Synthetic dog" }, lead_status: "records_created", lead_payload: null };
  const payload = { entry: [{ changes: [{ value: { messages: [{ id: "synthetic-inbound", from: "447700900111", type: "text", text: { body: s.text ?? "Can I book my dog?" }, timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] };
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, path: url.pathname, query: url.searchParams, body });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.pathname === "/rest/v1/whatsapp_events") return method === "PATCH" ? new Response(null, { status: 204 }) : reply({ id: "event-review", processing_status: "pending", signature_valid: true, payload });
    if (url.pathname === "/rest/v1/humans") return url.searchParams.get("select")?.startsWith("name,") ? reply({ name: "Synthetic", surname: "Person" }) : reply([{ id: "human-review", phone: "07700900111" }]);
    if (url.pathname === "/rest/v1/whatsapp_conversations" && (method === "POST" || method === "GET")) return reply(conversation);
    if (url.pathname === "/rest/v1/whatsapp_conversations" && method === "PATCH" && s.memoryFailure) return s.memoryFailure === "error" ? reply({ message: "synthetic save failure" }, 500) : reply(null);
    if (url.pathname === "/rest/v1/whatsapp_messages") {
      if (method === "POST") return s.duplicate ? reply({ code: "23505", message: "duplicate key idx_whatsapp_messages_meta_msg" }, 409) : reply({ id: "message-review" }, 201);
      if (url.searchParams.has("or")) return reply(s.recent ? [{ id: "previous", content: "[book_entry] synthetic" }] : []);
      return reply([{ id: "message-review", direction: "inbound", content: s.text ?? "Can I book my dog?" }]);
    }
    if (url.pathname === "/rest/v1/dogs" && method === "GET") return reply([{ id: dogId, name: "Synthetic dog", breed: "Cockapoo", size: "small" }]);
    if (url.pathname === "/rest/v1/booking_policy_settings") return reply({ booking_horizon_days: s.horizon ?? 180 });
    if (url.pathname === "/rest/v1/bookings" && method === "GET") {
      if (s.emptyBookings) return reply([]);
      if (s.bookingError) return reply({ message: "synthetic lookup failure" }, 500);
      const booking = { id: "later-visit", booking_date: later, slot: "11:00", service: "full-groom", status: "Booked", confirmed: true, dogs: { name: "Synthetic dog" } };
      return reply(s.crowded ? Array.from({ length: 41 }, (_, i) => ({ ...booking, id: `visit-${i}` })) : [booking, { ...booking, id: "cancelled-visit", status: "Cancelled" }]);
    }
    if (url.pathname === "/rest/v1/day_settings") return s.calendarError ? reply({ message: "synthetic calendar failure" }, 500) : reply([{ setting_date: addCalendarDays(today, 1), is_open: true }, { setting_date: addCalendarDays(today, 2), is_open: false }]);
    if (url.pathname === "/rest/v1/rpc/get_small_medium_availability") return s.availabilityError ? reply({ message: "synthetic availability failure" }, 500) : reply(s.extraSlots ? ["08:30", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30"].map((slot) => ({ booking_date: today, slot })) : [{ booking_date: today, slot: "09:00" }]);
    if (url.pathname === "/rest/v1/rpc/get_large_dog_day_availability") return reply([]);
    if (url.pathname === "/v1/messages") return reply({ content: [{ type: "text", text: JSON.stringify({ intent: "greeting", confidence: 0.99, proposed_text: "Synthetic review text", ...((s.force && !s.memoryFailure) || s.suggest ? {} : { extracted_state: { breed: "Changed breed", customerName: "Changed name" }, booking_action: { action: "create", dog_id: dogId, booking_date: today, slot: "09:00", service: "full-groom", size: "small" } }) }) }], stop_reason: s.truncated ? "max_tokens" : "end_turn", usage: { input_tokens: 10, output_tokens: 10 } });
    if (url.pathname === "/rest/v1/whatsapp_drafts" && method === "POST") { rows.push(body); return reply({ id: "review-draft" }, 201); }
    if (url.pathname.endsWith("/functions/v1/whatsapp-send")) {
      if (s.outcome === "timeout") throw new Error("synthetic timeout after request");
      if (s.outcome === "refused") return reply({ error: "AI-initiated WhatsApp messaging is disabled", reason: "global_disabled" }, 409);
      if (s.outcome === "uncertain") return reply({ error: "Meta send failed" }, 502);
      if (s.outcome === "malformed") return new Response("not json");
      return reply({ ok: true, meta_message_id: "synthetic-provider-id" });
    }
    throw new Error(`Unexpected side effect/read: ${method} ${url.pathname}`);
  };
  try {
    const response = await handleAgentRequest(new Request("http://agent.test", { method: "POST", headers: { "x-agent-secret": "test-secret", "content-type": "application/json" }, body: JSON.stringify({ event_id: "event-review", force_draft: s.force, suggest_only: s.suggest }) }));
    assertEquals(response.status, 200);
    const text = await response.text();
    if (!s.suggest) assertEquals(text, s.memoryFailure || s.truncated ? "handled with error" : s.duplicate ? "ok (duplicate inbound, ignored)" : "ok");
    return { calls, rows, today, later, text };
  } finally { globalThis.fetch = oldFetch; }
}
function assertIsolation(result: Awaited<ReturnType<typeof run>>, attempted = false) {
  assertEquals(result.rows.length, 1);
  assertEquals(result.rows[0].requires_approval, true);
  assertEquals(result.rows[0].auto_send_eligible, false);
  assertEquals(result.rows[0].state, "pending");
  assertEquals((result.rows[0].tool_calls as Record<string, unknown>).review_only, true);
  const writes = result.calls.filter((c) => c.method !== "GET" && !c.path.startsWith("/rest/v1/rpc/") && c.path !== "/v1/messages");
  assert(writes.every((c) => ["/rest/v1/whatsapp_events", "/rest/v1/whatsapp_messages", "/rest/v1/whatsapp_conversations", "/rest/v1/whatsapp_drafts"].includes(c.path) || (attempted && c.path.endsWith("/functions/v1/whatsapp-send"))));
  assertEquals(result.calls.filter((c) => c.method === "PATCH" && c.path === "/rest/v1/whatsapp_conversations").length, 0);
  for (const c of result.calls.filter((c) => c.method === "POST" && c.path === "/rest/v1/whatsapp_conversations")) {
    assert(Object.keys(c.body).every((key) => ["phone_e164", "channel", "human_id", "last_inbound_at", "last_customer_text"].includes(key)), "inbound bookkeeping must not carry learned-state or lead corrections");
  }
  assertEquals(result.calls.filter((c) => c.path.endsWith("/functions/v1/whatsapp-send")).length, attempted ? 1 : 0);
  assertEquals(result.calls.filter((c) => c.path.includes("whatsapp_booking_actions") || c.path.includes("whatsapp_ai_action_audit")).length, 0);
}
Deno.test("review draft writes only a held draft despite all automation opt-ins and extracted corrections", async () => {
  const result = await run({ manage: true });
  assertIsolation(result);
  assertEquals((result.rows[0].tool_calls as Record<string, unknown>).prompt_version, "2026-10-02.2");
  // No durable AI send gate lookup is needed merely to save a review draft.
  assertEquals(result.calls.filter((c) => c.path.includes("ai_whatsapp_settings")).length, 0);
});
for (const scenario of [{ enabled: false }, { state: "human_takeover" }, { text: "Please cancel my appointment" }, { text: "Please reschedule" }, { text: "Hello" }]) {
  Deno.test(`ineligible review path preserves on-demand: ${JSON.stringify(scenario)}`, async () => {
    const result = await run(scenario);
    assertEquals(result.rows.length, 0);
    assertEquals(result.calls.filter((c) => c.path === "/v1/messages").length, 0);
  });
}
Deno.test("accepted book entry wins without a receipt or a second response", async () => {
  const result = await run({ bookEntry: true, outcome: "accepted" });
  assertEquals(result.rows.length, 0);
  assertEquals(result.calls.filter((c) => c.path.endsWith("/functions/v1/whatsapp-send")).length, 1);
});
Deno.test("validated global-disabled refusal falls through to an isolated review draft", async () => assertIsolation(await run({ bookEntry: true, outcome: "refused" }), true));
for (const outcome of ["uncertain", "timeout", "malformed"] as const) {
  Deno.test(`book entry ${outcome} does not retry or draft`, async () => {
    const result = await run({ bookEntry: true, outcome });
    assertEquals(result.rows.length, 0);
    assertEquals(result.calls.filter((c) => c.path.endsWith("/functions/v1/whatsapp-send")).length, 1);
  });
}
Deno.test("missing send configuration or debounce reaches eligible review mode", async () => {
  assertIsolation(await run({ bookEntry: true, sendSecret: false }));
  assertIsolation(await run({ bookEntry: true, recent: true }));
});
Deno.test("refusal does not introduce automatic drafts in Human only or flag-off mode", async () => {
  for (const scenario of [{ state: "human_takeover" }, { enabled: false }]) assertEquals((await run({ ...scenario, bookEntry: true, outcome: "refused" })).rows.length, 0);
});
Deno.test("assistant kill switch saves only a fallback review draft", async () => {
  const result = await run({ assistant: false });
  assertIsolation(result);
  assertEquals(result.calls.filter((c) => c.path === "/v1/messages").length, 0);
});
Deno.test("staff force_draft remains outside automatic review-only mode", async () => {
  const result = await run({ force: true });
  assertEquals(result.rows.length, 1);
  assertEquals((result.rows[0].tool_calls as Record<string, unknown>).review_only, false);
});
Deno.test("staff suggest_only still returns text without a draft or mutations", async () => {
  const result = await run({ suggest: true });
  assertEquals(result.rows.length, 0);
  assertEquals(JSON.parse(result.text).reply_text, "Synthetic review text");
});
Deno.test("context uses configured horizon, status and explicit diary exceptions", async () => {
  const result = await run({ horizon: 365 });
  const model = result.calls.find((c) => c.path === "/v1/messages")!;
  const context = (model.body.messages as { content: string }[])[0].content;
  assertStringIncludes(context, result.later);
  assertStringIncludes(context, "[status: Booked]");
  assert(!context.includes("cancelled-visit"));
  assertStringIncludes(context, `${addCalendarDays(result.today, 1)}: open`);
  assertStringIncludes(context, `${addCalendarDays(result.today, 2)}: closed`);
  assertStringIncludes(context, "Review-only drafting mode");
  const query = result.calls.find((c) => c.path === "/rest/v1/bookings")!.query;
  assertEquals(query.get("booking_date"), `gte.${result.today}`);
  assert(query.getAll("booking_date").includes(`lte.${addCalendarDays(result.today, 365)}`));
  assertEquals(query.get("status"), "neq.Cancelled");
  const system = model.body.system as string;
  assert(!system.includes("Open days: Monday"));
  assert(!system.includes("kindly point out we're Mon-Wed"));
  assert(!system.includes("(Mon, Tue or Wed)"));
  assertStringIncludes(system, "Explicit diary exceptions override");
});
Deno.test("failed context lookup is not reported as no appointment", async () => {
  const result = await run({ bookingError: true, calendarError: true });
  const context = ((result.calls.find((c) => c.path === "/v1/messages")!.body.messages) as { content: string }[])[0].content;
  assertStringIncludes(context, "lookup unavailable");
  assert(!context.includes("none found through"));
  assertStringIncludes(context, "Diary exceptions lookup unavailable");
});
Deno.test("bounded appointment rendering explicitly states omitted records", async () => {
  const result = await run({ crowded: true });
  const context = ((result.calls.find((c) => c.path === "/v1/messages")!.body.messages) as { content: string }[])[0].content;
  assertStringIncludes(context, "Additional appointments omitted");
  assert(context.includes("visit-39") && !context.includes("visit-40"));
});

Deno.test("unset review flag is off by default", async () => {
  const result = await run({ defaultFlag: true });
  assertEquals(result.rows.length, 0);
  assertEquals(result.calls.filter((c) => c.path === "/v1/messages").length, 0);
});
Deno.test("duplicate inbound stops before generating a second review draft", async () => {
  const result = await run({ duplicate: true });
  assertEquals(result.rows.length, 0);
  assertEquals(result.calls.filter((c) => c.path === "/v1/messages").length, 0);
});
Deno.test("empty appointments differ from failures and diary exceptions survive slot-RPC failure", async () => {
  const result = await run({ emptyBookings: true, availabilityError: true });
  const context = ((result.calls.find((c) => c.path === "/v1/messages")!.body.messages) as { content: string }[])[0].content;
  assertStringIncludes(context, "none found through");
  assertStringIncludes(context, `${addCalendarDays(result.today, 2)}: closed`);
  assertStringIncludes(context, "no verified slots returned");
});

Deno.test("ten returned slots do not imply every canonical slot is free", async () => {
  const result = await run({ extraSlots: true });
  const context = ((result.calls.find((c) => c.path === "/v1/messages")!.body.messages) as { content: string }[])[0].content;
  assertStringIncludes(context, "13:30");
  assert(!context.includes("(all open)"));
  const availability = context.slice(context.indexOf("--- Availability"), context.indexOf("--- Large-dog"));
  assert(!availability.includes("09:00"));
});

Deno.test("self-service instructions answer verified facts and keep internal controls out of customer copy", async () => {
  const result = await run({ selfService: true, bookingError: true });
  const model = result.calls.find((c) => c.path === "/v1/messages")!;
  const context = (model.body.messages as { content: string }[])[0].content;
  const system = model.body.system as string;
  assertStringIncludes(context, "Answers the actual question");
  assertStringIncludes(context, "booking_cancel");
  assertStringIncludes(context, "verified answer is enough");
  assert(!context.includes("staff have turned autonomous booking off"));
  assertStringIncludes(system, "cannot check the appointment details right now");
  assertStringIncludes(system, "explicitly identify 10:00 as a different time");
  assertStringIncludes(system, "Do not instruct customers to book dogs separately");
  assertStringIncludes(system, "Never mention context labels");
  assertStringIncludes(system, "Only when proposing a permitted booking_action");
  assertIsolation(result);
});

for (const memoryFailure of ["error", "missing"] as const) {
  Deno.test(`failed memory save stops downstream work: ${memoryFailure}`, async () => {
    const result = await run({ force: true, memoryFailure });
    assertEquals(result.rows.length, 0);
    assertEquals(result.calls.filter(c => c.path.endsWith("/functions/v1/whatsapp-send")).length, 0);
    assertEquals(result.calls.filter(c => c.path.includes("whatsapp_booking_actions") || c.path.includes("whatsapp_ai_action_audit")).length, 0);
    const writes = result.calls.filter(c => c.method === "PATCH");
    assert(writes.every(c => ["/rest/v1/whatsapp_conversations", "/rest/v1/whatsapp_events"].includes(c.path)));
    const event = writes.find(c => c.path === "/rest/v1/whatsapp_events")!;
    assertEquals(event.body.processing_status, "failed");
    assertStringIncludes(String(event.body.error_message), "Agent memory save failed");
  });
}

Deno.test("truncated provider output cannot persist even an apparently complete first JSON object", async () => {
  const result = await run({ truncated: true });
  assertEquals(result.rows.length, 0);
  assertEquals(result.calls.filter((c) => c.path === "/v1/messages").length, 1);
  assertEquals(result.calls.filter((c) => c.path.endsWith("/functions/v1/whatsapp-send")).length, 0);
  const writes = result.calls.filter((c) => c.method === "PATCH");
  assert(writes.every((c) => c.path === "/rest/v1/whatsapp_events"));
  assertEquals(writes.at(-1)?.body.processing_status, "failed");
  assertStringIncludes(String(writes.at(-1)?.body.error_message), "output truncated");
});

Deno.test("relative-date customer answers are bound to the London calendar supplied to the model", async () => {
  const result = await run({ selfService: true, text: "Can I book my dog tomorrow?" });
  const model = result.calls.find((c) => c.path === "/v1/messages")!;
  const context = (model.body.messages as { content: string }[])[0].content;
  assertStringIncludes(context, `tomorrow: ${addCalendarDays(result.today, 1)}`);
  assertStringIncludes(model.body.system as string, "explicitly name the corresponding calendar date");
  assertStringIncludes(model.body.system as string, "Do not rely on extracted_state");
  assertIsolation(result);
});
