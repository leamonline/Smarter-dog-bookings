// src/components/ui/StackPile.jsx
//
// The pile of cards behind a lifted card, as one tap target. While a card is
// lifted out of the day stack, every other card collapses to its top edge
// just below the open card and becomes `inert`; this opaque button covers
// the clipped edges, so the way back is visible as well as named — for
// a finger, a keyboard and a screen reader alike, rather than seven covered
// strips that each half-work.
//
// Presentational: position and size come from the stack's layout. It sits
// beside the stack's list rather than in it, so a screen reader counts one
// list item per dog.
import { ArrowLeft } from "lucide-react";

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
        className="flex w-full items-center gap-2 rounded-tile border border-brand-paper-line bg-white px-3 text-body text-brand-ink outline-none hover:bg-brand-paper motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        style={{ height: Math.max(MIN_TARGET, height) }}
      >
        <ArrowLeft size={16} aria-hidden="true" className="shrink-0" />
        <span className="font-semibold">Back to the day</span>
        <span className="ml-auto text-right text-caption text-ink-muted">
          {count} other {count === 1 ? "dog" : "dogs"}
        </span>
      </button>
    </div>
  );
}
