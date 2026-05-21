import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockDraft = value;
}

vi.mock("../../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockDraft;
  },
}));

const { useDraftActions } = await import("./useDraftActions.js");

function makeStub({
  invokeResult = { data: { ok: true }, error: null },
  rpcResult = { data: "booking-99", error: null },
  updateResult = { error: null },
} = {}) {
  const update = vi.fn(() => {
    const builder = {};
    builder.eq = vi.fn(() => builder);
    builder.then = (resolve) => Promise.resolve(updateResult).then(resolve);
    return builder;
  });
  return {
    functions: {
      invoke: vi.fn(() => Promise.resolve(invokeResult)),
    },
    rpc: vi.fn(() => Promise.resolve(rpcResult)),
    from: vi.fn(() => ({ update })),
    _update: update,
  };
}

function setup({
  stub,
  draft = { id: "d-1" },
  attachedActions = [],
  selectedId = "c-1",
} = {}) {
  setSupabase(stub ?? makeStub());
  const setActionInFlight = vi.fn();
  const setDraft = vi.fn();
  const setBookingActions = vi.fn();
  const setConversations = vi.fn();
  const selectedIdRef = { current: selectedId };
  const { result } = renderHook(() =>
    useDraftActions({
      draft,
      attachedActions,
      actionInFlight: false,
      selectedId,
      setActionInFlight,
      setDraft,
      setBookingActions,
      setConversations,
      selectedIdRef,
    }),
  );
  return { result, setDraft, setBookingActions, setConversations };
}

describe("useDraftActions", () => {
  beforeEach(() => {
    setSupabase(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("approveDraft posts whatsapp-send with draft mode and clears local draft on success", async () => {
    const stub = makeStub();
    const { result, setDraft, setConversations } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.approveDraft({ editedText: "edited" });
    });
    expect(outcome.ok).toBe(true);
    expect(stub.functions.invoke).toHaveBeenCalledWith("whatsapp-send", {
      body: { mode: "draft", draft_id: "d-1", edited_text: "edited" },
    });
    expect(setDraft).toHaveBeenCalledWith(null);
    expect(setConversations).toHaveBeenCalledTimes(1);
  });

  it("approveDraft skips edited_text when not provided", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    await act(async () => {
      await result.current.approveDraft();
    });
    expect(stub.functions.invoke).toHaveBeenCalledWith("whatsapp-send", {
      body: { mode: "draft", draft_id: "d-1" },
    });
  });

  it("approveDraft returns the error when whatsapp-send returns an error envelope", async () => {
    const stub = makeStub({
      invokeResult: { data: { error: "24h_window_expired" }, error: null },
    });
    const { result, setDraft } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.approveDraft();
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("24h_window_expired");
    expect(setDraft).not.toHaveBeenCalled();
  });

  it("approveDraftAndApply falls through to approveDraft when there are no attached actions", async () => {
    const stub = makeStub();
    const { result, setDraft } = setup({ stub, attachedActions: [] });

    await act(async () => {
      await result.current.approveDraftAndApply();
    });
    // Same single-send call as approveDraft.
    expect(stub.functions.invoke).toHaveBeenCalledTimes(1);
    expect(stub.rpc).not.toHaveBeenCalled();
    expect(setDraft).toHaveBeenCalledWith(null);
  });

  it("approveDraftAndApply applies each attached action sequentially then sends", async () => {
    const stub = makeStub();
    const attachedActions = [
      { id: "a-1", payload: { dog_name: "Bella" } },
      { id: "a-2", payload: { dog_name: "Max" } },
    ];
    const { result, setBookingActions } = setup({ stub, attachedActions });

    let outcome;
    await act(async () => {
      outcome = await result.current.approveDraftAndApply();
    });
    expect(outcome.ok).toBe(true);
    expect(stub.rpc).toHaveBeenCalledTimes(2);
    expect(stub.rpc).toHaveBeenNthCalledWith(1, "apply_whatsapp_booking_action", {
      p_action_id: "a-1",
    });
    expect(stub.rpc).toHaveBeenNthCalledWith(2, "apply_whatsapp_booking_action", {
      p_action_id: "a-2",
    });
    expect(stub.functions.invoke).toHaveBeenCalledTimes(1);
    expect(setBookingActions).toHaveBeenCalledTimes(1);
  });

  it("approveDraftAndApply stops on first apply failure and never calls whatsapp-send", async () => {
    const stub = makeStub({
      rpcResult: { data: null, error: { message: "rls denied" } },
    });
    const attachedActions = [{ id: "a-1", payload: { dog_name: "Bella" } }];
    const { result } = setup({ stub, attachedActions });

    let outcome;
    await act(async () => {
      outcome = await result.current.approveDraftAndApply();
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain("Apply failed for Bella");
    expect(stub.functions.invoke).not.toHaveBeenCalled();
  });

  it("rejectDraft writes state=rejected with the trimmed reason", async () => {
    const stub = makeStub();
    const { result, setDraft } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.rejectDraft({ reason: "  too formal  " });
    });
    expect(outcome.ok).toBe(true);
    expect(stub._update).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "rejected",
        rejected_reason: "too formal",
        decided_at: expect.any(String),
      }),
    );
    expect(setDraft).toHaveBeenCalledWith(null);
  });

  it("rejectDraft accepts null reason for self-explanatory rejects", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    await act(async () => {
      await result.current.rejectDraft();
    });
    expect(stub._update).toHaveBeenCalledWith(
      expect.objectContaining({ rejected_reason: null }),
    );
  });

  it("sendManualReply trims whitespace and rejects empty messages without hitting Supabase", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.sendManualReply({ text: "   " });
    });
    expect(outcome).toEqual({ ok: false, reason: "empty message" });
    expect(stub.functions.invoke).not.toHaveBeenCalled();
  });

  it("sendManualReply posts whatsapp-send with mode=manual and trimmed text", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.sendManualReply({ text: "  hello there  " });
    });
    expect(outcome.ok).toBe(true);
    expect(stub.functions.invoke).toHaveBeenCalledWith("whatsapp-send", {
      body: { mode: "manual", conversation_id: "c-1", text: "hello there" },
    });
  });

  it("sendManualReply no-ops when there's no selectedId", async () => {
    const stub = makeStub();
    const { result } = setup({ stub, selectedId: null });

    let outcome;
    await act(async () => {
      outcome = await result.current.sendManualReply({ text: "hi" });
    });
    expect(outcome.ok).toBe(false);
    expect(stub.functions.invoke).not.toHaveBeenCalled();
  });
});
