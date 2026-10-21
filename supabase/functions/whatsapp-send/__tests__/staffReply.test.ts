// A reply a member of staff sends supersedes the older pending AI drafts on
// that conversation, so nobody approves a second, overlapping answer later
// (#1063, Step 1). Only a signed-in staff member's successful text send does
// this; the agent's own sends (internal secret), templates and failed sends
// never do. The outbound row of a staff reply is marked `sent_by: "staff"` in
// `raw`, so the agent can later recognise a customer message staff answered.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  SUPABASE_ANON_KEY: "test-anon",
  META_ACCESS_TOKEN: "test-meta",
  META_PHONE_NUMBER_ID: "123456",
  SEND_INTERNAL_SECRET: "test-send",
})) Deno.env.set(key, value);
const { handleSendRequest } = await import("../handler.ts?staff-reply");

interface Call { method: string; host: string; path: string; params: URLSearchParams; body: unknown }

interface PendingDraft { id: string; tool_calls?: Record<string, unknown> | null }

interface Scenario {
  body: Record<string, unknown>;
  /** true: a signed-in member of staff. false: the internal secret (the agent). */
  staff: boolean;
  /** Older pending drafts on the conversation, as the supersede lookup returns them. */
  pending?: PendingDraft[];
  /** Pending booking actions attached to drafts, by draft id. */
  heldBy?: string[];
  metaFails?: boolean;
  /** The supersede lookup itself fails. */
  supersedeFails?: boolean;
}

const NOW = () => new Date().toISOString();

async function run({ body, staff, pending = [], heldBy = [], metaFails = false, supersedeFails = false }: Scenario) {
  const calls: Call[] = [];
  const oldFetch = globalThis.fetch;
  const oldError = console.error;
  console.error = () => {};
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    let parsed: unknown = null;
    try {
      parsed = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      parsed = String(init?.body ?? "");
    }
    calls.push({ method, host: url.hostname, path: url.pathname, params: url.searchParams, body: parsed });
    const headers = new Headers(init?.headers);
    const single = (headers.get("accept") ?? "").includes("vnd.pgrst.object");
    const reply = (value: unknown, status = 200) =>
      Response.json(single && Array.isArray(value) ? value[0] ?? null : value, { status });
    const p = url.searchParams;

    if (url.hostname === "graph.facebook.com") {
      if (metaFails) return reply({ error: { message: "boom", code: 131000 } }, 500);
      return reply({ messaging_product: "whatsapp", contacts: [], messages: [{ id: "wamid.staff" }] });
    }
    if (url.pathname === "/auth/v1/user") return reply({ id: "staff-user-1", aud: "authenticated", role: "authenticated" });
    if (url.pathname === "/rest/v1/rpc/is_staff") return reply(true);
    if (url.pathname === "/rest/v1/humans") return reply([{ id: "h-1", phone: "07700 900123", whatsapp_opted_out: false }]);
    if (url.pathname === "/rest/v1/whatsapp_booking_actions") {
      return reply(heldBy.map((draft_id) => ({ draft_id })));
    }
    if (url.pathname === "/rest/v1/whatsapp_drafts") {
      if (method === "PATCH") return reply([{ id: "patched" }]);
      // The supersede lookup: this conversation's older pending drafts.
      if (p.has("created_at")) {
        if (supersedeFails) return reply({ message: "connection reset" }, 500);
        return reply(pending);
      }
      // The opt-out gate's look at the draft being approved.
      if ((p.get("select") ?? "").includes("tool_calls")) return reply([{ conversation_id: "conv-1", tool_calls: null }]);
      // Draft mode's own lookup of the draft being approved.
      return reply([{
        id: "draft-approved",
        conversation_id: "conv-1",
        proposed_text: "See you Monday!",
        state: "pending",
        whatsapp_conversations: { id: "conv-1", phone_e164: "+447700900123", last_inbound_at: NOW() },
      }]);
    }
    if (url.pathname === "/rest/v1/whatsapp_conversations") {
      if (method !== "GET") return reply([], 201);
      return reply([{ id: "conv-1", human_id: "h-1", phone_e164: "+447700900123", last_inbound_at: NOW() }]);
    }
    if (url.pathname === "/rest/v1/whatsapp_messages") return reply([{ id: "msg-1" }], 201);
    return reply([]);
  };
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (staff) headers.authorization = "Bearer staff-jwt";
    else headers["x-internal-secret"] = "test-send";
    const response = await handleSendRequest(
      new Request("http://send.test", { method: "POST", headers, body: JSON.stringify(body) }),
    );
    return { status: response.status, json: await response.json(), calls };
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldError;
  }
}

const MANUAL = { mode: "manual", conversation_id: "conv-1", text: "Yes, 9am is fine" };
const APPROVE = { mode: "draft", draft_id: "draft-approved" };

/** The PATCHes that supersede drafts (not the draft-mode claim of the approved draft). */
const supersedes = (calls: Call[]) =>
  calls.filter((c) =>
    c.method === "PATCH"
    && c.path === "/rest/v1/whatsapp_drafts"
    && (c.body as Record<string, unknown>)?.state === "superseded"
  );
const outbound = (calls: Call[]) =>
  calls.find((c) => c.method === "POST" && c.path === "/rest/v1/whatsapp_messages");

Deno.test("a staff manual reply supersedes the conversation's older pending drafts", async () => {
  const { status, calls } = await run({ body: MANUAL, staff: true, pending: [{ id: "d-old" }, { id: "d-older" }] });
  assertEquals(status, 200);
  const [patch] = supersedes(calls);
  assert(patch, "the older drafts were superseded");
  assertEquals((patch.body as Record<string, unknown>).rejected_reason, "staff_replied");
  assertEquals(patch.params.get("id"), "in.(d-old,d-older)");
  assertEquals(patch.params.get("state"), "eq.pending", "only drafts still pending are touched");
  // The lookup is scoped to this conversation, to pending drafts, and to drafts
  // created before the reply, so a draft written after it survives.
  const lookup = calls.find((c) => c.method === "GET" && c.path === "/rest/v1/whatsapp_drafts" && c.params.has("created_at"));
  assert(lookup);
  assertEquals(lookup.params.get("conversation_id"), "eq.conv-1");
  assertEquals(lookup.params.get("state"), "eq.pending");
  assert((lookup.params.get("created_at") ?? "").startsWith("lt."), lookup.params.get("created_at") ?? "");
});

Deno.test("a staff manual reply is marked sent_by staff, beside Meta's own keys", async () => {
  const { calls } = await run({ body: MANUAL, staff: true });
  const raw = (outbound(calls)?.body as Record<string, unknown>)?.raw as Record<string, unknown>;
  assertEquals(raw.sent_by, "staff");
  assertEquals((raw.messages as { id: string }[])[0].id, "wamid.staff", "readers of raw.messages[0].id still work");
});

Deno.test("staff approving a draft supersedes its older siblings, and is marked as staff", async () => {
  const { status, calls } = await run({ body: APPROVE, staff: true, pending: [{ id: "d-sibling" }] });
  assertEquals(status, 200);
  const [patch] = supersedes(calls);
  assert(patch);
  assertEquals(patch.params.get("id"), "in.(d-sibling)");
  const raw = (outbound(calls)?.body as Record<string, unknown>)?.raw as Record<string, unknown>;
  assertEquals(raw.sent_by, "staff");
});

Deno.test("the approved draft itself is never superseded, even if the lookup returns it", async () => {
  const { calls } = await run({ body: APPROVE, staff: true, pending: [{ id: "draft-approved" }] });
  assertEquals(supersedes(calls).length, 0);
});

Deno.test("the agent's own auto-send (internal secret, draft mode) supersedes nothing and is not marked", async () => {
  const { status, calls } = await run({ body: APPROVE, staff: false, pending: [{ id: "d-sibling" }] });
  assertEquals(status, 200);
  assertEquals(supersedes(calls).length, 0);
  const raw = (outbound(calls)?.body as Record<string, unknown>)?.raw as Record<string, unknown>;
  assertEquals(raw.sent_by, undefined);
});

Deno.test("an internal-secret manual send supersedes nothing and is not marked", async () => {
  // apply-customer-confirm and the agent's acknowledgement path both send
  // manual text with the internal secret; neither is a member of staff.
  const { status, calls } = await run({ body: MANUAL, staff: false, pending: [{ id: "d-old" }] });
  assertEquals(status, 200);
  assertEquals(supersedes(calls).length, 0);
  const raw = (outbound(calls)?.body as Record<string, unknown>)?.raw as Record<string, unknown>;
  assertEquals(raw.sent_by, undefined);
});

Deno.test("a STOP acknowledgement draft survives a staff reply", async () => {
  const { calls } = await run({
    body: MANUAL,
    staff: true,
    pending: [
      { id: "d-ack", tool_calls: { opt_out_acknowledgement: true } },
      { id: "d-ack-text", tool_calls: { opt_out_acknowledgement: "true" } },
      { id: "d-plain", tool_calls: { intent: "general" } },
    ],
  });
  const [patch] = supersedes(calls);
  assertEquals(patch.params.get("id"), "in.(d-plain)");
});

Deno.test("a draft with a pending booking action attached is left alone", async () => {
  const { calls } = await run({ body: MANUAL, staff: true, pending: [{ id: "d-booking" }, { id: "d-plain" }], heldBy: ["d-booking"] });
  const [patch] = supersedes(calls);
  assertEquals(patch.params.get("id"), "in.(d-plain)");
  // Nothing is superseded when every candidate is held.
  const allHeld = await run({ body: MANUAL, staff: true, pending: [{ id: "d-booking" }], heldBy: ["d-booking"] });
  assertEquals(supersedes(allHeld.calls).length, 0);
});

Deno.test("a failed Meta send leaves every draft pending", async () => {
  const { status, calls } = await run({ body: MANUAL, staff: true, pending: [{ id: "d-old" }], metaFails: true });
  assertEquals(status, 502);
  assertEquals(supersedes(calls).length, 0);
  assertEquals(calls.filter((c) => c.path === "/rest/v1/whatsapp_drafts" && c.params.has("created_at")).length, 0);
});

Deno.test("a supersede failure does not fail the send: the message has already gone", async () => {
  const { status, json, calls } = await run({ body: MANUAL, staff: true, supersedeFails: true });
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assertEquals(supersedes(calls).length, 0);
});

Deno.test("no older pending drafts means no update at all", async () => {
  const { status, calls } = await run({ body: MANUAL, staff: true, pending: [] });
  assertEquals(status, 200);
  assertEquals(supersedes(calls).length, 0);
  assertEquals(calls.filter((c) => c.path === "/rest/v1/whatsapp_booking_actions").length, 0);
});

Deno.test("a staff template send supersedes nothing", async () => {
  const { status, calls } = await run({
    body: { mode: "template", to: "+447700900123", template_name: "booking_confirmed_v1", params: ["Bella", "Mon 20 Oct", "09:00"] },
    staff: true,
    pending: [{ id: "d-old" }],
  });
  assertEquals(status, 200);
  assertEquals(supersedes(calls).length, 0);
});
