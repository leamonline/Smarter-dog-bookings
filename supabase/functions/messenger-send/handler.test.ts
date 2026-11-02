import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  handleMessengerSendRequest,
  postMessengerGraph,
  type MessengerSendOverrides,
} from "./handler.ts";

const TOKEN = "EAA-page-token-do-not-log";
const PAGE = "111222333";
const NOW = Date.parse("2026-11-02T12:00:00Z");

function staffRequest(body: unknown): Request {
  return new Request("https://example.test/messenger-send", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer staff-jwt" },
    body: JSON.stringify(body),
  });
}

const conversation = {
  id: "conv-1",
  channel: "messenger",
  messenger_psid: "psid-1",
  messenger_page_id: PAGE,
  last_inbound_at: new Date(NOW - 60 * 60 * 1000).toISOString(),
};

function deps(extra: MessengerSendOverrides = {}): MessengerSendOverrides {
  return {
    enabled: true,
    humanAgentEnabled: false,
    pageId: PAGE,
    pageToken: TOKEN,
    nowMs: NOW,
    authorise: () => Promise.resolve({ ok: true, userId: "staff-1" }),
    loadConversation: () => Promise.resolve(conversation),
    recordOutbound: () => Promise.resolve(),
    supersedeDrafts: () => Promise.resolve(),
    ...extra,
  };
}

Deno.test("flag off does not call the Graph API", async () => {
  let called = false;
  const res = await handleMessengerSendRequest(staffRequest({
    mode: "manual",
    conversation_id: "conv-1",
    text: "Hello",
  }), deps({
    enabled: false,
    postGraph: () => {
      called = true;
      return Promise.resolve({ ok: true, messageId: "nope" });
    },
  }));
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "Messenger inbox is switched off");
  assertEquals(called, false);
});

Deno.test("an open window sends RESPONSE and keeps the token out of the URL", async () => {
  let url = "";
  let payload: Record<string, unknown> = {};
  let seenToken = "";
  const res = await handleMessengerSendRequest(staffRequest({
    mode: "manual",
    conversation_id: "conv-1",
    text: "Wednesday works",
  }), deps({
    postGraph: (nextUrl, token, body) => {
      url = nextUrl;
      seenToken = token;
      payload = body;
      return Promise.resolve({ ok: true, messageId: "mid.out.1" });
    },
  }));
  assertEquals(res.status, 200);
  assertEquals(url, `https://graph.facebook.com/v22.0/${PAGE}/messages`);
  assertEquals(url.includes(TOKEN), false);
  assertEquals(payload.messaging_type, "RESPONSE");
  assertEquals("tag" in payload, false);
  assertEquals(seenToken, TOKEN);
});

Deno.test("a closed window does not send", async () => {
  let called = false;
  const res = await handleMessengerSendRequest(staffRequest({
    mode: "manual",
    conversation_id: "conv-1",
    text: "Too late",
  }), deps({
    loadConversation: () => Promise.resolve({
      ...conversation,
      last_inbound_at: new Date(NOW - 25 * 60 * 60 * 1000).toISOString(),
    }),
    postGraph: () => {
      called = true;
      return Promise.resolve({ ok: true });
    },
  }));
  assertEquals(res.status, 422);
  assertEquals(called, false);
});

Deno.test("a person-typed reply can use HUMAN_AGENT only when that flag is on", async () => {
  const seen: { body: Record<string, unknown> | null } = { body: null };
  const res = await handleMessengerSendRequest(staffRequest({
    mode: "manual",
    conversation_id: "conv-1",
    text: "A person is replying",
  }), deps({
    humanAgentEnabled: true,
    loadConversation: () => Promise.resolve({
      ...conversation,
      last_inbound_at: new Date(NOW - 25 * 60 * 60 * 1000).toISOString(),
    }),
    postGraph: (_url, _token, body) => {
      seen.body = body;
      return Promise.resolve({ ok: true, messageId: "mid.human" });
    },
  }));
  assertEquals(res.status, 200);
  assertEquals(seen.body?.messaging_type, "MESSAGE_TAG");
  assertEquals(seen.body?.tag, "HUMAN_AGENT");
});

Deno.test("an approved draft never uses HUMAN_AGENT, even when the flag is on", async () => {
  let payload: Record<string, unknown> | null = null;
  const res = await handleMessengerSendRequest(staffRequest({
    mode: "draft",
    draft_id: "draft-1",
  }), deps({
    humanAgentEnabled: true,
    loadConversation: () => Promise.resolve({
      ...conversation,
      last_inbound_at: new Date(NOW - 25 * 60 * 60 * 1000).toISOString(),
    }),
    loadDraft: () => Promise.resolve({
      id: "draft-1",
      conversation_id: "conv-1",
      proposed_text: "The model wrote this",
      state: "pending",
    }),
    claimDraft: () => Promise.resolve(true),
    postGraph: (_url, _token, body) => {
      payload = body;
      return Promise.resolve({ ok: true, messageId: "mid.draft" });
    },
  }));
  assertEquals(res.status, 422);
  assertEquals(payload, null);
});

Deno.test("linking stores the customer id and does not send", async () => {
  let linked: string | null = null;
  let called = false;
  const res = await handleMessengerSendRequest(staffRequest({
    mode: "link",
    conversation_id: "conv-1",
    human_id: "human-9",
  }), deps({
    humanExists: () => Promise.resolve(true),
    linkCustomer: (_conversation, humanId) => {
      linked = humanId;
      return Promise.resolve();
    },
    postGraph: () => {
      called = true;
      return Promise.resolve({ ok: true });
    },
  }));
  assertEquals(res.status, 200);
  assertEquals(linked, "human-9");
  assertEquals(called, false);
});

Deno.test("a Graph error log does not contain the page token", async () => {
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  const previous = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(`bad token ${TOKEN}`, { status: 400 }));
  try {
    const result = await postMessengerGraph(
      `https://graph.facebook.com/v22.0/${PAGE}/messages`,
      TOKEN,
      { messaging_type: "RESPONSE", message: { text: "Hi" } },
    );
    assertEquals(result.ok, false);
    assert(logs.length > 0);
    assertEquals(logs.join("\n").includes(TOKEN), false);
    assertEquals(logs.join("\n").includes("[redacted]"), true);
  } finally {
    console.error = original;
    globalThis.fetch = previous;
  }
});

Deno.test("more than 2000 characters is refused before Graph", async () => {
  let called = false;
  const res = await handleMessengerSendRequest(staffRequest({
    mode: "manual",
    conversation_id: "conv-1",
    text: "a".repeat(2001),
  }), deps({
    postGraph: () => {
      called = true;
      return Promise.resolve({ ok: true });
    },
  }));
  assertEquals(res.status, 400);
  assertEquals(called, false);
});
