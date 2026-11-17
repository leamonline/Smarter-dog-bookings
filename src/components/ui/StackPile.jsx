// src/components/ui/StackPile.jsx
//
// The pile of cards behind a lifted card, as one tap target. While a card is
// lifted out of the day stack, every other card collapses to its top edge at
// the bottom of the visible area and becomes `inert`; this button sits over
// them, so "tap the pile" is a single, named action — "Back to the day" — for
// a finger, a keyboard and a screen reader alike, rather than seven covered
// strips that each half-work.
//
// Presentational: position and size come from the stack's layout. It sits
// beside the stack's list rather than in it, so a screen reader counts one
// list item per dog.

/** The smallest tap target this app allows (--spacing-touch-target). */
const MIN_TARGET = 44;

/**
 * @param {{
 *   top: number;
 *   height: number;
 *   count: number;
 *   zIndex: number;
 *   onClose: () => void;
 * }} props
 */
export function StackPile({ top, height, count, zIndex, onClose }) {
  const label = `Back to the day — ${count} other ${count === 1 ? "dog" : "dogs"}`;
  return (
    <div data-stack-pile-frame className="wallet-pile" style={{ zIndex, transform: `translate3d(0, ${top}px, 0)` }}>
      <button
        type="button"
        data-stack-pile
        aria-label={label}
        onClick={onClose}
        className="block w-full rounded-card bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        style={{ height: Math.max(MIN_TARGET, height) }}
      />
    </div>
  );
}
