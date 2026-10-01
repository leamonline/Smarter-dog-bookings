export {};

/** Offline-only capture of the actual handler request. Every fetch is intercepted. */
const [root, fixturesPath, output, mode] = Deno.args;
const fixtures = JSON.parse(await Deno.readTextFile(fixturesPath));
const NativeDate = Date;
class FixedDate extends NativeDate {
  constructor(value?: string | number | Date) { super(value === undefined ? fixtures.now : value instanceof NativeDate ? value.getTime() : value); }
  static override now() { return NativeDate.parse(fixtures.now); }
}
globalThis.Date = FixedDate as DateConstructor;
for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "synthetic-key",
  ANTHROPIC_API_KEY: "synthetic-key", AGENT_CALLBACK_SECRET: "synthetic-secret", CLAUDE_MODEL: "claude-sonnet-4-6",
  AI_KNOWN_CUSTOMER_REVIEW_DRAFTS: "true", AI_ASSISTANT_ENABLED: "true", AI_AUTO_SEND_LOW_RISK: "false",
  AI_AUTONOMOUS_BOOKING_ENABLED: "false", WHATSAPP_BOOK_ENTRY_ENABLED: "false", WHATSAPP_MANAGE_BOOKING_ENABLED: "false",
})) Deno.env.set(key, value);
const { handleAgentRequest } = await import(`${root}/supabase/functions/whatsapp-agent/handler.ts`);
const captures = [];
for (const fixture of fixtures.cases) {
  let captured: unknown;
  const reviewOnly = mode === "candidate" && /^Can I book/.test(fixture.text);
  const conversation = { id: "synthetic-conversation", human_id: "synthetic-human", phone_e164: "+447700900111", state: "ai_handling", auto_send_enabled: false, autonomous_booking_enabled: false, lead_status: null, lead_payload: null, agent_state: { dogName: "Pip", breed: "Cockapoo", dogSize: "small", service: "full-groom" } };
  const payload = { entry: [{ changes: [{ value: { messages: [{ id: `synthetic-${fixture.id}`, from: "447700900111", type: "text", text: { body: fixture.text }, timestamp: String(Date.now() / 1000) }] } }] }] };
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const reply = (data: unknown, status = 200) => Response.json(data, { status });
    if (url.hostname === "api.anthropic.com" && url.pathname === "/v1/messages") {
      captured = body;
      return reply({ content: [{ type: "text", text: JSON.stringify({ intent: "escalate", confidence: 0, proposed_text: "Synthetic capture placeholder" }) }], usage: {} });
    }
    if (url.hostname !== "supabase.test") throw new Error(`Blocked non-synthetic destination: ${url.hostname}`);
    if (url.pathname === "/rest/v1/whatsapp_events") return method === "PATCH" ? new Response(null, { status: 204 }) : reply({ id: "synthetic-event", processing_status: "pending", signature_valid: true, payload });
    if (url.pathname === "/rest/v1/humans") return url.searchParams.get("select")?.startsWith("name,") ? reply({ name: "Synthetic", surname: "Person" }) : reply([{ id: "synthetic-human", phone: "07700900111" }]);
    if (url.pathname === "/rest/v1/whatsapp_conversations" && (method === "GET" || method === "POST")) return reply(conversation);
    if (url.pathname === "/rest/v1/whatsapp_messages") return method === "POST" ? reply({ id: "synthetic-message" }, 201) : reply(fixture.history ?? []);
    if (url.pathname === "/rest/v1/dogs") return reply([{ id: "00000000-0000-4000-8000-000000000001", name: "Pip", breed: "Cockapoo", size: "small" }, ...(fixture.multiDog ? [{ id: "00000000-0000-4000-8000-000000000002", name: "Moss", breed: "Spaniel", size: "medium" }] : [])]);
    if (url.pathname === "/rest/v1/booking_policy_settings") return reply({ booking_horizon_days: 180 });
    if (url.pathname === "/rest/v1/bookings") {
      if (fixture.bookingError) return reply({ message: "synthetic lookup unavailable" }, 500);
      const filters = url.searchParams.getAll("booking_date");
      return reply((fixture.bookings ?? []).filter((row: { booking_date: string; status: string }) => filters.every((filter: string) => filter.startsWith("gte.") ? row.booking_date >= filter.slice(4) : row.booking_date <= filter.slice(4)) && (!url.searchParams.has("status") || row.status !== "Cancelled"))
        .map((row: Record<string, unknown>, i: number) => ({ id: `synthetic-booking-${i}`, service: "full-groom", confirmed: true, dogs: { name: "Pip" }, ...row })));
    }
    if (url.pathname === "/rest/v1/day_settings") return reply(fixture.exceptions ?? []);
    if (url.pathname === "/rest/v1/rpc/get_small_medium_availability") return reply(fixture.slots ?? []);
    if (url.pathname === "/rest/v1/rpc/get_large_dog_day_availability") return reply([]);
    if (url.pathname === "/rest/v1/whatsapp_drafts" && method === "POST") return reply({ id: "synthetic-draft" }, 201);
    throw new Error(`Unexpected read/write: ${method} ${url.pathname}`);
  };
  const response = await handleAgentRequest(new Request("http://agent.test", { method: "POST", headers: { "x-agent-secret": "synthetic-secret", "content-type": "application/json" }, body: JSON.stringify({ event_id: "synthetic-event", force_draft: !reviewOnly }) }));
  if (response.status !== 200 || !captured) throw new Error(`${fixture.id}: capture failed (${response.status})`);
  captures.push({ id: fixture.id, route: reviewOnly ? "automatic-review-only" : "staff-forced", request: captured });
}
await Deno.writeTextFile(output, JSON.stringify(captures, null, 2));
