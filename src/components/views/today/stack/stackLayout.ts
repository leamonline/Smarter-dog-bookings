// Where every card in the day stack sits, as pure arithmetic.
//
// At rest the stack is a wallet: every card is the same height and each one
// overlaps the one before it, so exactly STACK_STRIP_HEIGHT of every card shows
// and the last card shows in full. One geometry for the whole list — the old
// stack used two (uncovered cards above the selection, overlapped ones below),
// and the breed line sat on the first pixel the next card covered.
//
// Lifted, one card moves to the top of what is visible and opens; every other
// card collapses into a shallow pile directly below it. The pile's labelled
// return button covers the edges: tapping it puts the day back.

/** The part of every card that always shows. Everything essential lives here. */
export const STACK_STRIP_HEIGHT = 72;
/** Every card's resting height: the strip plus a short, read-only face. */
export const STACK_CARD_HEIGHT = 128;
/** How much of each card in the pile shows. */
export const PILE_EDGE = 8;
/**
 * The front card of the pile shows a little more, so the pile reads as cards —
 * but stops above the strip's first line of text (11px down), so the pile is
 * edges only and never half a word.
 */
export const PILE_PEEK = 10;
/** Past this many, further cards hide behind the deepest edge. */
export const PILE_MAX_EDGES = 4;
/** The pile's tap target never shrinks below the app's 44px touch floor. */
export const PILE_TAP_MIN = 44;
const GAP = 12;

export interface LiftFrame {
  /** Where the lifted card's top goes, in the list's own coordinates. */
  top: number;
}

export interface StackLayoutInput {
  count: number;
  /** -1 (or omitted) when nothing is lifted. */
  liftedIndex?: number;
  /** The lifted card's measured full height (strip + details). */
  liftedHeight?: number;
  /** Fixed when the card is lifted, so scrolling the open card moves nothing. */
  frame?: LiftFrame | null;
  /** 0..1 while a pull-to-refresh gesture spreads the resting stack. */
  pullProgress?: number;
}

export interface StackLayout {
  positions: number[];
  /**
   * Per card, how much of it may show (px from its top), or null for no clip.
   * Pile cards are clipped to their edge so their bodies cannot hang below
   * the pile into the page.
   */
  clips: (number | null)[];
  height: number;
  /** The pile's tap target, while a card is lifted. */
  pile: { top: number; height: number; count: number } | null;
}

function restingHeight(count: number, step: number): number {
  return count ? (count - 1) * step + STACK_CARD_HEIGHT : 0;
}

export function stackLayout({
  count,
  liftedIndex = -1,
  liftedHeight = 0,
  frame = null,
  pullProgress = 0,
}: StackLayoutInput): StackLayout {
  if (count === 0) return { positions: [], clips: [], height: 0, pile: null };

  const lifted = liftedIndex >= 0 && liftedIndex < count ? liftedIndex : -1;
  if (lifted === -1) {
    const pull = Math.min(1, Math.max(0, pullProgress));
    const step = STACK_STRIP_HEIGHT + (STACK_CARD_HEIGHT + GAP - STACK_STRIP_HEIGHT) * pull;
    return {
      positions: Array.from({ length: count }, (_, index) => index * step),
      clips: Array.from({ length: count }, () => null),
      height: restingHeight(count, step),
      pile: null,
    };
  }

  const top = Math.max(0, frame?.top ?? 0);
  const fullHeight = Math.max(liftedHeight, STACK_CARD_HEIGHT);
  const others = count - 1;
  const edges = Math.min(others, PILE_MAX_EDGES);
  const pileDepth = others ? (edges - 1) * PILE_EDGE + PILE_PEEK : 0;
  // Keep the way back with the card, rather than marooning unlabelled edges
  // at the viewport bottom with a screenful of empty space between them.
  const pileTop = top + fullHeight + GAP;

  const positions: number[] = [];
  const clips: (number | null)[] = [];
  let pileIndex = 0;
  for (let index = 0; index < count; index += 1) {
    if (index === lifted) {
      positions.push(top);
      clips.push(null);
      continue;
    }
    // DOM order is kept, so later cards still sit on top. The earliest ones
    // share the deepest position once there are more than PILE_MAX_EDGES.
    const slot = Math.max(0, pileIndex - (others - edges));
    positions.push(pileTop + slot * PILE_EDGE);
    clips.push(pileIndex === others - 1 ? PILE_PEEK : PILE_EDGE);
    pileIndex += 1;
  }

  return {
    positions,
    clips,
    height: others ? pileTop + Math.max(PILE_TAP_MIN, pileDepth) : top + fullHeight,
    pile: others ? { top: pileTop, height: pileDepth, count: others } : null,
  };
}
