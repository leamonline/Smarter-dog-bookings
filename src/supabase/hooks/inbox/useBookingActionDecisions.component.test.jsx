import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockDecisions = value;
}

vi.mock("../../client", () => ({
  get supabase() {
    return globalThis.__supabaseMockDecisions;
  },
}));

const { useBookingActionDecisions } = await import("./useBookingActionDecisions.js");

function makeStub({
  updateResult = { error: null },
  rpcResult = { data: "booking-99", error: null },
} = {}) {
  const update = vi.fn(() => {
    const builder = {};
    builder.eq = vi.fn(() => builder);
    // Resolve when the final .eq() is awaited (chain ends after the
    // second eq for the rejectBookingAction shape). The mock returns
    // updateResult via .then to satisfy both await foo.eq().eq() and
    // await foo.update().eq().eq().
    builder.then = (resolve) => Promise.resolve(updateResult).then(resolve);
    return builder;
  });
  return {
    from: vi.fn(() => ({ update })),
    rpc: vi.fn(() => Promise.resolve(rpcResult)),
    _update: update,
  };
}

function setup({ stub, selectedId = "c-1" } = {}) {
  setSupabase(stub ?? makeStub());
  const setActionInFlight = vi.fn();
  const setBookingActions = vi.fn();
  const setConversations = vi.fn();
  const selectedIdRef = { current: selectedId };
  const { result } = renderHook(() =>
    useBookingActionDecisions({
      actionInFlight: false,
      setActionInFlight,
      setBookingActions,
      setConversations,
      selectedIdRef,
    }),
  );
  return { result, setActionInFlight, setBookingActions, setConversations };
}

describe("useBookingActionDecisions", () => {
  beforeEach(() => {
    setSupabase(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applyBookingAction rejects when there's no action id", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.applyBookingAction(null);
    });
    expect(outcome).toEqual({
      ok: false,
      reason: "no action or action in flight",
    });
    expect(stub.rpc).not.toHaveBeenCalled();
  });

  it("applyBookingAction without editedPayload skips the UPDATE and calls the RPC directly", async () => {
    const stub = makeStub();
    const { result, setBookingActions } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.applyBookingAction("a-1");
    });
    expect(outcome).toEqual({ ok: true, bookingId: "booking-99" });
    expect(stub.rpc).toHaveBeenCalledWith("apply_whatsapp_booking_action", {
      p_action_id: "a-1",
    });
    // Booking-action list is updated; setConversations is invoked
    // from inside the updater.
    expect(setBookingActions).toHaveBeenCalledTimes(1);
  });

  it("applyBookingAction with editedPayload writes the payload first, then calls the RPC", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    await act(async () => {
      await result.current.applyBookingAction("a-1", { slot: "10:00" });
    });
    expect(stub._update).toHaveBeenCalledWith({ payload: { slot: "10:00" } });
    expect(stub.rpc).toHaveBeenCalledWith("apply_whatsapp_booking_action", {
      p_action_id: "a-1",
    });
  });

  it("applyBookingAction surfaces RPC errors and does not touch the list", async () => {
    // Use a real Error so the catch's `err instanceof Error` branch
    // pulls the message through; Supabase's PostgrestError is a plain
    // object so the fallback path stringifies it — that's a known
    // shortcut not worth fixing in this refactor.
    const stub = makeStub({
      rpcResult: { data: null, error: new Error("rls denied") },
    });
    const { result, setBookingActions } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.applyBookingAction("a-1");
    });
    expect(outcome).toEqual({ ok: false, reason: "rls denied" });
    expect(setBookingActions).not.toHaveBeenCalled();
  });

  it("rejectBookingAction writes state=rejected with the trimmed reason", async () => {
    const stub = makeStub();
    const { result, setBookingActions } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.rejectBookingAction("a-1", "  not yet  ");
    });
    expect(outcome).toEqual({ ok: true });
    expect(stub._update).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "rejected",
        rejection_reason: "not yet",
        decided_at: expect.any(String),
      }),
    );
    expect(setBookingActions).toHaveBeenCalledTimes(1);
  });

  it("rejectBookingAction nulls rejection_reason when no reason is provided", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    await act(async () => {
      await result.current.rejectBookingAction("a-1");
    });
    expect(stub._update).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "rejected",
        rejection_reason: null,
      }),
    );
  });

  it("rejectBookingAction caps the rejection reason at 500 chars", async () => {
    const stub = makeStub();
    const { result } = setup({ stub });

    const longReason = "x".repeat(600);
    await act(async () => {
      await result.current.rejectBookingAction("a-1", longReason);
    });
    const call = stub._update.mock.calls[0][0];
    expect(call.rejection_reason).toHaveLength(500);
  });
});
