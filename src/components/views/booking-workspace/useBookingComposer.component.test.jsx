import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useBookingComposer } from "./useBookingComposer.js";

const DOGS = [
  { id: "d1", name: "Alfie", breed: "Cockapoo", size: "small" },
  { id: "d2", name: "Bella", breed: "Cocker", size: "medium" },
  { id: "d3", name: "Pip", breed: "Unknown", size: null },
];

function setup(props = {}) {
  return renderHook(
    ({ conversationId, dogs, lastServiceByDogId }) =>
      useBookingComposer({ conversationId, dogs, lastServiceByDogId }),
    {
      initialProps: {
        conversationId: "c1",
        dogs: DOGS,
        lastServiceByDogId: {},
        ...props,
      },
    },
  );
}

describe("useBookingComposer", () => {
  it("starts with no mode chosen so staff pick the action", () => {
    const { result } = setup();
    expect(result.current.mode).toBeNull();
    expect(result.current.selectedDogIds).toEqual([]);
  });

  it("selects and deselects dogs", () => {
    const { result } = setup();
    act(() => result.current.actions.setMode("offer"));
    act(() => result.current.actions.toggleDog("d1"));
    expect(result.current.selectedDogIds).toEqual(["d1"]);
    act(() => result.current.actions.toggleDog("d2"));
    expect(result.current.selectedDogIds).toEqual(["d1", "d2"]);
    act(() => result.current.actions.toggleDog("d1"));
    expect(result.current.selectedDogIds).toEqual(["d2"]);
  });

  it("refuses to select a dog with no size", () => {
    const { result } = setup();
    act(() => result.current.actions.toggleDog("d3"));
    expect(result.current.selectedDogIds).toEqual([]);
  });

  it("gives a newly selected dog its default service", () => {
    const { result } = setup({ lastServiceByDogId: { d1: "bath-and-brush" } });
    act(() => result.current.actions.toggleDog("d1"));
    act(() => result.current.actions.toggleDog("d2"));
    expect(result.current.servicesByDogId.d1).toBe("bath-and-brush");
    expect(result.current.servicesByDogId.d2).toBe("full-groom");
  });

  it("lets staff override a service", () => {
    const { result } = setup();
    act(() => result.current.actions.toggleDog("d1"));
    act(() => result.current.actions.setService("d1", "bath-and-deshed"));
    expect(result.current.servicesByDogId.d1).toBe("bath-and-deshed");
  });

  it("caps offered slots at three", () => {
    const { result } = setup();
    act(() => result.current.actions.toggleDog("d1"));
    for (const slot of ["09:00", "09:30", "10:00", "10:30"]) {
      act(() => result.current.actions.toggleSlot({ dateStr: "2026-08-17", slot }));
    }
    expect(result.current.slotChoices).toHaveLength(3);
    expect(result.current.atSlotLimit).toBe(true);
  });

  it("keeps slots chosen across different dates", () => {
    const { result } = setup();
    act(() => result.current.actions.toggleDog("d1"));
    act(() => result.current.actions.toggleSlot({ dateStr: "2026-08-17", slot: "11:00" }));
    act(() => result.current.actions.toggleSlot({ dateStr: "2026-08-18", slot: "12:30" }));
    expect(result.current.slotChoices).toHaveLength(2);
  });

  it("reports readiness only once a dog and a slot are chosen", () => {
    const { result } = setup();
    act(() => result.current.actions.setMode("offer"));
    expect(result.current.canSubmitOffer).toBe(false);
    act(() => result.current.actions.toggleDog("d1"));
    expect(result.current.canSubmitOffer).toBe(false);
    act(() => result.current.actions.toggleSlot({ dateStr: "2026-08-17", slot: "11:00" }));
    expect(result.current.canSubmitOffer).toBe(true);
  });

  it("builds the offer text from the current selection", () => {
    const { result } = setup();
    act(() => result.current.actions.toggleDog("d1"));
    act(() => result.current.actions.toggleSlot({ dateStr: "2026-08-17", slot: "11:00" }));
    const text = result.current.offerText("Steve Lillis");
    expect(text).toContain("Hi Steve");
    expect(text).toContain("Alfie");
    expect(text).toContain("Monday 17 August at 11:00");
  });

  // The pane must survive a responsive re-layout. State is keyed to the
  // conversation, so re-rendering with the same id must not clear it.
  it("keeps selections when props change but the conversation does not", () => {
    const { result, rerender } = setup();
    act(() => result.current.actions.toggleDog("d1"));
    act(() => result.current.actions.toggleSlot({ dateStr: "2026-08-17", slot: "11:00" }));
    rerender({ conversationId: "c1", dogs: [...DOGS], lastServiceByDogId: {} });
    expect(result.current.selectedDogIds).toEqual(["d1"]);
    expect(result.current.slotChoices).toHaveLength(1);
  });

  it("resets when the conversation changes", () => {
    const { result, rerender } = setup();
    act(() => result.current.actions.setMode("offer"));
    act(() => result.current.actions.toggleDog("d1"));
    rerender({ conversationId: "c2", dogs: DOGS, lastServiceByDogId: {} });
    expect(result.current.selectedDogIds).toEqual([]);
    expect(result.current.mode).toBeNull();
  });

  it("resets when staff explicitly cancel", () => {
    const { result } = setup();
    act(() => result.current.actions.setMode("offer"));
    act(() => result.current.actions.toggleDog("d1"));
    act(() => result.current.actions.cancel());
    expect(result.current.mode).toBeNull();
    expect(result.current.selectedDogIds).toEqual([]);
  });

  describe("staged navigation for narrow layouts", () => {
    it("advances and retreats without losing selections", () => {
      const { result } = setup();
      act(() => result.current.actions.setMode("offer"));
      expect(result.current.stage).toBe("dogs");
      act(() => result.current.actions.toggleDog("d1"));
      act(() => result.current.actions.goToStage("slots"));
      expect(result.current.stage).toBe("slots");
      act(() => result.current.actions.goToStage("dogs"));
      expect(result.current.stage).toBe("dogs");
      expect(result.current.selectedDogIds).toEqual(["d1"]);
    });
  });

  describe("auto-selecting the only dog", () => {
    const ONE_DOG = [{ id: "d1", name: "Alfie", breed: "Cockapoo", size: "small" }];
    // A sizeless dog doesn't count as a second option — it was never a real
    // choice to begin with.
    const ONE_SELECTABLE_PLUS_SIZELESS = [
      { id: "d1", name: "Alfie", breed: "Cockapoo", size: "small" },
      { id: "d4", name: "Pip", breed: "Unknown", size: null },
    ];

    it("pre-selects the only dog on entry, with its default service", () => {
      const { result } = setup({ dogs: ONE_DOG, lastServiceByDogId: { d1: "bath-and-brush" } });
      act(() => result.current.actions.setMode("offer"));
      expect(result.current.selectedDogIds).toEqual(["d1"]);
      expect(result.current.servicesByDogId.d1).toBe("bath-and-brush");
    });

    it("still auto-selects when the only OTHER dog has no size", () => {
      const { result } = setup({ dogs: ONE_SELECTABLE_PLUS_SIZELESS });
      act(() => result.current.actions.setMode("offer"));
      expect(result.current.selectedDogIds).toEqual(["d1"]);
    });

    it("does not auto-select when there is more than one eligible dog", () => {
      const { result } = setup(); // default fixture: two selectable dogs
      act(() => result.current.actions.setMode("offer"));
      expect(result.current.selectedDogIds).toEqual([]);
    });

    it("does not crash with no dogs at all", () => {
      const { result } = setup({ dogs: [] });
      act(() => result.current.actions.setMode("offer"));
      expect(result.current.selectedDogIds).toEqual([]);
    });

    it("still lets staff change the auto-selected dog", () => {
      const { result } = setup({ dogs: ONE_DOG });
      act(() => result.current.actions.setMode("offer"));
      act(() => result.current.actions.toggleDog("d1"));
      expect(result.current.selectedDogIds).toEqual([]);
    });
  });
});
