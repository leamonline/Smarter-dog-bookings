import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => ({
  connected: true,
  loadPageAvailability: vi.fn(),
  loadBookingRules: vi.fn(),
}));

vi.mock("./useCustomerAvailability", () => ({
  useCustomerAvailability: () => availability,
}));

import { nextSlotWindow, useNextAvailableSlot } from "./useNextAvailableSlot";

const DOG = { id: "tipi", size: "medium", isPregnant: false };

function pageResult({ openError = null, occError = null, blockedError = null, open = [] } = {}) {
  return [
    { data: open, error: openError },
    { byDate: {}, error: occError },
    [{ byDate: {}, error: blockedError }],
  ];
}

beforeEach(() => {
  availability.connected = true;
  availability.loadPageAvailability.mockReset();
  availability.loadBookingRules.mockReset().mockResolvedValue(null);
});

describe("nextSlotWindow", () => {
  it("starts tomorrow and covers 28 days", () => {
    const dates = nextSlotWindow(new Date(2026, 10, 15));
    expect(dates[0]).toBe("2026-11-16");
    expect(dates).toHaveLength(28);
    expect(dates[27]).toBe("2026-12-13");
  });
});

describe("useNextAvailableSlot", () => {
  it("finds the first open day's earliest slot", async () => {
    const open = nextSlotWindow().map((date, i) => ({ setting_date: date, is_open: i === 2 }));
    availability.loadPageAvailability.mockResolvedValue(pageResult({ open }));
    const { result } = renderHook(() => useNextAvailableSlot(DOG, "human-1"));
    await waitFor(() => expect(result.current.status).toBe("found"));
    expect(result.current.slot.date).toBe(nextSlotWindow()[2]);
    expect(availability.loadBookingRules).toHaveBeenCalledWith("human-1");
  });

  it.each([
    ["open days", { openError: new Error("x") }],
    ["occupancy", { occError: new Error("x") }],
    ["blocked seats", { blockedError: new Error("x") }],
  ])("fails closed when the %s read fails", async (_label, failure) => {
    availability.loadPageAvailability.mockResolvedValue(pageResult(failure));
    const { result } = renderHook(() => useNextAvailableSlot(DOG, "human-1"));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("fails closed when the read throws", async () => {
    availability.loadPageAvailability.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useNextAvailableSlot(DOG, "human-1"));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("makes no reads when disabled, offline, or for a dog the wizard would grey out", () => {
    renderHook(() => useNextAvailableSlot(DOG, "human-1", false));
    renderHook(() => useNextAvailableSlot({ ...DOG, size: null }, "human-1"));
    renderHook(() => useNextAvailableSlot({ ...DOG, isPregnant: true }, "human-1"));
    availability.connected = false;
    const { result } = renderHook(() => useNextAvailableSlot(DOG, "human-1"));
    expect(result.current.status).toBe("idle");
    expect(availability.loadPageAvailability).not.toHaveBeenCalled();
  });
});
