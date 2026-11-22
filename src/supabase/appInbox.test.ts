import { describe, expect, it, vi } from "vitest";
import {
  applyUnifiedInbox,
  channelMarkerLabel,
  plainAppSendError,
  replyChannelForMessages,
  sendAppReplyWithClient,
  toInboxMessage,
} from "./appInbox";

const aliceWa = {
  id: "wa-alice",
  human_id: "alice",
  channel: "whatsapp",
  phone_e164: "+447700900501",
  unread_count: 1,
  last_message_at: "2026-11-22T09:00:00.000Z",
  last_message_text: "On WhatsApp",
  last_message_direction: "inbound",
  last_customer_text: "On WhatsApp",
  last_inbound_at: "2026-11-22T09:00:00.000Z",
  humans: { name: "Alice", surname: "A" },
  has_pending_draft: true,
  whatsapp_drafts: [{ id: "draft-1" }],
};

const aliceSms = {
  id: "sms-alice",
  human_id: "alice",
  channel: "sms",
  phone_e164: "+447700900501",
  unread_count: 0,
  last_message_at: "2026-11-22T08:00:00.000Z",
  last_message_text: "By text",
  last_message_direction: "inbound",
};

const erin = {
  id: "wa-erin",
  human_id: "erin",
  channel: "whatsapp",
  phone_e164: "+447700900505",
  unread_count: 0,
  last_message_at: "2026-11-22T07:00:00.000Z",
  last_message_text: "WhatsApp only",
  last_message_direction: "inbound",
};

describe("applyUnifiedInbox", () => {
  it("keeps a WhatsApp-only customer as that WhatsApp row", () => {
    const rows = applyUnifiedInbox([erin], [{
      thread_key: "human:erin",
      human_id: "erin",
      whatsapp_conversation_id: "wa-erin",
      app_conversation_id: null,
      channels: ["whatsapp"],
      last_channel: "whatsapp",
      last_message_at: "2026-11-22T07:00:00.000Z",
      last_message_text: "WhatsApp only",
      last_message_direction: "inbound",
      staff_unread_count: 0,
      phone_e164: "+447700900505",
      customer_name: "Erin",
      customer_surname: "E",
    }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("wa-erin");
    expect(rows[0].app_conversation_id).toBeNull();
    expect(channelMarkerLabel(rows[0].channels)).toBeNull();
  });

  it("folds the app onto the WhatsApp row and drops the customer's other channel row", () => {
    const rows = applyUnifiedInbox([aliceWa, aliceSms, erin], [{
      thread_key: "human:alice",
      human_id: "alice",
      whatsapp_conversation_id: "wa-alice",
      app_conversation_id: "app-alice",
      channels: ["whatsapp", "sms", "app"],
      last_channel: "app",
      last_message_at: "2026-11-22T12:00:00.000Z",
      last_message_text: "From the app",
      last_message_direction: "inbound",
      staff_unread_count: 4,
      app_unread_count: 3,
      phone_e164: "+447700900501",
      customer_name: "Alice",
      customer_surname: "A",
    }, {
      thread_key: "human:erin",
      human_id: "erin",
      whatsapp_conversation_id: "wa-erin",
      app_conversation_id: null,
      channels: ["whatsapp"],
      last_channel: "whatsapp",
      last_message_at: "2026-11-22T07:00:00.000Z",
      last_message_text: "WhatsApp only",
      last_message_direction: "inbound",
      staff_unread_count: 0,
      phone_e164: "+447700900505",
      customer_name: "Erin",
      customer_surname: "E",
    }]);

    expect(rows.map((row) => row.id)).toEqual(["wa-alice", "wa-erin"]);
    const alice = rows[0];
    expect(alice.app_conversation_id).toBe("app-alice");
    expect(alice.channels).toEqual(["whatsapp", "sms", "app"]);
    expect(alice.last_message_text).toBe("From the app");
    expect(alice.last_customer_text).toBe("From the app");
    expect(alice.unread_count).toBe(4);
    expect(alice.has_pending_draft).toBe(true);
    expect(alice.whatsapp_drafts).toEqual([{ id: "draft-1" }]);
    expect(channelMarkerLabel(alice.channels)).toBe("WhatsApp · SMS · App");
  });

  it("adds a customer who only has the app, and keeps a WhatsApp row the merge did not mention", () => {
    const unlinked = {
      id: "wa-unlinked",
      human_id: null,
      channel: "whatsapp",
      phone_e164: "+447700900599",
      last_message_at: "2026-11-22T06:00:00.000Z",
      last_message_text: "Unknown number",
    };
    const rows = applyUnifiedInbox([unlinked], [{
      thread_key: "human:dora",
      human_id: "dora",
      whatsapp_conversation_id: null,
      app_conversation_id: "app-dora",
      channels: ["app"],
      last_channel: "app",
      last_message_at: "2026-11-22T11:00:00.000Z",
      last_message_text: "Hello from Dora",
      last_message_direction: "inbound",
      staff_unread_count: 1,
      phone_e164: "+447700900504",
      customer_name: "Dora",
      customer_surname: "D",
    }]);
    expect(rows.map((row) => row.id)).toEqual(["app:app-dora", "wa-unlinked"]);
    expect(rows[0].channel).toBe("app");
    expect(rows[0].humans).toEqual({ name: "Dora", surname: "D" });
    expect(channelMarkerLabel(rows[0].channels)).toBe("App");
  });

  it("does not replace a WhatsApp preview when WhatsApp is the newer message", () => {
    const rows = applyUnifiedInbox([aliceWa], [{
      thread_key: "human:alice",
      human_id: "alice",
      whatsapp_conversation_id: "wa-alice",
      app_conversation_id: "app-alice",
      channels: ["whatsapp", "app"],
      last_channel: "whatsapp",
      last_message_at: "2026-11-22T09:00:00.000Z",
      last_message_text: "On WhatsApp",
      last_message_direction: "inbound",
      staff_unread_count: 1,
      phone_e164: "+447700900501",
      customer_name: "Alice",
      customer_surname: "A",
    }]);
    expect(rows[0].last_message_text).toBe("On WhatsApp");
    expect(rows[0].reply_channel).toBe("whatsapp");
    expect(rows[0].app_conversation_id).toBe("app-alice");
  });

  it("keeps a second channel row that still has a draft or a failed send", () => {
    const smsWithDraft = {
      ...aliceSms,
      has_pending_draft: true,
      whatsapp_drafts: [{ id: "sms-draft" }],
    };
    const rows = applyUnifiedInbox([aliceWa, smsWithDraft], [{
      thread_key: "human:alice",
      human_id: "alice",
      whatsapp_conversation_id: "wa-alice",
      app_conversation_id: "app-alice",
      channels: ["whatsapp", "sms", "app"],
      last_channel: "whatsapp",
      last_message_at: "2026-11-22T09:00:00.000Z",
      last_message_text: "On WhatsApp",
      last_message_direction: "inbound",
      staff_unread_count: 1,
      app_unread_count: 0,
      phone_e164: "+447700900501",
      customer_name: "Alice",
      customer_surname: "A",
    }]);
    expect(rows.map((row) => row.id).sort()).toEqual(["sms-alice", "wa-alice"]);
  });

  it("gives a kept second channel row the customer's app channel, but leaves its own work and unread alone", () => {
    const smsUnread = {
      ...aliceSms,
      unread_count: 2,
      has_failed_message: true,
    };
    const rows = applyUnifiedInbox([aliceWa, smsUnread], [{
      thread_key: "human:alice",
      human_id: "alice",
      whatsapp_conversation_id: "wa-alice",
      app_conversation_id: "app-alice",
      channels: ["whatsapp", "sms", "app"],
      last_channel: "app",
      last_message_at: "2026-11-22T10:00:00.000Z",
      last_message_text: "In the app",
      last_message_direction: "inbound",
      staff_unread_count: 2,
      app_unread_count: 1,
      phone_e164: "+447700900501",
      customer_name: "Alice",
      customer_surname: "A",
    }]);
    const sms = rows.find((row) => row.id === "sms-alice")!;
    expect(sms.channels).toEqual(["whatsapp", "sms", "app"]);
    expect(sms.app_conversation_id).toBe("app-alice");
    expect(sms.reply_channel).toBe("app");
    // Its own badge and work stay; the app unread is counted once, on the main row.
    expect(sms).toMatchObject({ unread_count: 2, has_failed_message: true, last_message_text: "By text" });
    expect(rows.find((row) => row.id === "wa-alice")!.unread_count).toBe(2);
  });

  it("leaves a kept second channel row unchanged when the customer has no app thread", () => {
    const smsUnread = { ...aliceSms, unread_count: 1 };
    const rows = applyUnifiedInbox([aliceWa, smsUnread], [{
      thread_key: "human:alice",
      human_id: "alice",
      whatsapp_conversation_id: "wa-alice",
      app_conversation_id: null,
      channels: ["whatsapp", "sms"],
      last_channel: "whatsapp",
      last_message_at: "2026-11-22T09:00:00.000Z",
      last_message_text: "On WhatsApp",
      last_message_direction: "inbound",
      staff_unread_count: 1,
      app_unread_count: 0,
      phone_e164: "+447700900501",
      customer_name: "Alice",
      customer_surname: "A",
    }]);
    expect(rows.find((row) => row.id === "sms-alice")).toBe(smsUnread);
  });

  it("puts a closed WhatsApp thread back in the active queue when a newer app message arrives", () => {
    const closed = { ...aliceWa, closed_at: "2026-11-22T09:30:00.000Z", unread_count: 0 };
    const rows = applyUnifiedInbox([closed], [{
      thread_key: "human:alice",
      human_id: "alice",
      whatsapp_conversation_id: "wa-alice",
      app_conversation_id: "app-alice",
      channels: ["whatsapp", "app"],
      last_channel: "app",
      last_message_at: "2026-11-22T12:00:00.000Z",
      last_message_text: "From the app",
      last_message_direction: "inbound",
      staff_unread_count: 1,
      app_unread_count: 1,
      phone_e164: "+447700900501",
      customer_name: "Alice",
      customer_surname: "A",
    }]);
    expect(rows[0].closed_at).toBeNull();
    expect(rows[0].unread_count).toBe(1);
  });

  it("adds the app unread count on top of this WhatsApp row's own live count", () => {
    const rows = applyUnifiedInbox([{ ...aliceWa, unread_count: 2 }], [{
      thread_key: "human:alice",
      human_id: "alice",
      whatsapp_conversation_id: "wa-alice",
      app_conversation_id: "app-alice",
      channels: ["whatsapp", "app"],
      last_channel: "whatsapp",
      last_message_at: "2026-11-22T09:00:00.000Z",
      last_message_text: "On WhatsApp",
      last_message_direction: "inbound",
      staff_unread_count: 99,
      app_unread_count: 3,
      phone_e164: "+447700900501",
      customer_name: "Alice",
      customer_surname: "A",
    }]);
    expect(rows[0].unread_count).toBe(5);
  });
});

describe("replyChannelForMessages", () => {
  it("replies in the app when the customer's latest message was in the app", () => {
    expect(replyChannelForMessages([
      { channel: "whatsapp", direction: "inbound", sent_at: "2026-11-22T09:00:00.000Z" },
      { channel: "app", direction: "inbound", sent_at: "2026-11-22T10:00:00.000Z" },
      { channel: "whatsapp", direction: "outbound", sent_at: "2026-11-22T11:00:00.000Z" },
    ])).toBe("app");
  });

  it("replies on WhatsApp when that is how the customer last wrote", () => {
    expect(replyChannelForMessages([
      { channel: "app", direction: "inbound", sent_at: "2026-11-22T09:00:00.000Z" },
      { channel: "whatsapp", direction: "inbound", sent_at: "2026-11-22T10:00:00.000Z" },
    ])).toBe("whatsapp");
  });

  it("uses the only message's channel when the customer has not written yet", () => {
    expect(replyChannelForMessages([
      { channel: "app", direction: "outbound", sent_at: "2026-11-22T10:00:00.000Z" },
    ])).toBe("app");
  });
});

describe("toInboxMessage", () => {
  it("keeps the channel on the bubble's message", () => {
    expect(toInboxMessage({
      id: "m1",
      channel: "app",
      direction: "inbound",
      body: "Hello from the app",
      sent_at: "2026-11-22T10:00:00.000Z",
      status: "sent",
      sender: "customer",
      staff_user_id: null,
      error_message: null,
      reaction_emoji: null,
      media_path: null,
      media_mime: null,
      meta_message_id: null,
      in_reply_to_meta_id: null,
    }).channel).toBe("app");
  });
});

describe("sendAppReplyWithClient", () => {
  it("asks send_app_message to store the trimmed reply for that customer", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const result = await sendAppReplyWithClient(
      { rpc },
      "alice",
      "  See you Wednesday  ",
    );
    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("send_app_message", {
      p_body: "See you Wednesday",
      p_human_id: "alice",
    });
  });

  it("does not call the database for an empty reply", async () => {
    const rpc = vi.fn();
    const result = await sendAppReplyWithClient({ rpc }, "alice", "   ");
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("turns a database refusal into a sentence staff can read", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "message_too_long" } });
    const result = await sendAppReplyWithClient({ rpc }, "alice", "Hello");
    expect(result).toEqual({
      ok: false,
      reason: plainAppSendError("message_too_long"),
    });
    expect(result.reason).toBe("That message is too long. Keep it under 2,000 characters.");
  });
});
