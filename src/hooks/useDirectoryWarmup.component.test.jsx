// useDirectoryWarmup latch tests. Lives in the component project (jsdom)
// because the hook needs renderHook + a router context for useLocation.
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { useDirectoryWarmup } from "./useDirectoryWarmup.js";

function wrapperAt(path) {
  return function Wrapper({ children }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useDirectoryWarmup", () => {
  it("starts false on the calendar route with the modal closed", () => {
    vi.useFakeTimers(); // freeze time so the idle fallback can't fire
    const { result } = renderHook(
      () => useDirectoryWarmup({ newBookingOpen: false }),
      { wrapper: wrapperAt("/") },
    );
    expect(result.current).toBe(false);
  });

  it("is true immediately on /dogs and /humans routes (including profile URLs)", () => {
    vi.useFakeTimers();
    for (const path of ["/dogs", "/dogs/abc-123", "/humans", "/humans/h-1"]) {
      const { result, unmount } = renderHook(
        () => useDirectoryWarmup({ newBookingOpen: false }),
        { wrapper: wrapperAt(path) },
      );
      expect(result.current).toBe(true);
      unmount();
    }
  });

  it("latches true when the new-booking modal opens, and stays true after it closes", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ open }) => useDirectoryWarmup({ newBookingOpen: open }),
      { wrapper: wrapperAt("/"), initialProps: { open: false } },
    );
    expect(result.current).toBe(false);

    rerender({ open: true });
    expect(result.current).toBe(true);

    // Let the latch effect commit, then close the modal — the latch holds.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    rerender({ open: false });
    expect(result.current).toBe(true);
  });

  it("flips true via the setTimeout idle fallback after 2.5s", async () => {
    vi.useFakeTimers(); // jsdom has no requestIdleCallback → setTimeout path
    const { result } = renderHook(
      () => useDirectoryWarmup({ newBookingOpen: false }),
      { wrapper: wrapperAt("/") },
    );
    expect(result.current).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2499);
    });
    expect(result.current).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current).toBe(true);
  });

  it("idle-aligns via requestIdleCallback AFTER the 2.5s window when available", async () => {
    vi.useFakeTimers();
    let idleCb = null;
    let idleOpts = null;
    vi.stubGlobal("requestIdleCallback", (cb, opts) => {
      idleCb = cb;
      idleOpts = opts;
      return 1;
    });
    vi.stubGlobal("cancelIdleCallback", vi.fn());

    const { result } = renderHook(
      () => useDirectoryWarmup({ newBookingOpen: false }),
      { wrapper: wrapperAt("/") },
    );
    expect(result.current).toBe(false);
    // A bare requestIdleCallback would fire almost immediately on an idle
    // page, so the hook must not register one until the boot window passed.
    expect(idleCb).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current).toBe(false);
    expect(idleOpts).toEqual({ timeout: 500 });

    await act(async () => {
      idleCb();
    });
    expect(result.current).toBe(true);
  });
});
