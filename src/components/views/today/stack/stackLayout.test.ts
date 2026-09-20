import { describe, expect, it } from "vitest";
import { stackLayout, STACK_HEADER_HEIGHT, STACK_STRIP_HEIGHT } from "./stackLayout";

describe("appointment stack geometry", () => {
  it("bottom-aligns a genuine uniform overlap without shrinking cards", () => {
    const result = stackLayout({ count: 4, selectedIndex: 0, availableHeight: 640 });
    expect(result.height).toBe(640);
    expect(result.positions[2] - result.positions[1]).toBe(STACK_STRIP_HEIGHT);
    expect(result.positions[3] - result.positions[2]).toBe(STACK_STRIP_HEIGHT);
    expect(STACK_STRIP_HEIGHT).toBeLessThan(STACK_HEADER_HEIGHT);
    expect(result.positions[1]).toBeGreaterThan(STACK_HEADER_HEIGHT);
  });
  it("separates progressively downwards, with actual gaps at the threshold", () => {
    const input = { count: 4, selectedIndex: 0, availableHeight: 640 };
    const rest = stackLayout(input);
    const half = stackLayout({ ...input, pullProgress: .5 });
    const full = stackLayout({ ...input, pullProgress: 1 });
    expect(half.positions[1]).toBe(rest.positions[1]);
    expect(half.positions[2]).toBeGreaterThan(rest.positions[2]);
    expect(full.positions[2]).toBeGreaterThan(half.positions[2]);
    expect(full.positions[2] - full.positions[1]).toBeGreaterThan(STACK_HEADER_HEIGHT);
    expect(stackLayout({ ...input, pullProgress: 1.5 })).toEqual(full);
  });
  it("keeps long days and tall details scrollable instead of clipping or tiny targets", () => {
    const result = stackLayout({ count: 20, selectedIndex: 3, availableHeight: 300, detailHeight: 600 });
    expect(result.height).toBeGreaterThan(300);
    expect(result.positions[4]).toBeGreaterThan(result.positions[3] + STACK_HEADER_HEIGHT + 600);
    expect(result.positions[19] - result.positions[18]).toBe(STACK_STRIP_HEIGHT);
    expect(result.height).toBe(result.positions[19] + STACK_HEADER_HEIGHT);
  });
  it("handles empty days, a single appointment and a stale selection", () => {
    expect(stackLayout({ count: 0, selectedIndex: 0 })).toEqual({ positions: [], height: 0 });
    expect(stackLayout({ count: 1, selectedIndex: 10, detailHeight: 200 })).toEqual({ positions: [0], height: 344 });
  });
});
