// Direct manipulation: pick a dog up, put it in the next zone.
//
// Drag is an ACCELERATOR, never a requirement. Every move it performs is also
// a labelled item in the token's action panel, so keyboard users, screen
// reader users and anyone on a phone lose nothing by never dragging — and
// anyone who does drag runs exactly the same handler, so the unpaid-collection
// safeguard and the staff-reviewed collection notice still fire.
//
// Safety rules, in order of how much trouble they prevent:
//   • Forward, one zone at a time. Skipping a care step needs the confirm
//     dialog; going backwards is a correction and belongs in the menu where
//     the words can be read before the press.
//   • Touch needs a 200 ms hold. Without it, every attempt to scroll a busy
//     board would fling a dog into the next zone.
//   • A move that lands still offers Undo in its toast, so a mis-drop costs
//     one press rather than a phone call to an owner.
import { useCallback, useEffect, useRef, useState } from "react";
import { canDragToken, dropZoneFor } from "../../../../engine/salonBoard";

/** Pointer travel that turns a mouse press into a drag. */
const MOUSE_THRESHOLD = 6;
/** Hold before a touch becomes a drag rather than a scroll. */
const TOUCH_HOLD_MS = 200;
/** Travel that cancels a pending touch hold — the finger is scrolling. */
const TOUCH_CANCEL_TRAVEL = 10;

export function useTokenDrag({ enabled = true, onDrop }) {
  const [drag, setDrag] = useState(null);
  const pending = useRef(null);
  const active = useRef(null);
  const justDragged = useRef(false);

  const clearPending = useCallback(() => {
    if (pending.current?.holdTimer) clearTimeout(pending.current.holdTimer);
    pending.current = null;
  }, []);

  const end = useCallback((commit) => {
    const current = active.current;
    active.current = null;
    clearPending();
    setDrag(null);
    if (!current) return;
    try {
      current.element?.releasePointerCapture?.(current.pointerId);
    } catch {
      // The pointer may already be gone (element unmounted mid-drag).
    }
    // Any real drag suppresses the click that a pointerup would otherwise
    // synthesise, so releasing a dog never also opens its menu.
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 0);
    if (commit && current.targetZone && current.targetZone !== current.token.zone) {
      onDrop?.(current.token, current.targetZone);
    }
  }, [clearPending, onDrop]);

  /** The zone under the pointer, when the drop there would be legal. */
  const zoneAt = useCallback((x, y, token) => {
    const legal = dropZoneFor(token);
    if (!legal) return null;
    const element = document.elementFromPoint(x, y);
    const zone = element?.closest?.("[data-drop-zone]")?.getAttribute("data-drop-zone");
    return zone === legal ? legal : null;
  }, []);

  const activate = useCallback((token, element, pointerId, x, y) => {
    clearPending();
    active.current = { token, element, pointerId, targetZone: null };
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // Capture is a nicety; the window listeners below still track the drag.
    }
    setDrag({ bookingId: String(token.booking.id), zone: token.zone, targetZone: null, x, y });
  }, [clearPending]);

  const onPointerDown = useCallback((event, token) => {
    if (!enabled || !canDragToken(token)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const element = event.currentTarget;
    const start = { x: event.clientX, y: event.clientY };
    if (event.pointerType === "touch") {
      const holdTimer = setTimeout(
        () => activate(token, element, event.pointerId, start.x, start.y),
        TOUCH_HOLD_MS,
      );
      pending.current = { token, element, pointerId: event.pointerId, start, holdTimer, touch: true };
      return;
    }
    pending.current = { token, element, pointerId: event.pointerId, start, holdTimer: null, touch: false };
  }, [activate, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    const onMove = (event) => {
      const waiting = pending.current;
      if (waiting && !active.current) {
        const travel = Math.hypot(event.clientX - waiting.start.x, event.clientY - waiting.start.y);
        if (waiting.touch) {
          // Moving before the hold fires means the finger meant to scroll.
          if (travel > TOUCH_CANCEL_TRAVEL) clearPending();
        } else if (travel > MOUSE_THRESHOLD) {
          activate(waiting.token, waiting.element, waiting.pointerId, event.clientX, event.clientY);
        }
        return;
      }
      const current = active.current;
      if (!current) return;
      const targetZone = zoneAt(event.clientX, event.clientY, current.token);
      current.targetZone = targetZone;
      setDrag((previous) => (previous
        ? { ...previous, x: event.clientX, y: event.clientY, targetZone }
        : previous));
    };

    const onUp = () => {
      if (active.current) end(true);
      else clearPending();
    };
    const onCancel = () => {
      if (active.current) end(false);
      else clearPending();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape" && active.current) {
        event.stopPropagation();
        end(false);
      }
    };
    // Once a drag is live the page must stop scrolling under it. Registered
    // globally (and non-passively) rather than as `touch-action: none` on the
    // tokens themselves, which would make a board of dogs impossible to
    // scroll past on a phone.
    const onTouchMove = (event) => {
      if (active.current) event.preventDefault();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [activate, clearPending, enabled, end, zoneAt]);

  useEffect(() => () => {
    if (pending.current?.holdTimer) clearTimeout(pending.current.holdTimer);
  }, []);

  return {
    drag,
    onPointerDown,
    /** True for the instant after a drag, so its pointerup can't open a menu. */
    consumedClick: () => justDragged.current,
  };
}
