import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("../client", () => ({
  bookingPolicyClient: { rpc },
}));

const {
  BOOKING_POLICY_INVALIDATED_EVENT,
  useBookingPolicyRuntime,
} = await import("./useBookingPolicyRuntime");

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

afterEach(() => {
  vi.useRealTimers();
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

  it("polls every non-active state and stops only after the server confirms active", async () => {
    vi.useFakeTimers();
    let state: "inactive" | "active" = "inactive";
    mockInitialLoad(state);

    const { result } = renderHook(() => useBookingPolicyRuntime());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.runtime.state).toBe("inactive");

    state = "active";
    mockInitialLoad(state);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.runtime.state).toBe("active");

    const confirmedCallCount = rpc.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(rpc).toHaveBeenCalledTimes(confirmedCallCount);
  });

  it("wakes at a scheduled boundary but remains scheduled until the server confirms activation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T13:59:50Z"));
    let state: "scheduled" | "active" = "scheduled";
    let resolveStatus:
      | ((value: {
          data: { state: "active"; scheduledEffectiveAt: null };
          error: null;
        }) => void)
      | undefined;

    rpc.mockImplementation((name: string) => {
      if (name === "booking_policy_runtime_status") {
        if (state === "scheduled") {
          return Promise.resolve({
            data: {
              state,
              scheduledEffectiveAt: "2026-08-01T14:00:00Z",
            },
            error: null,
          });
        }
        return new Promise((resolve) => {
          resolveStatus = resolve;
        });
      }
      if (name === "current_booking_rules") {
        return Promise.resolve({ data: RULES, error: null });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });

    const onInvalidated = vi.fn();
    window.addEventListener(BOOKING_POLICY_INVALIDATED_EVENT, onInvalidated);
    const { result, unmount } = renderHook(() => useBookingPolicyRuntime());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.runtime.state).toBe("scheduled");

    state = "active";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.runtime.state).toBe("scheduled");
    expect(onInvalidated).not.toHaveBeenCalled();

    await act(async () => {
      resolveStatus?.({
        data: { state: "active", scheduledEffectiveAt: null },
        error: null,
      });
      await Promise.resolve();
    });
    expect(result.current.runtime.state).toBe("active");
    expect(onInvalidated).toHaveBeenCalledTimes(1);
    unmount();
    window.removeEventListener(
      BOOKING_POLICY_INVALIDATED_EVENT,
      onInvalidated,
    );
  });

  it.each(["online", "focus"] as const)(
    "reconciles after the browser emits %s",
    async (eventName) => {
      let state: "inactive" | "active" = "inactive";
      mockInitialLoad(state);
      const { result } = renderHook(() => useBookingPolicyRuntime());
      await waitFor(() => expect(result.current.loading).toBe(false));

      state = "active";
      mockInitialLoad(state);
      window.dispatchEvent(new Event(eventName));

      await waitFor(() => expect(result.current.runtime.state).toBe("active"));
    },
  );

  it("does not expose default rules as a confirmed server projection during initial load", async () => {
    let resolveRuntime!: (value: {
      data: { state: "inactive"; scheduledEffectiveAt: null };
      error: null;
    }) => void;
    let resolveRules!: (value: { data: typeof RULES; error: null }) => void;
    rpc.mockImplementation((name: string) => {
      if (name === "booking_policy_runtime_status") {
        return new Promise((resolve) => {
          resolveRuntime = resolve;
        });
      }
      if (name === "current_booking_rules") {
        return new Promise((resolve) => {
          resolveRules = resolve;
        });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });

    const { result } = renderHook(() => useBookingPolicyRuntime());
    expect(result.current.confirmed).toBe(false);

    await act(async () => {
      resolveRuntime({
        data: { state: "inactive", scheduledEffectiveAt: null },
        error: null,
      });
      resolveRules({ data: RULES, error: null });
      await Promise.resolve();
    });
    expect(result.current.confirmed).toBe(true);
  });

  it("serialises full-projection saves so an older response cannot replace a newer change", async () => {
    mockInitialLoad("inactive");
    const { result } = renderHook(() => useBookingPolicyRuntime());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const pendingUpdates: Array<
      (value: { data: typeof RULES; error: null }) => void
    > = [];
    rpc.mockImplementation((name: string) => {
      if (name === "update_booking_rules") {
        return new Promise((resolve) => {
          pendingUpdates.push(resolve);
        });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });

    let firstSave!: Promise<unknown>;
    let secondSave!: Promise<unknown>;
    await act(async () => {
      firstSave = result.current.updateRules({ autoConfirm: false });
      secondSave = result.current.updateRules({ depositHoldHours: 36 });
      await Promise.resolve();
    });
    expect(
      rpc.mock.calls.filter(([name]) => name === "update_booking_rules"),
    ).toHaveLength(1);

    await act(async () => {
      pendingUpdates[0]({
        data: { ...RULES, autoConfirm: false },
        error: null,
      });
      await firstSave;
      await Promise.resolve();
    });
    expect(
      rpc.mock.calls.filter(([name]) => name === "update_booking_rules"),
    ).toHaveLength(2);

    await act(async () => {
      pendingUpdates[1]({
        data: {
          ...RULES,
          autoConfirm: false,
          depositHoldHours: 36,
        },
        error: null,
      });
      await secondSave;
    });
    expect(result.current.rules.autoConfirm).toBe(false);
    expect(result.current.rules.depositHoldHours).toBe(36);
  });
});
