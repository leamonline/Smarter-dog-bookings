/**
 * dockedRail — the one definition of "the context rail is a column, not a sheet".
 *
 * The booking/customer context has two personalities, and several places need
 * to agree on which one is on screen:
 *
 *   - Below the `wide` breakpoint it is an overlay sliding in over the thread.
 *     It gets the scrim, the focus trap and Escape-to-dismiss, and inserting
 *     offered times steps it aside so the reply is visible.
 *   - At `wide` and above it is the permanently docked third column of the
 *     workspace grid. Nothing is covered, so trapping focus inside it would
 *     strand keyboard users in a pane they can see past — and dismissing it
 *     means nothing, because it never goes away.
 *
 * The query mirrors Tailwind's `wide:` variant (`--breakpoint-wide: 90rem` in
 * src/index.css) in the same unit it is declared in. In rem rather than the
 * 1440px it usually resolves to, so the JS view and the CSS view cannot drift
 * apart for anyone whose browser default font size is not 16px — the layout
 * then changes personality at one width, not two.
 */
import { useMediaQuery } from "../../../../hooks/useMediaQuery";

export const DOCKED_RAIL_QUERY = "(min-width: 90rem)";

/** One-shot read, for event handlers that only need the current answer. */
export function isRailDocked(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.(DOCKED_RAIL_QUERY)?.matches === true;
}

/** Reactive read, so a resize re-renders whatever depends on it. */
export function useRailDocked(): boolean {
  return useMediaQuery(DOCKED_RAIL_QUERY);
}
