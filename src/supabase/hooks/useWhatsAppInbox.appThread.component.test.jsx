import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-app thread id ("app:<uuid>") is not a WhatsApp row. Resume and
// reconnect refreshes must not query WhatsApp with it, or the WhatsApp error
// would cover an app thread that loaded.
const hoisted = vi.hoisted(() => ({
  resumeCallbacks: [],
  detailCalls: [],
  channelNames: [],
}));

vi.mock("../client", () => {
  const channel = (name) => {
    hoisted.channelNames.push(name);
    const handle = {
      on() { return handle; },
      subscribe() { return handle; },
    };
    return handle;
  };
  return {
    supabase: {
      channel,
      removeChannel() {},
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

vi.mock("../refreshOnResume.js", () => ({
  registerResume: (callback) => {
    hoisted.resumeCallbacks.push(callback);
    return () => {
      const index = hoisted.resumeCallbacks.indexOf(callback);
      if (index >= 0) hoisted.resumeCallbacks.splice(index, 1);
    };
  },
}));

vi.mock("./inbox/inboxFetchers", () => ({
  fetchConversationsList: () => Promise.resolve([]),
  fetchConversationDetail: (_client, conversationId) => {
    hoisted.detailCalls.push(conversationId);
    return Promise.reject(new Error("invalid input syntax for type uuid"));
  },
}));

const { useWhatsAppInbox } = await import("./useWhatsAppInbox");

describe("useWhatsAppInbox with an in-app thread selected", () => {
  beforeEach(() => {
    hoisted.resumeCallbacks.length = 0;
    hoisted.detailCalls.length = 0;
    hoisted.channelNames.length = 0;
  });

  it("does not query WhatsApp with the app thread id when the app resumes", async () => {
    const { result } = renderHook(() => useWhatsAppInbox());
    await waitFor(() => expect(result.current.loadingList).toBe(false));

    await act(async () => {
      await result.current.selectConversation("app:3f1c2b9e-0000-4000-8000-000000000001");
    });
    await act(async () => {
      for (const callback of [...hoisted.resumeCallbacks]) callback();
    });

    expect(hoisted.detailCalls).toEqual([]);
    expect(result.current.detailError).toBeNull();
    expect(hoisted.channelNames.some((name) => name.includes("app:"))).toBe(false);
  });

  it("still refreshes a WhatsApp conversation on resume", async () => {
    const { result } = renderHook(() => useWhatsAppInbox());
    await waitFor(() => expect(result.current.loadingList).toBe(false));

    await act(async () => {
      await result.current.selectConversation("3f1c2b9e-0000-4000-8000-000000000002", { markRead: false });
    });
    const before = hoisted.detailCalls.length;
    await act(async () => {
      for (const callback of [...hoisted.resumeCallbacks]) callback();
    });

    expect(hoisted.detailCalls.length).toBeGreaterThan(before);
    expect(hoisted.detailCalls.at(-1)).toBe("3f1c2b9e-0000-4000-8000-000000000002");
  });
});
