// Movement that explains itself.
//
// When a dog changes state its token has to travel — Arriving to With us, With
// us to Ready — because the whole premise of the board is that position IS
// status. A token that teleports leaves the user asking "did that work, and
// where did it go?"; a token that slides answers both without a word.
//
// FLIP (First, Last, Invert, Play): measure where every token was, let React
// re-render, measure where each ended up, apply the inverse transform, then
// release it. One 220 ms ease-out — long enough to follow, short enough that a
// busy morning never waits for the interface.
//
// Reduced motion is honoured by doing nothing at all: the token simply appears
// in its new zone, and the toast plus the aria-live announcement carry the
// change instead.
import { useCallback, useLayoutEffect, useRef } from "react";

const DURATION_MS = 220;
const EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
/** Below this the move is imperceptible and animating it just adds jitter. */
const MIN_TRAVEL_PX = 4;

function prefersReducedMotion() {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

/**
 * @param {string} signature changes whenever the board's arrangement changes;
 *   the hook re-measures on each new value.
 */
export function useTokenFlip(signature) {
  const nodes = useRef(new Map());
  const previous = useRef(new Map());

  const registerRef = useCallback((id, node) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const before = previous.current;
    const after = new Map();

    for (const [id, node] of nodes.current) {
      if (!node.isConnected) continue;
      const rect = node.getBoundingClientRect();
      after.set(id, rect);
      const last = before.get(id);
      if (!last) continue;
      const dx = last.left - rect.left;
      const dy = last.top - rect.top;
      if (Math.abs(dx) < MIN_TRAVEL_PX && Math.abs(dy) < MIN_TRAVEL_PX) continue;
      if (prefersReducedMotion()) continue;

      node.animate?.(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: DURATION_MS, easing: EASING },
      );
    }

    previous.current = after;
  }, [signature]);

  return registerRef;
}
