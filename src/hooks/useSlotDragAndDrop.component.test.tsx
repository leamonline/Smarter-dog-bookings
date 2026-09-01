import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSlotDragAndDrop } from "./useSlotDragAndDrop";
import type { Booking } from "../types/index";

// A booking with just the fields the hook reads. The hook never inspects
// anything beyond `id` and `slot`; the cast keeps the fixture honest about that.
const booking = { id: "b-1", slot: "09:00" } as unknown as Booking;

// Minimal stand-in for React.DragEvent: the hook touches preventDefault and
// dataTransfer only. jsdom has no DataTransfer constructor, so build one by hand.
function dragEvent() {
  const dataTransfer = {
    setData: vi.fn(),
    effectAllowed: "",
    dropEffect: "",
  };
  return {
    preventDefault: vi.fn(),
    dataTransfer,
  } as unknown as React.DragEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
    dataTransfer: typeof dataTransfer;
  };
}

describe("useSlotDragAndDrop", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useSlotDragAndDrop({ onMoveBooking: vi.fn() }));
    expect(result.current.isDragging).toBe(false);
    expect(result.current.drag).toEqual({ booking: null, sourceSlot: null, overSlot: null });
  });

  it("dragstart records the booking and its source slot and marks the drag valid for the browser", () => {
    const { result } = renderHook(() => useSlotDragAndDrop({ onMoveBooking: vi.fn() }));
    const e = dragEvent();
    act(() => result.current.onCardDragStart(booking, e));

    expect(result.current.isDragging).toBe(true);
    expect(result.current.drag).toEqual({ booking, sourceSlot: "09:00", overSlot: null });
    // Something must be written to dataTransfer or Firefox refuses the drag.
    expect(e.dataTransfer.setData).toHaveBeenCalledWith("text/plain", "b-1");
    expect(e.dataTransfer.effectAllowed).toBe("move");
  });

  it("dragstart tolerates a booking without an id", () => {
    const { result } = renderHook(() => useSlotDragAndDrop({ onMoveBooking: vi.fn() }));
    const e = dragEvent();
    act(() => result.current.onCardDragStart({ slot: "09:00" } as unknown as Booking, e));
    expect(e.dataTransfer.setData).toHaveBeenCalledWith("text/plain", "");
  });

  it("dragover on another slot accepts the drop and highlights that slot", () => {
    const { result } = renderHook(() => useSlotDragAndDrop({ onMoveBooking: vi.fn() }));
    act(() => result.current.onCardDragStart(booking, dragEvent()));

    const over = dragEvent();
    act(() => result.current.onSlotDragOver("10:00", over));

    // preventDefault is what tells the browser "this is a drop target".
    expect(over.preventDefault).toHaveBeenCalled();
    expect(over.dataTransfer.dropEffect).toBe("move");
    expect(result.current.drag.overSlot).toBe("10:00");
  });

  it("dragover keeps the same state object when the slot has not changed", () => {
    const { result } = renderHook(() => useSlotDragAndDrop({ onMoveBooking: vi.fn() }));
    act(() => result.current.onCardDragStart(booking, dragEvent()));
    act(() => result.current.onSlotDragOver("10:00", dragEvent()));
    const before = result.current.drag;
    act(() => result.current.onSlotDragOver("10:00", dragEvent()));
    expect(result.current.drag).toBe(before);
  });

  it("dragover ignores the source slot, a rejected target, and a drag that never started", () => {
    const canDropAt = vi.fn((_b: Booking, slot: string) => slot !== "11:00");
    const { result } = renderHook(() =>
      useSlotDragAndDrop({ onMoveBooking: vi.fn(), canDropAt }),
    );

    // No drag in progress: nothing happens, no preventDefault.
    const idle = dragEvent();
    act(() => result.current.onSlotDragOver("10:00", idle));
    expect(idle.preventDefault).not.toHaveBeenCalled();

    act(() => result.current.onCardDragStart(booking, dragEvent()));

    const same = dragEvent();
    act(() => result.current.onSlotDragOver("09:00", same));
    expect(same.preventDefault).not.toHaveBeenCalled();
    expect(result.current.drag.overSlot).toBeNull();

    const rejected = dragEvent();
    act(() => result.current.onSlotDragOver("11:00", rejected));
    expect(canDropAt).toHaveBeenCalledWith(booking, "11:00");
    expect(rejected.preventDefault).not.toHaveBeenCalled();
    expect(result.current.drag.overSlot).toBeNull();
  });

  it("dragleave clears the highlight only for the slot that was highlighted", () => {
    const { result } = renderHook(() => useSlotDragAndDrop({ onMoveBooking: vi.fn() }));
    act(() => result.current.onCardDragStart(booking, dragEvent()));
    act(() => result.current.onSlotDragOver("10:00", dragEvent()));

    // Leaving a different slot (event ordering across children) must not clear it.
    act(() => result.current.onSlotDragLeave("10:30"));
    expect(result.current.drag.overSlot).toBe("10:00");

    act(() => result.current.onSlotDragLeave("10:00"));
    expect(result.current.drag.overSlot).toBeNull();
    // Still dragging — only the highlight went.
    expect(result.current.isDragging).toBe(true);
  });

  it("drop on a new slot hands the move to onMoveBooking and resets the drag", async () => {
    const onMoveBooking = vi.fn(async () => {});
    const { result } = renderHook(() => useSlotDragAndDrop({ onMoveBooking }));
    act(() => result.current.onCardDragStart(booking, dragEvent()));
    act(() => result.current.onSlotDragOver("10:00", dragEvent()));

    const drop = dragEvent();
    await act(async () => {
      await result.current.onSlotDrop("10:00", drop);
    });

    expect(drop.preventDefault).toHaveBeenCalled();
    expect(onMoveBooking).toHaveBeenCalledWith(booking, "10:00");
    expect(result.current.isDragging).toBe(false);
    expect(result.current.drag).toEqual({ booking: null, sourceSlot: null, overSlot: null });
  });

  it("drop on the source slot or a rejected slot resets the drag without moving anything", async () => {
    const onMoveBooking = vi.fn(async () => {});
    const canDropAt = vi.fn((_b: Booking, slot: string) => slot !== "11:00");
    const { result } = renderHook(() => useSlotDragAndDrop({ onMoveBooking, canDropAt }));

    act(() => result.current.onCardDragStart(booking, dragEvent()));
    await act(async () => {
      await result.current.onSlotDrop("09:00", dragEvent());
    });
    expect(onMoveBooking).not.toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);

    act(() => result.current.onCardDragStart(booking, dragEvent()));
    await act(async () => {
      await result.current.onSlotDrop("11:00", dragEvent());
    });
    expect(onMoveBooking).not.toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
  });

  it("drop with no drag in progress is a harmless no-op", async () => {
    const onMoveBooking = vi.fn(async () => {});
    const { result } = renderHook(() => useSlotDragAndDrop({ onMoveBooking }));
    const drop = dragEvent();
    await act(async () => {
      await result.current.onSlotDrop("10:00", drop);
    });
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(onMoveBooking).not.toHaveBeenCalled();
  });

  it("dragend (cancelled drag) resets the state so a later drop cannot move a stale booking", async () => {
    const onMoveBooking = vi.fn(async () => {});
    const { result } = renderHook(() => useSlotDragAndDrop({ onMoveBooking }));
    act(() => result.current.onCardDragStart(booking, dragEvent()));
    act(() => result.current.onCardDragEnd());
    expect(result.current.isDragging).toBe(false);

    await act(async () => {
      await result.current.onSlotDrop("10:00", dragEvent());
    });
    expect(onMoveBooking).not.toHaveBeenCalled();
  });
});
