import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";

function setSupabase(value) {
  globalThis.__supabaseMockLifecycle = value;
}

vi.mock("../../client", () => ({
  get supabase() {
    return globalThis.__supabaseMockLifecycle;
  },
}));

const { useConversationLifecycle } = await import("./useConversationLifecycle");

function makeStub({ updateResult = { error: null }, currentUserId = "user-1" } = {}) {
  const update = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve(updateResult)),
    in: vi.fn(() => Promise.resolve(updateResult)),
  }));
  return {
    from: vi.fn(() => ({ update })),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: { id: currentUserId } } }),
      ),
    },
    _update: update,
  };
}

function setup({ selectedId = "c-1", conversations = [], stub } = {}) {
  setSupabase(stub ?? makeStub());
  const setActionInFlight = vi.fn();
  const { result } = renderHook(() =>
    useConversationLifecycle({
      selectedId,
      actionInFlight: false,
      setActionInFlight,
      conversations,
    }),
  );
  return { result, setActionInFlight };
}

describe("useConversationLifecycle", () => {
  beforeEach(() => {
    setSupabase(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([false, true])("keeps local closure state in step with stored rows (write fails: %s)", async (writeFails) => {
    const initial = [{ id: "c-1", closed_at: null }, { id: "c-2", closed_at: null }];
    let storedRows = initial.map((row) => ({ ...row }));
    setSupabase({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      from: () => ({ update: (patch) => ({ eq: async (_, id) => {
        if (writeFails) return { error: new Error("Save failed") };
        storedRows = storedRows.map((row) => row.id === id ? { ...row, ...patch } : row);
        return { error: null };
      } }) }),
    });
    const { result } = renderHook(() => {
      const [conversations, setConversations] = useState(initial);
      const [selectedId, select] = useState("c-1");
      const actions = useConversationLifecycle({
        selectedId, conversations, setConversations,
        actionInFlight: false, setActionInFlight: () => {},
      });
      return { conversations, select, ...actions };
    });
    await act(async () => { await result.current.resolveConversation(); });
    expect(result.current.conversations).toEqual(storedRows);
    if (writeFails) {
      expect(storedRows).toEqual(initial);
      return;
    }
    expect(storedRows[0].closed_at).toEqual(expect.any(String));
    act(() => result.current.select("c-2"));
    await act(async () => { await result.current.resolveConversation(); });
    expect(result.current.conversations.filter((row) => !row.closed_at)).toEqual([]);
    expect(result.current.conversations).toEqual(storedRows);
    await act(async () => { await result.current.reopenConversation("c-1"); });
    expect(result.current.conversations.filter((row) => !row.closed_at).map((row) => row.id)).toEqual(["c-1"]);
    expect(result.current.conversations).toEqual(storedRows);
  });

  it("takeoverConversation flips state to human_takeover", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.takeoverConversation();
    });
    expect(outcome).toEqual({ ok: true });
    expect(stub._update).toHaveBeenCalledWith({ state: "human_takeover" });
  });

  it("releaseConversation flips state to ai_handling", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.releaseConversation();
    });
    expect(outcome).toEqual({ ok: true });
    expect(stub._update).toHaveBeenCalledWith({ state: "ai_handling" });
  });

  it("takeoverConversation no-ops when there is no selectedId", async () => {
    const stub = makeStub();
    const { result } = setup({ stub, selectedId: null });

    let outcome;
    await act(async () => {
      outcome = await result.current.takeoverConversation();
    });
    expect(outcome).toEqual({ ok: false });
    expect(stub._update).not.toHaveBeenCalled();
  });

  it("resolveConversation inherits the closure_suggested_reason when present", async () => {
    const stub = makeStub();
    const conversations = [
      { id: "c-1", closure_suggested_reason: "no_response_3d" },
    ];
    const { result } = setup({ stub, conversations });

    let outcome;
    await act(async () => {
      outcome = await result.current.resolveConversation();
    });
    expect(outcome).toEqual({ ok: true, reason: "no_response_3d" });
    expect(stub._update).toHaveBeenCalledWith(
      expect.objectContaining({
        closure_reason: "no_response_3d",
        closed_by: "user-1",
        closed_at: expect.any(String),
        closure_suggested_at: null,
        closure_suggested_reason: null,
      }),
    );
  });

  it("resolveConversation falls back to 'manual' when there's no active suggestion", async () => {
    const stub = makeStub();
    const conversations = [{ id: "c-1", closure_suggested_reason: null }];
    const { result } = setup({ stub, conversations });

    let outcome;
    await act(async () => {
      outcome = await result.current.resolveConversation();
    });
    expect(outcome.reason).toBe("manual");
    expect(stub._update).toHaveBeenCalledWith(
      expect.objectContaining({ closure_reason: "manual" }),
    );
  });

  it("reopenConversation clears the closure fields", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.reopenConversation();
    });
    expect(outcome).toEqual({ ok: true });
    expect(stub._update).toHaveBeenCalledWith({
      closed_at: null,
      closure_reason: null,
      closure_suggested_at: null,
      closure_suggested_reason: null,
    });
  });

  it("reopenConversation accepts an explicit conversation id for closed threads", async () => {
    const stub = makeStub();
    const { result } = setup({ stub, selectedId: null });

    let outcome;
    await act(async () => {
      outcome = await result.current.reopenConversation("c-99");
    });
    expect(outcome).toEqual({ ok: true });
    // .eq(...) called with "c-99" not selectedId.
    const eqCall = stub._update.mock.results[0].value.eq;
    expect(eqCall).toHaveBeenCalledWith("id", "c-99");
  });

  it("bulkResolveConversations closes every id in a single .in() round-trip", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.bulkResolveConversations(["a", "b", "c"]);
    });
    expect(outcome).toEqual({ ok: true, ids: ["a", "b", "c"] });
    expect(stub._update).toHaveBeenCalledTimes(1);
    expect(stub._update).toHaveBeenCalledWith(
      expect.objectContaining({
        closed_at: expect.any(String),
        closed_by: "user-1",
        closure_reason: "manual",
        closure_suggested_at: null,
        closure_suggested_reason: null,
      }),
    );
    const inCall = stub._update.mock.results[0].value.in;
    expect(inCall).toHaveBeenCalledWith("id", ["a", "b", "c"]);
  });

  it("bulkResolveConversations no-ops on an empty selection", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.bulkResolveConversations([]);
    });
    expect(outcome).toEqual({ ok: false });
    expect(stub._update).not.toHaveBeenCalled();
  });

  it("bulkReopenConversations reopens every id in a single .in() round-trip", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.bulkReopenConversations(["a", "b"]);
    });
    expect(outcome).toEqual({ ok: true });
    expect(stub._update).toHaveBeenCalledWith({
      closed_at: null,
      closure_reason: null,
      closure_suggested_at: null,
      closure_suggested_reason: null,
    });
    const inCall = stub._update.mock.results[0].value.in;
    expect(inCall).toHaveBeenCalledWith("id", ["a", "b"]);
  });
});
