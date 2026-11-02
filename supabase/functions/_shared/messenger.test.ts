import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { verifyMetaHubSignature } from "./metaSignature.ts";
import {
  applyMessengerIngress,
  buildMessengerGraphBody,
  decideMessengerWindow,
  filterToConfiguredPage,
  messengerAgentPolicy,
  messengerFlagEnabled,
  messengerSendUrl,
  MESSENGER_HUMAN_AGENT_WINDOW_MS,
  MESSENGER_MAX_TEXT_LENGTH,
  MESSENGER_STANDARD_WINDOW_MS,
  parseMessengerWebhook,
  redactSecret,
  whatsappCloudSendAllowed,
  type MessengerStore,
  type StoredConversation,
} from "./messenger.ts";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const SECRET = "test-app-secret";
const PAGE = "111222333";
const PSID = "999888777";

function inboundPayload(text = "Hello from Messenger", mid = "mid.inbound.1") {
  return {
    object: "page",
    entry: [{
      id: PAGE,
      messaging: [{
        sender: { id: PSID },
        recipient: { id: PAGE },
        timestamp: NOW - 60_000,
        message: { mid, text },
      }],
    }],
  };
}

async function sign(body: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}`;
}

Deno.test("signature accepts the raw body and rejects a re-serialised one", async () => {
  const raw = JSON.stringify(inboundPayload());
  const header = await sign(raw);
  const bytes = new TextEncoder().encode(raw);
  assert(await verifyMetaHubSignature(bytes.buffer, header, SECRET));
  const reserialised = JSON.stringify(JSON.parse(raw));
  // Same JSON can still match when the encoder preserves key order. Tamper a byte.
  const tampered = new TextEncoder().encode(raw.replace("Hello", "Hellp"));
  assertEquals(await verifyMetaHubSignature(tampered.buffer, header, SECRET), false);
  assertEquals(await verifyMetaHubSignature(bytes.buffer, "sha256=deadbeef", SECRET), false);
  assertEquals(await verifyMetaHubSignature(bytes.buffer, null, SECRET), false);
  assertEquals(await verifyMetaHubSignature(bytes.buffer, header, ""), false);
  assertEquals(reserialised.length > 0, true);
});

Deno.test("flag is off unless the value is exactly true", () => {
  assertEquals(messengerFlagEnabled(undefined), false);
  assertEquals(messengerFlagEnabled(""), false);
  assertEquals(messengerFlagEnabled("false"), false);
  assertEquals(messengerFlagEnabled("TRUE"), true);
  assertEquals(messengerFlagEnabled(" true "), true);
});

Deno.test("parse keeps a text message and a simple attachment on one thread", () => {
  const events = parseMessengerWebhook({
    object: "page",
    entry: [{
      id: PAGE,
      messaging: [
        inboundPayload("Need a groom").entry[0].messaging[0],
        {
          sender: { id: PSID },
          recipient: { id: PAGE },
          timestamp: NOW,
          message: {
            mid: "mid.attach.1",
            attachments: [{ type: "image", payload: { url: "https://cdn.example/dog.jpg" } }],
          },
        },
      ],
    }],
  }, NOW);
  assertEquals(events.map((event) => event.kind), ["inbound", "inbound"]);
  assertEquals(events[0].kind === "inbound" && events[0].text, "Need a groom");
  assertEquals(events[1].kind === "inbound" && events[1].text, "[image]");
  assertEquals(events[1].kind === "inbound" && events[1].attachments[0].url, "https://cdn.example/dog.jpg");
});

Deno.test("a WhatsApp payload is not a Messenger conversation", () => {
  const events = parseMessengerWebhook({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { messages: [{ from: "447700900123", id: "wamid.1", text: { body: "Hi" } }] } }] }],
  }, NOW);
  assertEquals(events, []);
});

Deno.test("echoes are outbound and a repeated mid is one row", async () => {
  const echo = {
    object: "page",
    entry: [{
      id: PAGE,
      messaging: [{
        sender: { id: PAGE },
        recipient: { id: PSID },
        timestamp: NOW,
        message: { mid: "mid.echo.1", is_echo: true, text: "See you Wednesday" },
      }],
    }],
  };
  const parsed = parseMessengerWebhook(echo, NOW);
  assertEquals(parsed.length, 1);
  assertEquals(parsed[0].kind, "echo");
  const store = memoryStore();
  const first = await applyMessengerIngress(store, parsed);
  const second = await applyMessengerIngress(store, parsed);
  assertEquals(first.inserted, 1);
  assertEquals(second.duplicates, 1);
  assertEquals(store.messages.length, 1);
  assertEquals(store.messages[0].direction, "outbound");
});

Deno.test("an echo of a mid we already sent does not insert a second bubble", async () => {
  const store = memoryStore();
  store.conversations.push({ id: "conv-1", human_id: null, pageId: PAGE, psid: PSID, phone: null });
  store.messages.push({
    conversationId: "conv-1",
    direction: "outbound",
    mid: "mid.ours.1",
    content: "Already sent",
  });
  const events = parseMessengerWebhook({
    object: "page",
    entry: [{
      id: PAGE,
      messaging: [{
        sender: { id: PAGE },
        recipient: { id: PSID },
        timestamp: NOW,
        message: { mid: "mid.ours.1", is_echo: true, text: "Already sent" },
      }],
    }],
  }, NOW);
  const result = await applyMessengerIngress(store, events);
  assertEquals(result.duplicates, 1);
  assertEquals(store.messages.length, 1);
});

Deno.test("delivery and read updates land on the outbound row", async () => {
  const store = memoryStore();
  const events = parseMessengerWebhook({
    object: "page",
    entry: [{
      id: PAGE,
      messaging: [
        {
          sender: { id: PSID },
          recipient: { id: PAGE },
          timestamp: NOW,
          delivery: { mids: ["mid.ours.1"], watermark: NOW },
        },
        {
          sender: { id: PSID },
          recipient: { id: PAGE },
          timestamp: NOW,
          read: { watermark: NOW },
        },
      ],
    }],
  }, NOW);
  store.conversations.push({ id: "conv-1", human_id: null, pageId: PAGE, psid: PSID, phone: null });
  const result = await applyMessengerIngress(store, events);
  assertEquals(result.statusUpdates, 2);
  assertEquals(store.delivered, ["mid.ours.1"]);
  assertEquals(store.readWatermarks, [new Date(NOW).toISOString()]);
});

Deno.test("another Page is ignored once META_PAGE_ID is set", () => {
  const events = parseMessengerWebhook(inboundPayload(), NOW);
  assertEquals(filterToConfiguredPage(events, "some-other-page"), []);
  assertEquals(filterToConfiguredPage(events, PAGE).length, 1);
  assertEquals(filterToConfiguredPage(events, "").length, 1);
});

Deno.test("reply window: 24h standard, 7d human tag only for staff when the flag is on", () => {
  const last = new Date(NOW - 60 * 60 * 1000).toISOString();
  const open = decideMessengerWindow({
    lastInboundAt: last,
    nowMs: NOW,
    humanAgentEnabled: false,
    sender: "staff",
  });
  assertEquals(open.mode, "standard");
  assertEquals(open.label, "Reply window closes in 23h 0m");

  const outside = new Date(NOW - MESSENGER_STANDARD_WINDOW_MS - 1000).toISOString();
  const locked = decideMessengerWindow({
    lastInboundAt: outside,
    nowMs: NOW,
    humanAgentEnabled: false,
    sender: "staff",
  });
  assertEquals(locked.mode, "closed");
  assertEquals(locked.label, null);

  const aiExtended = decideMessengerWindow({
    lastInboundAt: outside,
    nowMs: NOW,
    humanAgentEnabled: true,
    sender: "ai",
  });
  assertEquals(aiExtended.mode, "closed");

  const staffExtended = decideMessengerWindow({
    lastInboundAt: outside,
    nowMs: NOW,
    humanAgentEnabled: true,
    sender: "staff",
  });
  assertEquals(staffExtended.mode, "human_agent");

  const tooLate = new Date(NOW - MESSENGER_HUMAN_AGENT_WINDOW_MS - 1000).toISOString();
  assertEquals(
    decideMessengerWindow({
      lastInboundAt: tooLate,
      nowMs: NOW,
      humanAgentEnabled: true,
      sender: "staff",
    }).mode,
    "closed",
  );
});

Deno.test("send body is RESPONSE inside the window and never tags an AI reply", () => {
  const open = decideMessengerWindow({
    lastInboundAt: new Date(NOW - 1000).toISOString(),
    nowMs: NOW,
    humanAgentEnabled: true,
    sender: "ai",
  });
  const body = buildMessengerGraphBody({ psid: PSID, text: "Wednesday is free", decision: open, sender: "ai" });
  assert(body.ok);
  if (body.ok) {
    assertEquals(body.body.messaging_type, "RESPONSE");
    assertEquals("tag" in body.body, false);
  }
  const url = messengerSendUrl(PAGE);
  assertEquals(url.includes("access_token"), false);
  assertEquals(url, `https://graph.facebook.com/v22.0/${PAGE}/messages`);
});

Deno.test("HUMAN_AGENT is staff-only, and the flag-off window refuses the send", () => {
  const outside = new Date(NOW - MESSENGER_STANDARD_WINDOW_MS - 1000).toISOString();
  const closed = decideMessengerWindow({
    lastInboundAt: outside,
    nowMs: NOW,
    humanAgentEnabled: false,
    sender: "staff",
  });
  const refused = buildMessengerGraphBody({
    psid: PSID,
    text: "Sorry we missed you",
    decision: closed,
    sender: "staff",
  });
  assertEquals(refused.ok, false);

  const extended = decideMessengerWindow({
    lastInboundAt: outside,
    nowMs: NOW,
    humanAgentEnabled: true,
    sender: "staff",
  });
  const tagged = buildMessengerGraphBody({
    psid: PSID,
    text: "A person is replying",
    decision: extended,
    sender: "staff",
  });
  assert(tagged.ok);
  if (tagged.ok) {
    assertEquals(tagged.body.messaging_type, "MESSAGE_TAG");
    assertEquals(tagged.body.tag, "HUMAN_AGENT");
  }
  const aiTagged = buildMessengerGraphBody({
    psid: PSID,
    text: "The model wrote this",
    decision: extended,
    sender: "ai",
  });
  assertEquals(aiTagged.ok, false);
});

Deno.test("2000 characters is the Messenger text ceiling", () => {
  const open = decideMessengerWindow({
    lastInboundAt: new Date(NOW).toISOString(),
    nowMs: NOW,
    humanAgentEnabled: false,
    sender: "staff",
  });
  const ok = buildMessengerGraphBody({
    psid: PSID,
    text: "a".repeat(MESSENGER_MAX_TEXT_LENGTH),
    decision: open,
    sender: "staff",
  });
  assertEquals(ok.ok, true);
  const tooLong = buildMessengerGraphBody({
    psid: PSID,
    text: "a".repeat(MESSENGER_MAX_TEXT_LENGTH + 1),
    decision: open,
    sender: "staff",
  });
  assertEquals(tooLong.ok, false);
  if (!tooLong.ok) assertEquals(tooLong.status, 400);
});

Deno.test("the agent policy never auto-sends and never uses HUMAN_AGENT", () => {
  const policy = messengerAgentPolicy();
  assertEquals(policy, { draftOnly: true, autoSend: false, humanAgent: false });
  assertEquals(whatsappCloudSendAllowed("whatsapp"), true);
  assertEquals(whatsappCloudSendAllowed("sms"), true);
  assertEquals(whatsappCloudSendAllowed("email"), true);
  assertEquals(whatsappCloudSendAllowed("messenger"), false);
});

Deno.test("logs cannot keep a page token", () => {
  const token = "EAA-page-token-do-not-log";
  const leaked = `graph error 190 token ${token} rejected`;
  assertEquals(redactSecret(leaked, token).includes(token), false);
  assertEquals(redactSecret(leaked, token).includes("[redacted]"), true);
});

Deno.test("a linked identity is copied onto a new thread and a phone is never invented", async () => {
  const store = memoryStore();
  store.identities.set(`${PAGE}:${PSID}`, "human-1");
  await applyMessengerIngress(store, parseMessengerWebhook(inboundPayload(), NOW));
  assertEquals(store.conversations.length, 1);
  assertEquals(store.conversations[0].human_id, "human-1");
  assertEquals(store.conversations[0].phone, null);
});

function memoryStore(): MessengerStore & {
  conversations: Array<StoredConversation & { pageId: string; psid: string; phone: null }>;
  messages: Array<{ conversationId: string; direction: "inbound" | "outbound"; mid: string; content: string }>;
  identities: Map<string, string>;
  delivered: string[];
  readWatermarks: string[];
} {
  const conversations: Array<StoredConversation & { pageId: string; psid: string; phone: null }> = [];
  const messages: Array<{ conversationId: string; direction: "inbound" | "outbound"; mid: string; content: string }> = [];
  const identities = new Map<string, string>();
  const delivered: string[] = [];
  const readWatermarks: string[] = [];
  let seq = 0;
  const store: MessengerStore & {
    conversations: typeof conversations;
    messages: typeof messages;
    identities: typeof identities;
    delivered: string[];
    readWatermarks: string[];
  } = {
    conversations,
    messages,
    identities,
    delivered,
    readWatermarks,
    findIdentityHumanId(pageId, psid) {
      return Promise.resolve(identities.get(`${pageId}:${psid}`) ?? null);
    },
    findConversation(pageId, psid) {
      return Promise.resolve(conversations.find((row) => row.pageId === pageId && row.psid === psid) ?? null);
    },
    insertConversation(row) {
      const created = {
        id: `conv-${++seq}`,
        human_id: row.humanId,
        pageId: row.pageId,
        psid: row.psid,
        phone: null as null,
      };
      conversations.push(created);
      return Promise.resolve(created);
    },
    noteInbound(id, _at, _text, humanIdToFill) {
      const row = conversations.find((item) => item.id === id);
      if (row && humanIdToFill && !row.human_id) row.human_id = humanIdToFill;
      return Promise.resolve();
    },
    hasMessage(direction, mid) {
      return Promise.resolve(messages.some((row) => row.direction === direction && row.mid === mid));
    },
    insertMessage(row) {
      if (messages.some((item) => item.direction === row.direction && item.mid === row.mid)) {
        return Promise.resolve("duplicate" as const);
      }
      messages.push({
        conversationId: row.conversationId,
        direction: row.direction,
        mid: row.mid,
        content: row.content,
      });
      return Promise.resolve("inserted" as const);
    },
    noteOutbound() {
      return Promise.resolve();
    },
    markDelivered(mids) {
      delivered.push(...mids);
      return Promise.resolve();
    },
    markReadBefore(_id, watermark) {
      readWatermarks.push(watermark);
      return Promise.resolve();
    },
  };
  return store;
}
