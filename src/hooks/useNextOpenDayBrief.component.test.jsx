// Hook-level tests for the closed-day brief data hooks: the offline branch
// (null client → available:false, never an asserted-empty diary) and
// abort-on-unmount. The pure/core functions have their own logic tests.
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mutable mock: null = offline; an object = a stub client.
const clientRef = { current: null };
vi.mock("../supabase/client.js", () => ({
  get supabase() {
    return clientRef.current;
  },
}));

import { useNextOpenDayBrief } from "./useNextOpenDayBrief";
import { useUnpaidFortnight } from "./useUnpaidFortnight";

beforeEach(() => {
  clientRef.current = null;
});

describe("useNextOpenDayBrief (hook)", () => {
  it("offline: reports available:false but still names the default next open day", async () => {
    const { result } = renderHook(() => useNextOpenDayBrief("2026-07-10", true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.available).toBe(false);
    expect(result.current.dateStr).toBe("2026-07-13"); // Friday → default-open Monday
    expect(result.current.bookings).toEqual([]);
  });

  it("does nothing when not enabled (open day)", () => {
    const { result } = renderHook(() => useNextOpenDayBrief("2026-07-10", false));
    expect(result.current.loading).toBe(true); // initial state, no fetch fired
  });

  it("aborts the in-flight fetch on unmount (no state update after)", async () => {
    let capturedSignal = null;
    const builder = {};
    for (const m of ["select", "gt", "gte", "lt", "lte", "eq", "neq", "order"]) {
      builder[m] = vi.fn().mockReturnValue(builder);
    }
    builder.abortSignal = vi.fn((signal) => {
      capturedSignal = signal;
      return new Promise(() => {}); // never resolves — stays in flight
    });
    clientRef.current = { from: vi.fn().mockReturnValue(builder) };
    const { unmount } = renderHook(() => useNextOpenDayBrief("2026-07-10", true));
    await waitFor(() => expect(capturedSignal).not.toBeNull());
    expect(capturedSignal.aborted).toBe(false);
    unmount();
    expect(capturedSignal.aborted).toBe(true);
  });
});

describe("useUnpaidFortnight (hook)", () => {
  it("offline: available:false, count 0", async () => {
    const { result } = renderHook(() => useUnpaidFortnight("2026-07-10"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, available: false, count: 0 });
  });
});
