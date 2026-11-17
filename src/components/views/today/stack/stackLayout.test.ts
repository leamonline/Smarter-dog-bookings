import { describe, expect, it } from "vitest";
import {
  PILE_EDGE,
  PILE_MAX_EDGES,
  PILE_PEEK,
  PILE_TAP_MIN,
  STACK_CARD_HEIGHT,
  STACK_STRIP_HEIGHT,
  stackLayout,
} from "./stackLayout";

describe("the resting stack", () => {
  it("overlaps every card by the same amount, so exactly a 72px strip of each shows", () => {
    const { positions, clips } = stackLayout({ count: 5 });
    expect(STACK_STRIP_HEIGHT).toBe(72);
    expect(positions).toEqual([0, 72, 144, 216, 288]);
    expect(clips).toEqual([null, null, null, null, null]);
  });

  it("shows the last card in full", () => {
    const { positions, height } = stackLayout({ count: 3 });
    expect(height - positions[2]).toBe(STACK_CARD_HEIGHT);
  });

  it("is one card tall for a one-dog day", () => {
    expect(stackLayout({ count: 1 })).toMatchObject({ positions: [0], height: STACK_CARD_HEIGHT, pile: null });
  });

  it("is empty for an empty day", () => {
    expect(stackLayout({ count: 0 })).toEqual({ positions: [], clips: [], height: 0, pile: null });
  });

  it("spreads with a pull-to-refresh gesture and settles back when it ends", () => {
    const half = stackLayout({ count: 3, pullProgress: 0.5 });
    const full = stackLayout({ count: 3, pullProgress: 1 });
    expect(half.positions[1]).toBeGreaterThan(STACK_STRIP_HEIGHT);
    expect(full.positions[1]).toBeGreaterThan(STACK_CARD_HEIGHT);
    expect(stackLayout({ count: 3, pullProgress: 0 }).positions[1]).toBe(STACK_STRIP_HEIGHT);
  });
});

describe("a lifted card", () => {
  const frame = { top: 300, bottom: 1000 };

  it("moves to the top of what is visible", () => {
    const { positions } = stackLayout({ count: 4, liftedIndex: 2, liftedHeight: 400, frame });
    expect(positions[2]).toBe(300);
  });

  it("piles every other card at the bottom of the visible area, edges only, in day order", () => {
    const { positions, clips, pile } = stackLayout({ count: 4, liftedIndex: 2, liftedHeight: 400, frame });
    const depth = 2 * PILE_EDGE + PILE_PEEK;
    expect(pile).toEqual({ top: 1000 - depth, height: depth, count: 3 });
    expect([positions[0], positions[1], positions[3]]).toEqual([
      pile!.top,
      pile!.top + PILE_EDGE,
      pile!.top + 2 * PILE_EDGE,
    ]);
    // Only the edges show; the front card shows a little more.
    expect([clips[0], clips[1], clips[2], clips[3]]).toEqual([PILE_EDGE, PILE_EDGE, null, PILE_PEEK]);
  });

  it("keeps a long day's pile shallow", () => {
    const { positions, pile } = stackLayout({ count: 12, liftedIndex: 0, liftedHeight: 300, frame });
    expect(pile!.height).toBe((PILE_MAX_EDGES - 1) * PILE_EDGE + PILE_PEEK);
    const pilePositions = new Set(positions.slice(1));
    expect(pilePositions.size).toBe(PILE_MAX_EDGES);
  });

  it("puts the pile after the open card when the card is taller than the screen", () => {
    const { pile, height } = stackLayout({ count: 3, liftedIndex: 0, liftedHeight: 900, frame });
    expect(pile!.top).toBeGreaterThanOrEqual(300 + 900);
    expect(height).toBe(pile!.top + Math.max(PILE_TAP_MIN, pile!.height));
  });

  it("never lifts above the top of the list", () => {
    const { positions } = stackLayout({ count: 2, liftedIndex: 1, liftedHeight: 200, frame: { top: -40, bottom: 600 } });
    expect(positions[1]).toBe(0);
  });

  it("has no pile when it is the only dog of the day", () => {
    expect(stackLayout({ count: 1, liftedIndex: 0, liftedHeight: 260, frame }).pile).toBeNull();
  });
});
