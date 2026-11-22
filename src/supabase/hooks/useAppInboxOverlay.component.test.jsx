import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAppInboxOverlay } from "./useAppInboxOverlay";

function lazyClient(executed) {
  return {
    rpc(name, args) {
      return {
        then(resolve, reject) {
          executed.push({ name, args });
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
    },
    channel() {
      return {
        on() { return this; },
        subscribe() {},
      };
    },
    removeChannel() {},
  };
}

describe("useAppInboxOverlay mark read", () => {
  it("actually runs mark_app_messages_read when an app thread is opened", async () => {
    const executed = [];
    const client = lazyClient(executed);
    renderHook(() => useAppInboxOverlay({
      enabled: true,
      conversations: [{
        id: "app:app-1",
        human_id: "human-1",
        channel: "app",
        channels: ["app"],
        app_conversation_id: "app-1",
      }],
      messages: [],
      selectedId: "app:app-1",
      client,
    }));

    await waitFor(() => {
      expect(executed.some((call) => call.name === "mark_app_messages_read" && call.args.p_conversation_id === "app-1")).toBe(true);
    });
  });
});

function deferredClient(calls) {
  return {
    rpc(name, args) {
      let settle;
      const promise = new Promise((resolve) => { settle = resolve; });
      calls.push({ name, args, settle });
      return promise;
    },
    channel() {
      return {
        on() { return this; },
        subscribe() {},
      };
    },
    removeChannel() {},
  };
}

function threadRow(id, overrides = {}) {
  return {
    id,
    channel: "app",
    direction: "inbound",
    body: id,
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
    ...overrides,
  };
}

const appA = { id: "app:app-a", human_id: "human-a", channel: "app", channels: ["app"], app_conversation_id: "app-a" };
const appB = { id: "app:app-b", human_id: "human-b", channel: "app", channels: ["app"], app_conversation_id: "app-b" };

describe("useAppInboxOverlay thread loads", () => {
  it("ignores a slow reply for the conversation staff have just left", async () => {
    const calls = [];
    const client = deferredClient(calls);
    const { result, rerender } = renderHook(
      ({ selectedId }) => useAppInboxOverlay({
        enabled: true,
        conversations: [appA, appB],
        messages: [],
        selectedId,
        client,
      }),
      { initialProps: { selectedId: "app:app-a" } },
    );
    const threadCall = (humanId) => calls.find(
      (call) => call.name === "list_staff_unified_thread" && call.args.p_human_id === humanId,
    );
    await waitFor(() => expect(threadCall("human-a")).toBeTruthy());

    rerender({ selectedId: "app:app-b" });
    await waitFor(() => expect(threadCall("human-b")).toBeTruthy());

    await act(async () => {
      threadCall("human-b").settle({ data: [threadRow("message-b")], error: null });
    });
    await act(async () => {
      threadCall("human-a").settle({ data: [threadRow("message-a")], error: null });
    });

    expect(result.current.loadingThread).toBe(false);
    expect(result.current.messages.map((message) => message.id)).toEqual(["message-b"]);
  });

  it("only offers Retry on a failed message the open conversation owns", async () => {
    const calls = [];
    const client = deferredClient(calls);
    const waAlice = {
      id: "wa-alice",
      human_id: "alice",
      channel: "whatsapp",
      channels: ["whatsapp", "sms", "app"],
      app_conversation_id: "app-alice",
    };
    const { result } = renderHook(() => useAppInboxOverlay({
      enabled: true,
      conversations: [waAlice],
      // The open conversation's own WhatsApp detail.
      messages: [{ id: "failed-own", channel: "whatsapp", status: "failed" }],
      selectedId: "wa-alice",
      client,
    }));
    const threadCall = () => calls.find((call) => call.name === "list_staff_unified_thread");
    await waitFor(() => expect(threadCall()).toBeTruthy());
    await act(async () => {
      threadCall().settle({
        data: [
          threadRow("failed-own", { channel: "whatsapp", direction: "outbound", status: "failed" }),
          threadRow("failed-sibling", { channel: "sms", direction: "outbound", status: "failed" }),
          threadRow("app-latest"),
        ],
        error: null,
      });
    });

    const byId = Object.fromEntries(result.current.messages.map((message) => [message.id, message]));
    expect(byId["failed-own"].retry_elsewhere).toBeUndefined();
    expect(byId["failed-sibling"].retry_elsewhere).toBe(true);
    expect(byId["app-latest"].retry_elsewhere).toBeUndefined();
  });
});
