import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBookingSession } from "./useBookingSession";

describe("parked booking confirmation choice", () => {
  it("restores the confirmation option chosen before adding a dog", () => {
    const setShowNewBooking = vi.fn();
    const { result } = renderHook(() => useBookingSession({
      showNewBooking: null,
      setShowNewBooking,
      pendingBooking: null,
      setPendingBooking: vi.fn(),
      setShowAddDogModal: vi.fn(),
      clearDogSearch: vi.fn(),
      currentDateStr: "2099-01-05",
    }));
    act(() => {
      result.current.parkBooking({
        dateStr: "2099-01-05",
        slot: "09:00",
        entries: [{ dog: { id: "dog-1" }, humanKey: "Emma", service: "full-groom", addons: [] }],
        owner: { id: "emma-id", label: "Emma", phone: "" },
        confirmationChannel: "none",
      });
    });
    act(() => { result.current.resumeParkedBooking(); });
    const resumed = setShowNewBooking.mock.calls.map(([value]) => value).find((value) => value?.initialEntries);
    expect(resumed).toEqual(expect.objectContaining({
      initialConfirmationChannel: "none",
      dateStr: "2099-01-05",
      slot: "09:00",
    }));
  });
});
