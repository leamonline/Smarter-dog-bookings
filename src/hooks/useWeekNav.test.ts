import { describe, it, expect } from "vitest";
import { mondayIndexedDayOfWeek } from "./useWeekNav.js";

describe("mondayIndexedDayOfWeek", () => {
  it("returns 0 for Monday", () => {
    // 11 May 2026 is a Monday.
    expect(mondayIndexedDayOfWeek(new Date("2026-05-11T12:00:00"))).toBe(0);
  });

  it("returns 6 for Sunday", () => {
    // 17 May 2026 is a Sunday.
    expect(mondayIndexedDayOfWeek(new Date("2026-05-17T12:00:00"))).toBe(6);
  });

  it("returns 2 for Wednesday", () => {
    expect(mondayIndexedDayOfWeek(new Date("2026-05-13T12:00:00"))).toBe(2);
  });
});
