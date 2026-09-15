// useBookingDetailClose — the close/Escape guard of the booking detail modal
// (Debt 9; pure move). The characterisation suite still proves the wiring
// end to end; this pins the hook's own contract.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBookingDetailClose } from "./useBookingDetailClose";

function renderClose(isEditing: boolean) {
  const onClose = vi.fn();
  const setShowExitConfirm = vi.fn();
  const hook = renderHook(
    ({ editing }: { editing: boolean }) =>
      useBookingDetailClose({ isEditing: editing, onClose, setShowExitConfirm }),
    { initialProps: { editing: isEditing } },
  );
  return { ...hook, onClose, setShowExitConfirm };
}

const pressEscape = () => {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  const stop = vi.spyOn(event, "stopPropagation");
  act(() => {
    document.dispatchEvent(event);
  });
  return stop;
};

describe("useBookingDetailClose", () => {
  it("closes straight away when not editing", () => {
    const { result, onClose, setShowExitConfirm } = renderClose(false);
    act(() => result.current.handleCloseAttempt());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setShowExitConfirm).not.toHaveBeenCalled();
  });

  it("opens the exit confirm instead of closing while editing", () => {
    const { result, onClose, setShowExitConfirm } = renderClose(true);
    act(() => result.current.handleCloseAttempt());
    expect(setShowExitConfirm).toHaveBeenCalledWith(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape follows the same rule and stops propagation", () => {
    const { onClose, setShowExitConfirm, rerender } = renderClose(false);
    let stop = pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalled();

    rerender({ editing: true });
    stop = pressEscape();
    expect(setShowExitConfirm).toHaveBeenCalledWith(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalled();
  });

  it("ignores other keys and removes its listener on unmount", () => {
    const { onClose, unmount } = renderClose(false);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(onClose).not.toHaveBeenCalled();
    unmount();
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });
});
