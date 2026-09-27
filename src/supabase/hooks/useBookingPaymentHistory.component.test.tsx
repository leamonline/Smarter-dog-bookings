import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  historyResult: { data: [] as Record<string, unknown>[], error: null as null | { code?: string; message: string } },
  profilesResult: { data: [] as Record<string, unknown>[], error: null as null | { message: string } },
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("../client", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

import { useBookingPaymentHistory } from "./useBookingPaymentHistory";

function historyQuery() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({ limit: vi.fn(async () => mocks.historyResult) })),
      })),
    })),
  };
}

function profilesQuery() {
  return {
    select: vi.fn(() => ({ in: vi.fn(async () => mocks.profilesResult) })),
  };
}

describe("useBookingPaymentHistory", () => {
  beforeEach(() => {
    mocks.historyResult = { data: [], error: null };
    mocks.profilesResult = { data: [], error: null };
    mocks.rpc.mockReset();
    mocks.from.mockReset().mockImplementation((table) => table === "booking_payment_history" ? historyQuery() : profilesQuery());
  });

  it("loads newest history and resolves staff display names", async () => {
    mocks.historyResult.data = [{
      id: 7,
      booking_id: "booking-1",
      operation: "UPDATE",
      before_values: {},
      after_values: {},
      actor_id: "staff-1",
      actor_role: "authenticated",
      recorded_at: "2026-09-27T12:00:00Z",
      restored_from: null,
      reason: null,
    }];
    mocks.profilesResult.data = [{ user_id: "staff-1", display_name: "Sam" }];

    const { result } = renderHook(() => useBookingPaymentHistory("booking-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.events[0].actorName).toBe("Sam");
    expect(mocks.from).toHaveBeenCalledWith("booking_payment_history");
    expect(mocks.from).toHaveBeenCalledWith("staff_profiles");
  });

  it("passes the reviewed latest event to recovery and explains stale failures", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "40001", message: "Payment history changed since it was reviewed" },
    });
    const { result } = renderHook(() => useBookingPaymentHistory("booking-1", { enabled: false }));

    await expect(act(() => result.current.restore(4, 9, "Wrong amount"))).rejects.toThrow(
      "Reload the history and review it",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("restore_booking_payment", {
      p_booking_id: "booking-1",
      p_event_id: 4,
      p_expected_latest_id: 9,
      p_reason: "Wrong amount",
    });
  });
});
