import { describe, it, expect } from "vitest";
import { resolveNextOpenDay } from "./useNextOpenDayBrief";

// 2026-07-10 is a Friday. Defaults: Mon–Wed open (ALL_DAYS), so with no
// overrides the next open day is Monday 2026-07-13.
describe("resolveNextOpenDay", () => {
  it("falls back to the weekday default (Mon–Wed open)", () => {
    expect(resolveNextOpenDay("2026-07-10", {})).toBe("2026-07-13");
  });

  it("a day_settings closed override beats the default and skips onward", () => {
    expect(resolveNextOpenDay("2026-07-10", { "2026-07-13": false })).toBe("2026-07-14");
  });

  it("a day_settings open override beats a closed default", () => {
    // Saturday 11th default-closed, explicitly opened.
    expect(resolveNextOpenDay("2026-07-10", { "2026-07-11": true })).toBe("2026-07-11");
  });

  it("finds a day at the far lookahead boundary", () => {
    const allClosed: Record<string, boolean> = {};
    for (let i = 1; i <= 9; i++) allClosed[`2026-07-${String(10 + i).padStart(2, "0")}`] = false;
    expect(resolveNextOpenDay("2026-07-10", { ...allClosed, "2026-07-20": true })).toBe("2026-07-20");
  });

  it("returns null when nothing is open within the lookahead", () => {
    const allClosed: Record<string, boolean> = {};
    for (let i = 1; i <= 10; i++) {
      const d = new Date(Date.UTC(2026, 6, 10 + i));
      allClosed[d.toISOString().slice(0, 10)] = false;
    }
    expect(resolveNextOpenDay("2026-07-10", allClosed)).toBeNull();
  });
});
