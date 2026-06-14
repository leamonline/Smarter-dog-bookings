import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockConversationNotes = value;
}

vi.mock("../../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockConversationNotes;
  },
}));

const { useConversationNotes } = await import("./useConversationNotes.js");

function makeStub({ updateResult = { error: null } } = {}) {
  const eq = vi.fn(() => Promise.resolve(updateResult));
  const update = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ update })), _update: update, _eq: eq };
}

function setup({ selectedId = "conv-1", stub } = {}) {
  setSupabase(stub ?? makeStub());
  const setConversations = vi.fn();
  const { result } = renderHook(() =>
    useConversationNotes({
      selectedId,
      setConversations,
    }),
  );
  return { result, setConversations };
}

describe("useConversationNotes", () => {
  beforeEach(() => {
    setSupabase(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes notes to the selected conversation and updates local state", async () => {
    const stub = makeStub();
    const { result, setConversations } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.updateConversationNotes("Bring harness next time.");
    });

    expect(outcome).toEqual({ ok: true });
    expect(stub.from).toHaveBeenCalledWith("whatsapp_conversations");
    expect(stub._update).toHaveBeenCalledWith({ notes: "Bring harness next time." });
    expect(stub._eq).toHaveBeenCalledWith("id", "conv-1");

    expect(setConversations).toHaveBeenCalledTimes(1);
    const updater = setConversations.mock.calls[0][0];
    expect(
      updater([
        { id: "conv-1", notes: "Old note" },
        { id: "conv-2", notes: "Leave alone" },
      ]),
    ).toEqual([
      { id: "conv-1", notes: "Bring harness next time." },
      { id: "conv-2", notes: "Leave alone" },
    ]);
  });

  it("stores blank notes as null", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    await act(async () => {
      await result.current.updateConversationNotes("   ");
    });

    expect(stub._update).toHaveBeenCalledWith({ notes: null });
  });
});
