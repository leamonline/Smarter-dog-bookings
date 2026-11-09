import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { checkSendIdentity, observeSendIdentity, type IdentityDb } from "./sendIdentity.ts";

const WA = { channel: "whatsapp", phone_e164: "+447700900123", human_id: "h-1" };
const SMS = { channel: "sms", phone_e164: "+447700900123", human_id: "h-1" };

Deno.test("a consistent WhatsApp send reports nothing", () => {
  assertEquals(
    checkSendIdentity({
      endpointChannel: "whatsapp",
      to: "07700 900123",
      humanId: "h-1",
      human: { phone: "+447700900123" },
      conversationId: "c-1",
      conversation: WA,
    }),
    [],
  );
});

Deno.test("wrong channel: a WhatsApp send on an SMS thread, and the reverse", () => {
  assertEquals(checkSendIdentity({ endpointChannel: "whatsapp", conversationId: "c", conversation: SMS }), [
    "conversation_channel_mismatch",
  ]);
  assertEquals(checkSendIdentity({ endpointChannel: "sms", conversationId: "c", conversation: WA }), [
    "conversation_channel_mismatch",
  ]);
});

Deno.test("a conversation row with no channel is a WhatsApp one", () => {
  assertEquals(
    checkSendIdentity({ endpointChannel: "whatsapp", conversationId: "c", conversation: { ...WA, channel: null } }),
    [],
  );
});

Deno.test("wrong number: the conversation belongs to someone else's phone", () => {
  assertEquals(
    checkSendIdentity({ endpointChannel: "whatsapp", to: "07700 900999", conversationId: "c", conversation: WA }),
    ["conversation_phone_mismatch"],
  );
});

Deno.test("the same number typed differently is not a mismatch", () => {
  assertEquals(
    checkSendIdentity({
      endpointChannel: "sms",
      to: "+44 7700 900123",
      conversationId: "c",
      conversation: { ...SMS, phone_e164: "07700900123" },
    }),
    [],
  );
});

Deno.test("conflicting human: the conversation is linked to someone else", () => {
  assertEquals(
    checkSendIdentity({ endpointChannel: "whatsapp", humanId: "h-2", conversationId: "c", conversation: WA }),
    ["conversation_human_conflict"],
  );
});

Deno.test("an unlinked conversation does not conflict with a named human", () => {
  assertEquals(
    checkSendIdentity({
      endpointChannel: "whatsapp",
      humanId: "h-2",
      conversationId: "c",
      conversation: { ...WA, human_id: null },
    }),
    [],
  );
});

Deno.test("unknown human, unknown conversation", () => {
  assertEquals(checkSendIdentity({ endpointChannel: "whatsapp", humanId: "h-x", human: null }), ["human_not_found"]);
  assertEquals(checkSendIdentity({ endpointChannel: "whatsapp", conversationId: "c-x", conversation: null }), [
    "conversation_not_found",
  ]);
});

Deno.test("invalid human number, invalid destination, human number differs from destination", () => {
  assertEquals(checkSendIdentity({ endpointChannel: "sms", humanId: "h", human: { phone: null } }), ["human_phone_invalid"]);
  assertEquals(checkSendIdentity({ endpointChannel: "sms", humanId: "h", human: { phone: "n/a" } }), ["human_phone_invalid"]);
  assertEquals(checkSendIdentity({ endpointChannel: "sms", to: "12" }), ["invalid_phone"]);
  assertEquals(
    checkSendIdentity({ endpointChannel: "sms", to: "07700 900999", humanId: "h", human: { phone: "07700 900123" } }),
    ["human_phone_mismatch"],
  );
});

Deno.test("independent problems are all reported, in a stable order", () => {
  assertEquals(
    checkSendIdentity({
      endpointChannel: "whatsapp",
      to: "07700 900999",
      humanId: "h-2",
      human: { phone: "07700 900123" },
      conversationId: "c",
      conversation: SMS,
    }),
    ["human_phone_mismatch", "conversation_channel_mismatch", "conversation_phone_mismatch", "conversation_human_conflict"],
  );
});

// ── The DB-reading observer ─────────────────────────────────────────

function db(tables: Record<string, Record<string, unknown> | "error">): IdentityDb {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            const row = tables[table];
            return Promise.resolve(row === "error" ? { data: null, error: { message: "boom" } } : { data: row ?? null, error: null });
          },
        }),
      }),
    }),
  };
}

const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  try { return await fn(); } finally { console.warn = warn; console.error = error; }
};

Deno.test("the observer reports what the lookups show", async () => {
  const codes = await quiet(() =>
    observeSendIdentity(db({ whatsapp_conversations: SMS }), {
      endpoint: "whatsapp-send", endpointChannel: "whatsapp", mode: "manual", conversationId: "c-1",
    })
  );
  assertEquals(codes, ["conversation_channel_mismatch"]);
});

Deno.test("draft mode finds the draft's conversation", async () => {
  const codes = await quiet(() =>
    observeSendIdentity(db({ whatsapp_drafts: { conversation_id: "c-1" }, whatsapp_conversations: SMS }), {
      endpoint: "whatsapp-send", endpointChannel: "whatsapp", mode: "draft", draftId: "d-1",
    })
  );
  assertEquals(codes, ["conversation_channel_mismatch"]);
});

Deno.test("a failed lookup is swallowed: it must never stop a send", async () => {
  const codes = await quiet(() =>
    observeSendIdentity(db({ whatsapp_conversations: "error" }), {
      endpoint: "sms-send", endpointChannel: "sms", mode: "manual", conversationId: "c-1",
    })
  );
  assertEquals(codes, []);
});
