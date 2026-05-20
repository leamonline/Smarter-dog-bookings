import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockAIMode = value;
}

vi.mock("../../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockAIMode;
  },
}));

const { useAIModeControls } = await import("./useAIModeControls.js");

function makeStub({ updateResult = { error: null } } = {}) {
  const update = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve(updateResult)),
  }));
  return { from: vi.fn(() => ({ update })), _update: update };
}

function setup({ selectedId = "c-1", conversations = [{ id: "c-1" }], stub } = {}) {
  setSupabase(stub ?? makeStub());
  const setActionInFlight = vi.fn();
  const setConversations = vi.fn();
  const { result } = renderHook(() =>
    useAIModeControls({
      selectedId,
      actionInFlight: false,
      setActionInFlight,
      conversations,
      setConversations,
    }),
  );
  return { result, setActionInFlight, setConversations };
}

describe("useAIModeControls", () => {
  beforeEach(() => {
    setSupabase(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("setAutoSendEnabled writes the flag and optimistically updates the list", async () => {
    const stub = makeStub();
    const { result, setConversations } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.setAutoSendEnabled(true);
    });
    expect(outcome).toEqual({ ok: true });
    expect(stub._update).toHaveBeenCalledWith({ auto_send_enabled: true });
    // Optimistic flip lands first, no rollback because no error.
    expect(setConversations).toHaveBeenCalledTimes(1);
  });

  it("setAutoSendEnabled rolls back the optimistic flip when the write fails", async () => {
    const stub = makeStub({
      updateResult: { error: { message: "boom" } },
    });
    const { result, setConversations } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.setAutoSendEnabled(true);
    });
    expect(outcome.ok).toBe(false);
    // Two setConversations calls: optimistic flip + rollback.
    expect(setConversations).toHaveBeenCalledTimes(2);
  });

  it("setAIMode rejects unknown modes without touching supabase", async () => {
    const stub = makeStub();
    const { result, setConversations } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.setAIMode("crayon");
    });
    expect(outcome).toEqual({ ok: false, reason: "unknown mode: crayon" });
    expect(stub._update).not.toHaveBeenCalled();
    expect(setConversations).not.toHaveBeenCalled();
  });

  it("setAIMode 'ai_auto' enables auto-send and (optionally) autonomous booking", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    await act(async () => {
      await result.current.setAIMode("ai_auto", { allowAutonomousBooking: true });
    });
    expect(stub._update).toHaveBeenCalledWith({
      state: "ai_handling",
      auto_send_enabled: true,
      autonomous_booking_enabled: true,
    });
  });

  it("setAIMode 'human_only' switches state to human_takeover and disables auto-send", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    await act(async () => {
      await result.current.setAIMode("human_only");
    });
    expect(stub._update).toHaveBeenCalledWith({
      state: "human_takeover",
      auto_send_enabled: false,
      autonomous_booking_enabled: false,
    });
  });

  it("setAIMode rolls back to the prior snapshot when the write fails", async () => {
    const conversations = [
      {
        id: "c-1",
        state: "ai_handling",
        auto_send_enabled: true,
        autonomous_booking_enabled: true,
      },
    ];
    const stub = makeStub({ updateResult: { error: { message: "rls" } } });
    const { result, setConversations } = setup({ stub, conversations });

    let outcome;
    await act(async () => {
      outcome = await result.current.setAIMode("human_only");
    });
    expect(outcome.ok).toBe(false);
    // Two setConversations: optimistic + rollback.
    expect(setConversations).toHaveBeenCalledTimes(2);
  });
});
