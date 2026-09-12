// ============================================================
// Dispatch-contract tests for the whatsapp-agent Edge Function.
//
// Runs under `deno test` (NOT vitest — the handler imports Deno
// globals and remote esm.sh modules). The pure decision logic
// (risk classification, auto-send gates, message parsing) is
// already covered under vitest via src/lib/ai/*; what was never
// tested before is the dispatch loop itself: auth, idempotency,
// signature handling, status routing, the AI-on-demand skip and
// the failed-event bookkeeping.
//
// Strategy: stub globalThis.fetch with a PostgREST-shaped router
// BEFORE importing the handler, so supabase-js and the Anthropic
// call both hit the stub. Any request without an explicit route
// fails the test loudly (500) rather than vanishing.
//
// Run locally:  deno test --allow-env supabase/functions/whatsapp-agent/__tests__/
// CI: the agent-tests job in .github/workflows/ci.yml.
// ============================================================
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

// Module-scope env reads in handler.ts run at import time — set
// everything it dereferences with `!` first.
Deno.env.set("SUPABASE_URL", "http://supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("ANTHROPIC_API_KEY", "anthropic-test-key");
Deno.env.set("AGENT_CALLBACK_SECRET", "agent-secret");

interface RecordedCall {
  method: string;
  path: string;
  search: URLSearchParams;
  headers: Headers;
  body: unknown;
}

type Route = (call: RecordedCall) => Response | undefined;

let calls: RecordedCall[] = [];
let routes: Route[] = [];

function resetStub(...testRoutes: Route[]) {
  calls = [];
  routes = testRoutes;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = (input: URL | Request | string, init?: RequestInit) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const rawBody = init?.body ? String(init.body) : null;
  let body: unknown = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    body = rawBody;
  }
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  const call: RecordedCall = {
    method,
    path: url.pathname,
    search: url.searchParams,
    headers,
    body,
  };
  calls.push(call);
  for (const route of routes) {
    const res = route(call);
    if (res) return Promise.resolve(res);
  }
  // Unrouted request = the test forgot a stub. Fail loudly.
  return Promise.resolve(
    new Response(`no stub for ${method} ${url.pathname}${url.search}`, { status: 500 }),
  );
};

const { handleAgentRequest } = await import("../handler.ts");

function agentRequest(body: unknown, opts: { method?: string; secret?: string } = {}) {
  const method = opts.method ?? "POST";
  return new Request("http://localhost/whatsapp-agent", {
    method,
    headers: {
      "content-type": "application/json",
      "x-agent-secret": opts.secret ?? "agent-secret",
    },
    // GET/HEAD requests cannot carry a body per the fetch spec.
    ...(method === "GET" || method === "HEAD"
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

// ── Route helpers ────────────────────────────────────────────

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    signature_valid: true,
    processing_status: "pending",
    payload: {},
    ...overrides,
  };
}

const eventSelect = (row: Record<string, unknown>): Route => (call) =>
  call.method === "GET" && call.path === "/rest/v1/whatsapp_events"
    ? json(row)
    : undefined;

const eventUpdate: Route = (call) =>
  call.method === "PATCH" && call.path === "/rest/v1/whatsapp_events"
    ? new Response(null, { status: 204 })
    : undefined;

function lastEventPatch(): Record<string, unknown> | null {
  const patch = calls.findLast(
    (c) => c.method === "PATCH" && c.path === "/rest/v1/whatsapp_events",
  );
  return (patch?.body as Record<string, unknown>) ?? null;
}

// ── Guard-rail tests (no DB traffic at all) ──────────────────

Deno.test("rejects non-POST methods", async () => {
  resetStub();
  const res = await handleAgentRequest(agentRequest({}, { method: "GET" }));
  assertEquals(res.status, 405);
  assertEquals(calls.length, 0);
});

Deno.test("rejects a missing or wrong shared secret", async () => {
  resetStub();
  const res = await handleAgentRequest(agentRequest({ event_id: "event-1" }, { secret: "wrong" }));
  assertEquals(res.status, 401);
  assertEquals(calls.length, 0);
});

Deno.test("rejects an unparsable body", async () => {
  resetStub();
  const res = await handleAgentRequest(agentRequest("{not json"));
  assertEquals(res.status, 400);
});

Deno.test("rejects a body without event_id", async () => {
  resetStub();
  const res = await handleAgentRequest(agentRequest({ force_draft: true }));
  assertEquals(res.status, 400);
  assertStringIncludes(await res.text(), "missing event_id");
});

// ── Event-row handling ───────────────────────────────────────

Deno.test("404s when the event row does not exist", async () => {
  resetStub((call) =>
    call.method === "GET" && call.path === "/rest/v1/whatsapp_events"
      ? json({ code: "PGRST116", message: "0 rows", details: null, hint: null }, 406)
      : undefined,
  );
  const res = await handleAgentRequest(agentRequest({ event_id: "missing" }));
  assertEquals(res.status, 404);
});

Deno.test("skips an already-processed event without writing anything", async () => {
  resetStub(eventSelect(eventRow({ processing_status: "processed" })));
  const res = await handleAgentRequest(agentRequest({ event_id: "event-1" }));
  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "already processed");
  assertEquals(
    calls.filter((c) => c.method !== "GET").length,
    0,
    "idempotency skip must not write",
  );
});

Deno.test("marks an invalid-signature event ignored and stops", async () => {
  resetStub(eventSelect(eventRow({ signature_valid: false })), eventUpdate);
  const res = await handleAgentRequest(agentRequest({ event_id: "event-1" }));
  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "ignored");
  assertEquals(lastEventPatch()?.processing_status, "ignored");
});

// ── Status updates ───────────────────────────────────────────

Deno.test("routes Meta status updates onto the outbound message row", async () => {
  const payload = {
    entry: [{
      changes: [{
        value: {
          statuses: [{ id: "wamid.abc", status: "read", timestamp: "1750000000" }],
        },
      }],
    }],
  };
  resetStub(
    eventSelect(eventRow({ payload })),
    eventUpdate,
    (call) =>
      call.method === "PATCH" && call.path === "/rest/v1/whatsapp_messages"
        ? new Response(null, { status: 204 })
        : undefined,
  );

  const res = await handleAgentRequest(agentRequest({ event_id: "event-1" }));
  assertEquals(res.status, 200);

  const statusPatch = calls.find(
    (c) => c.method === "PATCH" && c.path === "/rest/v1/whatsapp_messages",
  );
  assert(statusPatch, "expected a whatsapp_messages PATCH");
  const patchBody = statusPatch.body as Record<string, unknown>;
  assertEquals(patchBody.status, "read");
  assert(typeof patchBody.read_at === "string", "read timestamp should be stamped");
  assertEquals(
    statusPatch.search.get("meta_message_id"),
    "eq.wamid.abc",
    "patch must target the Meta message id",
  );
  assertEquals(lastEventPatch()?.processing_status, "processed");
});

// ── Inbound messages ─────────────────────────────────────────

const inboundPayload = {
  entry: [{
    changes: [{
      value: {
        messages: [{
          from: "447700900111",
          id: "wamid.msg1",
          timestamp: "1750000000",
          type: "text",
          text: { body: "Hi, can I book Bella in?" },
        }],
      },
    }],
  }],
};

function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    state: "human_takeover",
    human_id: "human-1",
    phone_e164: "+447700900111",
    auto_send_enabled: false,
    autonomous_booking_enabled: false,
    agent_state: {},
    lead_status: null,
    lead_payload: null,
    ...overrides,
  };
}

Deno.test("persists a known customer's inbound but draws no AI draft without force_draft", async () => {
  resetStub(
    eventSelect(eventRow({ payload: inboundPayload })),
    eventUpdate,
    (call) =>
      call.method === "GET" && call.path === "/rest/v1/humans"
        ? json([{ id: "human-1", phone: "07700900111" }])
        : undefined,
    (call) =>
      call.method === "POST" && call.path === "/rest/v1/whatsapp_conversations"
        ? json(conversationRow(), 201)
        : undefined,
    (call) =>
      call.method === "POST" && call.path === "/rest/v1/whatsapp_messages"
        ? json({ id: "msg-1" }, 201)
        : undefined,
  );

  const res = await handleAgentRequest(agentRequest({ event_id: "event-1" }));
  assertEquals(res.status, 200);

  // The conversation upsert must carry the phone + channel composite key
  // and must NOT write unread_count (migration 029's trigger owns that).
  const upsert = calls.find(
    (c) => c.method === "POST" && c.path === "/rest/v1/whatsapp_conversations",
  );
  assert(upsert, "expected a conversation upsert");
  const upsertBody = upsert.body as Record<string, unknown>;
  assertEquals(upsertBody.phone_e164, "+447700900111");
  assertEquals(upsertBody.channel, "whatsapp");
  assertEquals(upsertBody.human_id, "human-1");
  assert(!("unread_count" in upsertBody), "unread_count belongs to the DB trigger");

  // Inbound message persisted…
  const insert = calls.find(
    (c) => c.method === "POST" && c.path === "/rest/v1/whatsapp_messages",
  );
  assert(insert, "expected a whatsapp_messages insert");
  const insertBody = insert.body as Record<string, unknown>;
  assertEquals(insertBody.direction, "inbound");
  assertEquals(insertBody.content, "Hi, can I book Bella in?");

  // …but a KNOWN customer never gets an automatic draft: AI on demand.
  assertEquals(
    calls.filter((c) => c.path.includes("anthropic")).length,
    0,
    "no Claude call without force_draft",
  );
  assertEquals(
    calls.filter((c) => c.path === "/rest/v1/whatsapp_drafts").length,
    0,
    "no draft row without force_draft",
  );
  assertEquals(lastEventPatch()?.processing_status, "processed");
});

Deno.test("a duplicate inbound (Meta redelivery / concurrent re-run) is marked ignored, not failed", async () => {
  // Concurrency/redelivery: two invocations of the same pending event both
  // pass the status guard; one wins the whatsapp_messages insert and the
  // other collides with idx_whatsapp_messages_meta_msg. The webhook path (no
  // force_draft) must treat that collision as a no-op — event 'ignored', not
  // 'failed', so it stays off the "AI agent issues" card — and must not draft
  // a second reply. Model the collision so a regression (back to 'failed')
  // fails loudly.
  resetStub(
    eventSelect(eventRow({ payload: inboundPayload })),
    eventUpdate,
    (call) =>
      call.method === "GET" && call.path === "/rest/v1/humans"
        ? json([{ id: "human-1", phone: "07700900111" }])
        : undefined,
    (call) =>
      call.method === "POST" && call.path === "/rest/v1/whatsapp_conversations"
        ? json(conversationRow(), 201)
        : undefined,
    (call) =>
      call.method === "POST" && call.path === "/rest/v1/whatsapp_messages"
        ? json(
          {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "idx_whatsapp_messages_meta_msg"',
          },
          409,
        )
        : undefined,
  );

  const res = await handleAgentRequest(agentRequest({ event_id: "event-1" }));
  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "ignored");

  // Event settled as ignored (not failed), with the error cleared. The update
  // is guarded on still-pending so it can't downgrade a winning run.
  const patch = lastEventPatch();
  assertEquals(patch?.processing_status, "ignored");
  assertEquals(patch?.error_message, null);
  assertEquals(patch?.["processing_status"] === "failed", false);

  // No second reply: no Claude call, no draft row.
  assertEquals(
    calls.filter((c) => c.path === "/v1/messages").length,
    0,
    "duplicate inbound must not call Claude",
  );
  assertEquals(
    calls.filter((c) => c.path === "/rest/v1/whatsapp_drafts").length,
    0,
    "duplicate inbound must not create a draft",
  );
});

Deno.test("runs the Claude path for an unknown customer and saves a pending draft", async () => {
  const claudeReply = {
    content: [{
      type: "text",
      text: JSON.stringify({
        intent: "faq",
        confidence: 0.9,
        proposed_text: "We're open Monday to Wednesday, 8:30am till 3pm.",
      }),
    }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
  resetStub(
    eventSelect(eventRow({ payload: inboundPayload })),
    eventUpdate,
    (call) =>
      call.method === "GET" && call.path === "/rest/v1/humans" ? json([]) : undefined,
    (call) =>
      call.method === "POST" && call.path === "/rest/v1/whatsapp_conversations"
        ? json(conversationRow({ human_id: null, state: "ai_handling" }), 201)
        : undefined,
    (call) =>
      call.path === "/rest/v1/whatsapp_messages"
        ? call.method === "POST"
          ? json({ id: "msg-1" }, 201)
          : json([{ id: "msg-1" }])
        : undefined,
    (call) =>
      call.path === "/v1/messages" && call.headers.get("x-api-key") === "anthropic-test-key"
        ? json(claudeReply)
        : undefined,
    // buildContext reads recent messages + availability RPCs; let the
    // generic GET/RPC reads return empty sets.
    (call) =>
      call.method === "GET" || call.path.startsWith("/rest/v1/rpc/")
        ? json([])
        : undefined,
    (call) =>
      call.method === "POST" && call.path === "/rest/v1/whatsapp_drafts"
        ? json({ id: "draft-1" }, 201)
        : undefined,
    (call) =>
      call.method === "PATCH" && call.path === "/rest/v1/whatsapp_conversations"
        ? new Response(null, { status: 204 })
        : undefined,
  );

  const res = await handleAgentRequest(agentRequest({ event_id: "event-1" }));
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "ok");

  const draftInsert = calls.find(
    (c) => c.method === "POST" && c.path === "/rest/v1/whatsapp_drafts",
  );
  assert(draftInsert, "expected a whatsapp_drafts insert");
  const draftBody = draftInsert.body as Record<string, unknown>;
  assertEquals(draftBody.state, "pending");
  assertEquals(draftBody.intent, "faq");
  assertEquals(draftBody.requires_approval, true);
  // Auto-send is globally off in this test env, so the draft must be
  // held for staff regardless of its low risk.
  assertEquals(draftBody.auto_send_eligible, false);
  assertEquals(
    calls.filter((c) => c.path.endsWith("/functions/v1/whatsapp-send")).length,
    0,
    "held drafts must not be dispatched to whatsapp-send",
  );
  assertEquals(lastEventPatch()?.processing_status, "processed");
});

Deno.test("keeps later dates honest and only shows RPC-verified small-dog slots to Claude", async () => {
  // Monday and Tuesday are default-open salon days. Return a Monday slot but
  // deliberately omit the Tuesday row: a missing row is not proof of closure.
  const verifiedDate = new Date();
  verifiedDate.setUTCHours(0, 0, 0, 0);
  while (verifiedDate.getUTCDay() !== 1) verifiedDate.setUTCDate(verifiedDate.getUTCDate() + 1);
  const missingDefaultOpenDate = new Date(verifiedDate);
  missingDefaultOpenDate.setUTCDate(missingDefaultOpenDate.getUTCDate() + 1);
  const verifiedIso = verifiedDate.toISOString().slice(0, 10);
  const missingIso = missingDefaultOpenDate.toISOString().slice(0, 10);
  const promptDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  let anthropicRequest: RecordedCall | null = null;

  resetStub(
    eventSelect(eventRow({ payload: inboundPayload, processing_status: "processed" })),
    eventUpdate,
    (call) =>
      call.method === "GET" && call.path === "/rest/v1/humans"
        ? call.search.has("phone")
          ? json([{ id: "human-1", phone: "07700900111" }])
          : json({ name: "Alex", surname: "Taylor", notes: null, history_flag: null })
        : undefined,
    (call) =>
      call.method === "POST" && call.path === "/rest/v1/whatsapp_conversations"
        ? json(conversationRow({ state: "human_takeover" }), 201)
        : undefined,
    (call) =>
      call.method === "GET" && call.path === "/rest/v1/whatsapp_messages"
        ? json([])
        : undefined,
    (call) =>
      call.method === "GET" && (call.path === "/rest/v1/dogs" || call.path === "/rest/v1/bookings")
        ? json([])
        : undefined,
    (call) =>
      call.method === "POST" && call.path === "/rest/v1/rpc/get_small_medium_availability"
        ? json([{ booking_date: verifiedIso, slot: "09:00" }])
        : undefined,
    (call) =>
      call.method === "POST" && call.path === "/rest/v1/rpc/get_large_dog_day_availability"
        ? json([])
        : undefined,
    (call) =>
      call.path === "/v1/messages" && call.headers.get("x-api-key") === "anthropic-test-key"
        ? (anthropicRequest = call, json({
          content: [{
            type: "text",
            text: JSON.stringify({
              intent: "booking_query",
              confidence: 0.9,
              proposed_text: "Please use your account to see the later dates. 🎓🐶❤️ X",
            }),
          }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }))
        : undefined,
  );

  const res = await handleAgentRequest(
    agentRequest({ event_id: "event-1", suggest_only: true }),
  );
  assertEquals(res.status, 200);
  assert(anthropicRequest, "expected an Anthropic request through the real handler path");

  // The route callback mutates this after TypeScript's control-flow pass, so
  // retain the runtime assertion above and widen it for the captured request.
  const requestBody = (anthropicRequest as unknown as RecordedCall).body as {
    system: string;
    messages: Array<{ content: string }>;
  };
  const context = requestBody.messages[0]?.content ?? "";
  const approvedFurtherAheadWording =
    "I can show you the next couple of months here. If you’re looking further ahead, your account has everything up to six months — https://smarterdog.co.uk/book/login 🐾";
  const positiveVerificationRule =
    "Within every non-empty small/medium availability block, only the listed date-and-slot combinations are verified.";

  assertStringIncludes(requestBody.system, "unverified, not unavailable");
  assertStringIncludes(requestBody.system, positiveVerificationRule);
  assertStringIncludes(requestBody.system, approvedFurtherAheadWording);
  assertStringIncludes(requestBody.system, "🎓🐶❤️ X");
  assertStringIncludes(context, "https://smarterdog.co.uk/book/login");
  assertStringIncludes(context, `${promptDate(verifiedIso)}: 09:00`);
  assertStringIncludes(context, "Only the date-and-slot combinations listed above are verified.");
  assertStringIncludes(context, "Any missing date is unverified");
  assert(
    !context.includes(`${promptDate(missingIso)}: (closed)`),
    "a default-open date missing from RPC rows must not be labelled closed",
  );
  assert(
    !context.includes("you'll happily handle it if they prefer — just ask."),
    "the recognised-customer portal nudge must not promise reply-based handling",
  );
});

Deno.test("suggest_only re-draft does not re-insert the already-ingested inbound message", async () => {
  // Regression: the staff "Generate reply" button re-invokes the agent in
  // suggest_only mode (⇒ force_draft) for an event the webhook already
  // processed. The inbound message is therefore already in
  // whatsapp_messages, so a re-insert collides with the unique constraint
  // on meta_message_id. Before the fix that threw, the outer catch returned
  // a 200 "handled with error" body, and whatsapp-generate-reply surfaced
  // "The AI returned an unexpected response." The fix skips the insert on
  // force_draft. Model the collision so a regression fails loudly.
  const claudeReply = {
    content: [{
      type: "text",
      text: JSON.stringify({
        intent: "faq",
        confidence: 0.9,
        proposed_text: "We're open Monday to Wednesday — happy to book Bella in.",
      }),
    }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
  resetStub(
    eventSelect(eventRow({ payload: inboundPayload, processing_status: "processed" })),
    eventUpdate,
    (call) =>
      call.method === "GET" && call.path === "/rest/v1/humans"
        ? json([{ id: "human-1", phone: "07700900111" }])
        : undefined,
    (call) =>
      call.method === "POST" && call.path === "/rest/v1/whatsapp_conversations"
        ? json(conversationRow(), 201)
        : undefined,
    // If the agent re-inserts the inbound, the live unique constraint
    // fires. Reproduce that here so the old behaviour can't pass silently.
    (call) =>
      call.method === "POST" && call.path === "/rest/v1/whatsapp_messages"
        ? json(
          {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "idx_whatsapp_messages_meta_msg"',
          },
          409,
        )
        : undefined,
    (call) =>
      call.path === "/v1/messages" && call.headers.get("x-api-key") === "anthropic-test-key"
        ? json(claudeReply)
        : undefined,
    // buildContext reads recent messages + availability RPCs; empty sets.
    (call) =>
      call.method === "GET" || call.path.startsWith("/rest/v1/rpc/") ? json([]) : undefined,
  );

  const res = await handleAgentRequest(
    agentRequest({ event_id: "event-1", suggest_only: true }),
  );
  assertEquals(res.status, 200);

  // suggest_only returns the drafted text as JSON — NOT "handled with error".
  const body = JSON.parse(await res.text()) as { ok?: boolean; reply_text?: string };
  assertEquals(body.ok, true);
  assertStringIncludes(body.reply_text ?? "", "Monday to Wednesday");

  // The crux: a re-draft must not re-ingest the inbound message.
  assertEquals(
    calls.filter((c) => c.method === "POST" && c.path === "/rest/v1/whatsapp_messages").length,
    0,
    "suggest_only must not re-insert the already-ingested inbound message",
  );
});

// ── Failure bookkeeping ──────────────────────────────────────

Deno.test("marks the event failed (but answers 200) when processing throws", async () => {
  resetStub(
    eventSelect(eventRow({ payload: inboundPayload })),
    eventUpdate,
    (call) =>
      call.method === "GET" && call.path === "/rest/v1/humans" ? json([]) : undefined,
    // Conversation upsert blows up → upsertConversation throws.
    (call) =>
      call.method === "POST" && call.path === "/rest/v1/whatsapp_conversations"
        ? json({ message: "boom" }, 500)
        : undefined,
  );

  const res = await handleAgentRequest(agentRequest({ event_id: "event-1" }));
  // 200 by design: pg_net must not retry forever on a bug.
  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "handled with error");
  const patch = lastEventPatch();
  assertEquals(patch?.processing_status, "failed");
  assert(
    typeof patch?.error_message === "string" && patch.error_message.length > 0,
    "failure reason must be recorded on the event row",
  );
});
