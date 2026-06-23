import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn() }),
}));

import { useDogEditForm } from "./useDogEditForm.js";

const baseDog = {
  id: "d1",
  name: "Alfie",
  breed: "Poodle",
  size: "small",
  isPregnant: false,
  alerts: [],
};

describe("useDogEditForm: is_pregnant save mapping", () => {
  it("includes isPregnant in the update when toggled on", async () => {
    const onUpdateDog = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDogEditForm({ resolvedDog: baseDog, ownerOpenValue: "", humans: {}, onUpdateDog }),
    );

    act(() => result.current.setEditIsPregnant(true));
    await act(async () => {
      await result.current.handleSave();
    });

    expect(onUpdateDog).toHaveBeenCalledWith("d1", expect.objectContaining({ isPregnant: true }));
  });

  it("omits isPregnant when unchanged", async () => {
    const onUpdateDog = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDogEditForm({ resolvedDog: baseDog, ownerOpenValue: "", humans: {}, onUpdateDog }),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(onUpdateDog.mock.calls[0][1]).not.toHaveProperty("isPregnant");
  });
});
