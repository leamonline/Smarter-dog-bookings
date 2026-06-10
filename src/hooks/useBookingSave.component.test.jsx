import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBookingSave } from "./useBookingSave";

// Regression guards for the save pipeline's result handling (PR #255
// finding 4): useDogs.updateDog resolves to undefined for an UNKNOWN dog
// and null for a FAILED save — both must stop the booking write, or the
// dog edits are silently lost while the booking still saves.

const booking = {
  id: "b1",
  _dogId: "dog-1",
  dogName: "Bella",
  size: "small",
  slot: "09:00",
  service: "full-groom",
  addons: [],
  status: "Booked",
};

function makeParams(overrides = {}) {
  return {
    editData: {
      service: "full-groom",
      pickupBy: "",
      payment: "Due at Pick-up",
      depositAmount: 0,
      groomNotes: "Teddy cut",
      alerts: [],
      addons: [],
      date: new Date(2026, 3, 6),
      slot: "09:00",
      customPrice: 0,
    },
    setSaving: vi.fn(),
    setSaveError: vi.fn(),
    setIsEditing: vi.fn(),
    hasAllergy: false,
    allergyInput: "",
    booking,
    humans: {},
    currentDateObj: new Date(2026, 3, 6),
    currentDateStr: "2026-04-06",
    editDayOpen: true,
    editSettings: {},
    editActiveSlots: ["09:00", "10:00"],
    otherBookings: [],
    allowedServices: [{ id: "full-groom" }],
    onUpdate: vi.fn().mockResolvedValue({ ...booking }),
    onUpdateDog: vi.fn().mockResolvedValue({ id: "dog-1" }),
    ...overrides,
  };
}

describe("useBookingSave result handling", () => {
  it("saves when both callbacks resolve to records", async () => {
    const params = makeParams();
    const { result } = renderHook(() => useBookingSave(params));

    await act(async () => {
      await result.current.save();
    });

    expect(params.onUpdateDog).toHaveBeenCalledWith("dog-1", {
      alerts: [],
      groomNotes: "Teddy cut",
      customPrice: 0,
    });
    expect(params.onUpdate).toHaveBeenCalledTimes(1);
    expect(params.setIsEditing).toHaveBeenCalledWith(false);
    expect(params.setSaveError).toHaveBeenCalledWith("");
  });

  it("stops before the booking write when the dog is unknown (undefined)", async () => {
    const params = makeParams({
      onUpdateDog: vi.fn().mockResolvedValue(undefined),
    });
    const { result } = renderHook(() => useBookingSave(params));

    await act(async () => {
      await result.current.save();
    });

    expect(params.setSaveError).toHaveBeenCalledWith("Could not update dog details");
    expect(params.onUpdate).not.toHaveBeenCalled();
    expect(params.setIsEditing).not.toHaveBeenCalled();
  });

  it("stops before the booking write when the dog save fails (null)", async () => {
    const params = makeParams({
      onUpdateDog: vi.fn().mockResolvedValue(null),
    });
    const { result } = renderHook(() => useBookingSave(params));

    await act(async () => {
      await result.current.save();
    });

    expect(params.setSaveError).toHaveBeenCalledWith("Could not update dog details");
    expect(params.onUpdate).not.toHaveBeenCalled();
  });

  it("surfaces a failed booking write and stays in edit mode", async () => {
    const params = makeParams({
      onUpdate: vi.fn().mockResolvedValue(null),
    });
    const { result } = renderHook(() => useBookingSave(params));

    await act(async () => {
      await result.current.save();
    });

    expect(params.setSaveError).toHaveBeenCalledWith("Could not save booking changes");
    expect(params.setIsEditing).not.toHaveBeenCalled();
  });
});
