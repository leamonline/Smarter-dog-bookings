import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("../client.js", () => ({
  supabase: { rpc },
}));

const { useBookingPolicyRuntime } = await import("./useBookingPolicyRuntime");

const RULES = {
  bookingHorizonDays: 180,
  autoConfirm: true,
  depositHoldHours: 12,
  depositBank: {
    accountName: "",
    sortCode: "",
    accountNumber: "",
  },
  termsUrl: "https://smarterdog.co.uk/terms",
  depositTermsVersion: null,
  depositTermsContentHash: null,
  customerPortal: {
    allowCancellations: true,
    allowRescheduling: true,
    allowRepeatBooking: false,
    showHistory: true,
  },
};

function mockInitialLoad(
  state: "inactive" | "scheduled" | "active",
  scheduledEffectiveAt: string | null = null,
) {
  rpc.mockImplementation((name: string) => {
    if (name === "booking_policy_runtime_status") {
      return Promise.resolve({
        data: { state, scheduledEffectiveAt },
        error: null,
      });
    }
    if (name === "current_booking_rules") {
      return Promise.resolve({ data: RULES, error: null });
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
}

beforeEach(() => {
  rpc.mockReset();
});

describe("useBookingPolicyRuntime", () => {
  it.each([
    ["inactive", null],
    ["scheduled", "2026-08-01T14:00:00Z"],
    ["active", null],
  ] as const)("loads the %s server-owned runtime state", async (state, scheduledAt) => {
    mockInitialLoad(state, scheduledAt);

    const { result } = renderHook(() => useBookingPolicyRuntime());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.runtime).toEqual({
      state,
      scheduledEffectiveAt: scheduledAt,
    });
    expect(result.current.rules).toEqual(RULES);
  });

  it("saves through update_booking_rules and replaces local state with the reloaded server projection", async () => {
    mockInitialLoad("inactive");
    const { result } = renderHook(() => useBookingPolicyRuntime());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const reloaded = { ...RULES, bookingHorizonDays: 365 };
    rpc.mockResolvedValueOnce({ data: reloaded, error: null });

    await act(async () => {
      await expect(
        result.current.updateRules({ bookingHorizonDays: 365 }),
      ).resolves.toEqual({ ok: true });
    });

    expect(rpc).toHaveBeenLastCalledWith("update_booking_rules", {
      p_rules: { bookingHorizonDays: 365 },
    });
    expect(result.current.rules.bookingHorizonDays).toBe(365);
  });

  it("keeps the last confirmed projection on screen until the server accepts the save", async () => {
    mockInitialLoad("inactive");
    const { result } = renderHook(() => useBookingPolicyRuntime());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resolveSave!: (value: {
      data: typeof RULES;
      error: null;
    }) => void;
    rpc.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );

    let pendingSave!: Promise<unknown>;
    await act(async () => {
      pendingSave = result.current.updateRules({ bookingHorizonDays: 365 });
      await Promise.resolve();
    });
    expect(result.current.rules.bookingHorizonDays).toBe(180);

    await act(async () => {
      resolveSave({
        data: { ...RULES, bookingHorizonDays: 365 },
        error: null,
      });
      await pendingSave;
    });
    expect(result.current.rules.bookingHorizonDays).toBe(365);
  });

  it("keeps the confirmed state and exposes a server rejection", async () => {
    mockInitialLoad("inactive");
    const { result } = renderHook(() => useBookingPolicyRuntime());
    await waitFor(() => expect(result.current.loading).toBe(false));

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "bookingHorizonDays must be between 1 and 730" },
    });

    await act(async () => {
      await expect(
        result.current.updateRules({ bookingHorizonDays: 731 }),
      ).resolves.toEqual({
        ok: false,
        error: "bookingHorizonDays must be between 1 and 730",
      });
    });

    expect(result.current.rules.bookingHorizonDays).toBe(180);
  });
});
