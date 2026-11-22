import { renderHook, waitFor } from "@testing-library/react";
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
