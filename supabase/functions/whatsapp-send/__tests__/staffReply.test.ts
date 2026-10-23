// A reply a member of staff sends supersedes the older pending AI drafts on
// that conversation, so nobody approves a second, overlapping answer later
// (#1063, Step 1). Only a signed-in staff member's successful text send does
// this; the agent's own sends (internal secret), templates and failed sends
// never do. The outbound row of a staff reply is marked `sent_by: "staff"` in
// `raw`, so the agent can later recognise a customer message staff answered.
//
// Write-path rule (AGENTS.md): these tests assert the rows that end up in
// the tables, not the arguments handed to the client. `whatsapp_drafts` and
// `whatsapp_messages` are in-memory tables that apply the same `eq`, `lt` and
// `in` filters PostgREST would, so a wrong filter supersedes the wrong rows
// here exactly as it would in the database.
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

type Row = Record<string, unknown>;

interface DraftRow extends Row {
  id: string;
  conversation_id: string;
  state: string;
  created_at: string;
  proposed_text: string;
  tool_calls: Record<string, unknown> | null;
  rejected_reason: string | null;
  decided_at: string | null;
}

interface Scenario {
  body: Record<string, unknown>;
  /** true: a signed-in member of staff. false: the internal secret (the agent). */
  staff: boolean;
  /** The whatsapp_drafts table before the request. */
  drafts?: DraftRow[];
  /** Draft ids with a pending booking action attached. */
  heldBy?: string[];
  metaFails?: boolean;
  /** Every read of the drafts table after the send fails. */
  supersedeFails?: boolean;
}

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const later = () => new Date(Date.now() + HOUR).toISOString();

function draft(id: string, extra: Partial<DraftRow> = {}): DraftRow {
  return {
    id,
    conversation_id: "conv-1",
    state: "pending",
    created_at: ago(HOUR),
    proposed_text: `reply ${id}`,
    tool_calls: null,
    rejected_reason: null,
    decided_at: null,
    ...extra,
  };
}

/** The draft staff approve in draft mode. */
const APPROVED = () => draft("draft-approved", { created_at: ago(2 * HOUR) });

/** PostgREST horizontal filters: eq, lt and in, as the handler uses them. */
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, raw] of params) {
    if (key === "select" || key === "order" || key === "limit") continue;
    const dot = raw.indexOf(".");
    const op = raw.slice(0, dot);
    const value = raw.slice(dot + 1);
    const cell = row[key];
    if (op === "eq" && String(cell) !== value) return false;
    if (op === "lt" && !(String(cell) < value)) return false;
    if (op === "in") {
      const list = value.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
      if (!list.includes(String(cell))) return false;
    }
  }
  return true;
}

async function run({ body, staff, drafts = [], heldBy = [], metaFails = false, supersedeFails = false }: Scenario) {
  const draftsTable: DraftRow[] = drafts.map((d) => ({ ...d }));
  const messagesTable: Row[] = [];
  let sent = false;
  const oldFetch = globalThis.fetch;
  const oldError = console.error;
  console.error = () => {};
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const parsed = init?.body ? JSON.parse(String(init.body)) : null;
    const headers = new Headers(init?.headers);
    const single = (headers.get("accept") ?? "").includes("vnd.pgrst.object");
    const reply = (value: unknown, status = 200) =>
      Response.json(single && Array.isArray(value) ? value[0] ?? null : value, { status });
    const p = url.searchParams;

    if (url.hostname === "graph.facebook.com") {
      if (metaFails) return reply({ error: { message: "boom", code: 131000 } }, 500);
      sent = true;
      return reply({ messaging_product: "whatsapp", contacts: [], messages: [{ id: "wamid.staff" }] });
    }
    if (url.pathname === "/auth/v1/user") return reply({ id: "staff-user-1", aud: "authenticated", role: "authenticated" });
    if (url.pathname === "/rest/v1/rpc/is_staff") return reply(true);
    if (url.pathname === "/rest/v1/humans") return reply([{ id: "h-1", phone: "07700 900123", whatsapp_opted_out: false }]);
    if (url.pathname === "/rest/v1/whatsapp_booking_actions") {
      const actions = heldBy.map((draft_id) => ({ draft_id, state: "pending" }));
      return reply(actions.filter((a) => matches(a, p)).map(({ draft_id }) => ({ draft_id })));
    }
    if (url.pathname === "/rest/v1/whatsapp_drafts") {
      if (supersedeFails && sent) return reply({ message: "connection reset" }, 500);
      const hit = draftsTable.filter((row) => matches(row, p));
      if (method === "PATCH") {
        for (const row of hit) Object.assign(row, parsed);
        if (single && hit.length === 0) return reply({ message: "no rows" }, 406);
        return reply(hit.map((row) => ({ id: row.id })));
      }
      // Draft mode's lookup embeds the conversation.
      const withConversation = (p.get("select") ?? "").includes("whatsapp_conversations");
      return reply(hit.map((row) => withConversation
        ? { ...row, whatsapp_conversations: { id: "conv-1", phone_e164: "+447700900123", last_inbound_at: ago(1000) } }
        : row));
    }
    if (url.pathname === "/rest/v1/whatsapp_conversations") {
      if (method !== "GET") return reply([], 201);
      return reply([{ id: "conv-1", human_id: "h-1", phone_e164: "+447700900123", last_inbound_at: ago(1000) }]);
    }
    if (url.pathname === "/rest/v1/whatsapp_messages") {
      if (method === "POST") messagesTable.push(parsed as Row);
      return reply([{ id: "msg-1" }], 201);
    }
    return reply([]);
  };
  try {
    const reqHeaders: Record<string, string> = { "content-type": "application/json" };
    if (staff) reqHeaders.authorization = "Bearer staff-jwt";
    else reqHeaders["x-internal-secret"] = "test-send";
    const response = await handleSendRequest(
      new Request("http://send.test", { method: "POST", headers: reqHeaders, body: JSON.stringify(body) }),
    );
    const byId = (id: string) => draftsTable.find((d) => d.id === id)!;
    return { status: response.status, json: await response.json(), drafts: byId, draftsTable, messagesTable };
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldError;
  }
}

const MANUAL = { mode: "manual", conversation_id: "conv-1", text: "Yes, 9am is fine" };
const APPROVE = { mode: "draft", draft_id: "draft-approved" };

function assertSuperseded(row: DraftRow) {
  assertEquals(row.state, "superseded", `${row.id} should be superseded`);
  assertEquals(row.rejected_reason, "staff_replied");
  assert(row.decided_at && !Number.isNaN(Date.parse(row.decided_at)), `${row.id} has a decision time`);
}

function assertUntouched(row: DraftRow) {
  assertEquals(row.state, "pending", `${row.id} should still be pending`);
  assertEquals(row.rejected_reason, null);
  assertEquals(row.decided_at, null);
}

Deno.test("a staff manual reply supersedes the conversation's older pending drafts, and only those", async () => {
  const { status, drafts } = await run({
    body: MANUAL,
    staff: true,
    drafts: [
      draft("d-old"),
      draft("d-older", { created_at: ago(5 * HOUR) }),
      draft("d-after", { created_at: later() }),
      draft("d-other-conv", { conversation_id: "conv-2" }),
      draft("d-rejected", { state: "rejected", rejected_reason: "staff_rejected" }),
    ],
  });
  assertEquals(status, 200);
  assertSuperseded(drafts("d-old"));
  assertSuperseded(drafts("d-older"));
  assertUntouched(drafts("d-after"));
  assertUntouched(drafts("d-other-conv"));
  assertEquals(drafts("d-rejected").state, "rejected", "a decided draft keeps its decision");
  assertEquals(drafts("d-rejected").rejected_reason, "staff_rejected");
});

Deno.test("a staff manual reply is stored marked sent_by staff, beside Meta's own keys", async () => {
  const { messagesTable } = await run({ body: MANUAL, staff: true });
  assertEquals(messagesTable.length, 1);
  const raw = messagesTable[0].raw as Record<string, unknown>;
  assertEquals(raw.sent_by, "staff");
  assertEquals((raw.messages as { id: string }[])[0].id, "wamid.staff", "readers of raw.messages[0].id still work");
  assertEquals(messagesTable[0].direction, "outbound");
});

Deno.test("staff approving a draft supersedes its older siblings; the approved draft is approved, not superseded", async () => {
  const { status, drafts, messagesTable } = await run({ body: APPROVE, staff: true, drafts: [APPROVED(), draft("d-sibling")] });
  assertEquals(status, 200);
  assertSuperseded(drafts("d-sibling"));
  assertEquals(drafts("draft-approved").state, "approved");
  assertEquals(drafts("draft-approved").rejected_reason, null);
  assertEquals((messagesTable[0].raw as Record<string, unknown>).sent_by, "staff");
});

Deno.test("the agent's own auto-send (internal secret, draft mode) supersedes nothing and is not marked", async () => {
  const { status, drafts, messagesTable } = await run({ body: APPROVE, staff: false, drafts: [APPROVED(), draft("d-sibling")] });
  assertEquals(status, 200);
  assertUntouched(drafts("d-sibling"));
  assertEquals((messagesTable[0].raw as Record<string, unknown>).sent_by, undefined);
});

Deno.test("an internal-secret manual send supersedes nothing and is not marked", async () => {
  // apply-customer-confirm and the agent's acknowledgement path both send
  // manual text with the internal secret; neither is a member of staff.
  const { status, drafts, messagesTable } = await run({ body: MANUAL, staff: false, drafts: [draft("d-old")] });
  assertEquals(status, 200);
  assertUntouched(drafts("d-old"));
  assertEquals((messagesTable[0].raw as Record<string, unknown>).sent_by, undefined);
});

Deno.test("a STOP acknowledgement draft survives a staff reply", async () => {
  const { drafts } = await run({
    body: MANUAL,
    staff: true,
    drafts: [
      draft("d-ack", { tool_calls: { opt_out_acknowledgement: true } }),
      draft("d-ack-text", { tool_calls: { opt_out_acknowledgement: "true" } }),
      draft("d-plain", { tool_calls: { intent: "general" } }),
    ],
  });
  assertUntouched(drafts("d-ack"));
  assertUntouched(drafts("d-ack-text"));
  assertSuperseded(drafts("d-plain"));
});

Deno.test("a draft with a pending booking action attached is left alone", async () => {
  const { drafts } = await run({ body: MANUAL, staff: true, drafts: [draft("d-booking"), draft("d-plain")], heldBy: ["d-booking"] });
  assertUntouched(drafts("d-booking"));
  assertSuperseded(drafts("d-plain"));
});

Deno.test("a failed Meta send leaves every draft pending and stores no message", async () => {
  const { status, drafts, messagesTable } = await run({ body: MANUAL, staff: true, drafts: [draft("d-old")], metaFails: true });
  assertEquals(status, 502);
  assertUntouched(drafts("d-old"));
  assertEquals(messagesTable.length, 0);
});

Deno.test("a supersede failure does not fail the send: the message has already gone", async () => {
  const { status, json, drafts, messagesTable } = await run({ body: MANUAL, staff: true, drafts: [draft("d-old")], supersedeFails: true });
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assertEquals(messagesTable.length, 1, "the reply is recorded");
  assertUntouched(drafts("d-old"));
});

Deno.test("a repeat staff reply is a no-op for drafts already superseded", async () => {
  const first = await run({ body: MANUAL, staff: true, drafts: [draft("d-old")] });
  const decidedAt = first.drafts("d-old").decided_at;
  const second = await run({ body: MANUAL, staff: true, drafts: first.draftsTable });
  assertSuperseded(second.drafts("d-old"));
  assertEquals(second.drafts("d-old").decided_at, decidedAt, "the original decision time is kept");
});

Deno.test("a staff template send supersedes nothing", async () => {
  const { status, drafts } = await run({
    body: { mode: "template", to: "+447700900123", template_name: "booking_confirmed_v1", params: ["Bella", "Mon 20 Oct", "09:00"] },
    staff: true,
    drafts: [draft("d-old")],
  });
  assertEquals(status, 200);
  assertUntouched(drafts("d-old"));
});
