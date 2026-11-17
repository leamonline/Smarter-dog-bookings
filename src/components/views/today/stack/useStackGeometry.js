import { useLayoutEffect, useState } from "react";
import { STACK_STRIP_HEIGHT } from "./stackLayout";

/**
 * The lifted card's real height, measured: its strip plus whatever its full
 * view holds. Nothing else in the stack is measured — every resting card is
 * the same height by construction — and nothing assumes a phone or a nav bar.
 */
export function useLiftedHeight(listRef, liftedId) {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !liftedId) {
      setHeight(0);
      return undefined;
    }
    const card = [...list.children].find((el) => el.dataset.bookingId === liftedId);
    const details = card?.querySelector("[data-stack-details]");
    const measure = () => {
      const next = STACK_STRIP_HEIGHT + (details?.getBoundingClientRect().height || 0);
      setHeight((old) => (old === next ? old : next));
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" && details ? new ResizeObserver(measure) : null;
    observer?.observe(details);
    return () => observer?.disconnect();
  }, [listRef, liftedId]);
  return height;
}

/**
 * Where a lifted card goes: the top of what is visible now, in the list's
 * own coordinates, taken once so scrolling the open card moves nothing.
 */
export function measureLiftFrame(list, { topMargin = 8 } = {}) {
  const main = list.closest("main") || document.documentElement;
  const mainRect = main.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const visibleTop = Math.max(mainRect.top, 0);
  // Whole pixels: a fractional transform blurs text and shaves a 44px button
  // to 43.9999px.
  return {
    top: Math.round(visibleTop + topMargin - listRect.top),
  };
}
