import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockStaffBooking = value;
}

vi.mock("../../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockStaffBooking;
  },
}));

const { useStaffBooking } = await import("./useStaffBooking.js");

function makeStub({ rpcResult = { data: "booking-1", error: null } } = {}) {
  const rpc = vi.fn(() => Promise.resolve(rpcResult));
  return { rpc, _rpc: rpc };
}

function setup({ selectedId = "conv-1", actionInFlight = false, stub } = {}) {
  setSupabase(stub ?? makeStub());
  const setActionInFlight = vi.fn();
  const refreshDetail = vi.fn(() => Promise.resolve());
  const refreshList = vi.fn(() => Promise.resolve());
  const { result } = renderHook(() =>
    useStaffBooking({
      selectedId,
      actionInFlight,
      setActionInFlight,
      refreshDetail,
      refreshList,
    }),
  );
  return { result, setActionInFlight, refreshDetail, refreshList };
}

const payload = {
  dog_id: "dog-1",
  booking_date: "2026-06-20",
  slot: "09:30",
  service: "full-groom",
  size: "small",
};

describe("useStaffBooking", () => {
  beforeEach(() => setSupabase(undefined));
  afterEach(() => vi.restoreAllMocks());

  it("calls the RPC, refreshes thread + list, and returns the booking id", async () => {
    const stub = makeStub();
    const { result, setActionInFlight, refreshDetail, refreshList } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.createStaffBooking(payload);
    });

    expect(outcome).toEqual({ ok: true, bookingId: "booking-1" });
    expect(stub._rpc).toHaveBeenCalledWith("create_staff_booking_from_conversation", {
      p_conversation_id: "conv-1",
      p_payload: payload,
    });
    expect(refreshDetail).toHaveBeenCalledWith("conv-1");
    expect(refreshList).toHaveBeenCalled();
    expect(setActionInFlight).toHaveBeenNthCalledWith(1, true);
    expect(setActionInFlight).toHaveBeenLastCalledWith(false);
  });

  it("surfaces the RPC error reason and does not refresh", async () => {
    const stub = makeStub({ rpcResult: { data: null, error: new Error("slot is full") } });
    const { result, refreshDetail } = setup({ stub });

    let outcome;
    await act(async () => {
      outcome = await result.current.createStaffBooking(payload);
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain("slot is full");
    expect(refreshDetail).not.toHaveBeenCalled();
  });

  it("refuses when no conversation is selected", async () => {
    const { result, setActionInFlight } = setup({ selectedId: null });
    let outcome;
    await act(async () => {
      outcome = await result.current.createStaffBooking(payload);
    });
    expect(outcome.ok).toBe(false);
    expect(setActionInFlight).not.toHaveBeenCalled();
  });

  it("refuses while another action is in flight", async () => {
    const { result } = setup({ actionInFlight: true });
    let outcome;
    await act(async () => {
      outcome = await result.current.createStaffBooking(payload);
    });
    expect(outcome.ok).toBe(false);
  });
});
