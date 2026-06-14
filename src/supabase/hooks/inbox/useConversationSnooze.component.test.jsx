import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockConversationSnooze = value;
}

vi.mock("../../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockConversationSnooze;
  },
}));

const { useConversationSnooze } = await import("./useConversationSnooze.js");

function makeStub({ updateResult = { error: null } } = {}) {
  const eq = vi.fn(() => Promise.resolve(updateResult));
  const update = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ update })), _update: update, _eq: eq };
}

function setup({ selectedId = "conv-1", stub } = {}) {
  setSupabase(stub ?? makeStub());
  const setActionInFlight = vi.fn();
  const setConversations = vi.fn();
  const { result } = renderHook(() =>
    useConversationSnooze({
      selectedId,
      actionInFlight: false,
      setActionInFlight,
      setConversations,
    }),
  );
  return { result, setActionInFlight, setConversations };
}

describe("useConversationSnooze", () => {
  beforeEach(() => {
    setSupabase(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("snoozes the selected conversation and updates local state", async () => {
    const stub = makeStub();
    const { result, setActionInFlight, setConversations } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.snoozeConversation("2026-06-12T15:00:00.000Z");
    });

    expect(outcome).toEqual({ ok: true });
    expect(stub.from).toHaveBeenCalledWith("whatsapp_conversations");
    expect(stub._update).toHaveBeenCalledWith({
      state: "snoozed",
      snoozed_until: "2026-06-12T15:00:00.000Z",
    });
    expect(stub._eq).toHaveBeenCalledWith("id", "conv-1");
    expect(setActionInFlight).toHaveBeenNthCalledWith(1, true);
    expect(setActionInFlight).toHaveBeenLastCalledWith(false);

    const updater = setConversations.mock.calls[0][0];
    expect(
      updater([
        { id: "conv-1", state: "ai_handling", snoozed_until: null },
        { id: "conv-2", state: "ai_handling", snoozed_until: null },
      ]),
    ).toEqual([
      {
        id: "conv-1",
        state: "snoozed",
        snoozed_until: "2026-06-12T15:00:00.000Z",
      },
      { id: "conv-2", state: "ai_handling", snoozed_until: null },
    ]);
  });

  it("unsnoozes the selected conversation", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    await act(async () => {
      await result.current.unsnoozeConversation();
    });

    expect(stub._update).toHaveBeenCalledWith({
      state: "ai_handling",
      snoozed_until: null,
    });
  });
});
