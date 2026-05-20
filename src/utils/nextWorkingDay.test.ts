import { describe, it, expect } from "vitest";
import { getNextWorkingDay } from "./nextWorkingDay.js";

// Helper: construct a Date at noon UK on a specific calendar day. Use
// noon to dodge DST edges; getNextWorkingDay normalises through the
// UK timezone so this matches what staff would call "today".
function uk(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

describe("getNextWorkingDay", () => {
  it("Mon → Tue", () => {
    // 2026-05-25 is a Monday
    expect(getNextWorkingDay(uk("2026-05-25"))).toBe("2026-05-26");
  });

  it("Tue → Wed", () => {
    // 2026-05-26 is a Tuesday
    expect(getNextWorkingDay(uk("2026-05-26"))).toBe("2026-05-27");
  });

  it("Wed → next Mon (skips Thu/Fri/Sat/Sun)", () => {
    // 2026-05-27 is a Wednesday
    expect(getNextWorkingDay(uk("2026-05-27"))).toBe("2026-06-01");
  });

  it("Thu → next Mon", () => {
    expect(getNextWorkingDay(uk("2026-05-28"))).toBe("2026-06-01");
  });

  it("Fri → next Mon", () => {
    expect(getNextWorkingDay(uk("2026-05-29"))).toBe("2026-06-01");
  });

  it("Sat → next Mon", () => {
    expect(getNextWorkingDay(uk("2026-05-30"))).toBe("2026-06-01");
  });

  it("Sun → Mon", () => {
    expect(getNextWorkingDay(uk("2026-05-31"))).toBe("2026-06-01");
  });

  it("never returns today (always strictly forward)", () => {
    expect(getNextWorkingDay(uk("2026-05-25"))).not.toBe("2026-05-25");
  });
});
