import { describe, it, expect, vi, afterEach } from "vitest";
import {
  londonNowParts,
  londonDateStr,
  londonOffsetMs,
  londonWallClockToUtcMs,
} from "./londonTime";

const HOUR = 60 * 60 * 1000;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("londonNowParts", () => {
  it("reads a GMT instant as London wall clock with a zero offset", () => {
    const p = londonNowParts(new Date("2026-01-15T09:30:00Z"));
    expect(p).toEqual({
      year: 2026, month: 1, day: 15, hour: 9, minute: 30,
      minutesOfDay: 9 * 60 + 30, dateStr: "2026-01-15",
    });
  });

  it("reads a BST instant one hour ahead of UTC, including across the date line", () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in London.
    const p = londonNowParts(new Date("2026-06-30T23:30:00Z"));
    expect(p.dateStr).toBe("2026-07-01");
    expect(p.hour).toBe(0);
    expect(p.minute).toBe(30);
    expect(p.minutesOfDay).toBe(30);
  });

  it("defends against a formatter that emits hour 24 or omits a part", () => {
    // hourCycle "h23" should never produce "24", and every requested part
    // should be present; both branches exist so a platform quirk cannot
    // desync the hour from the date. Force the quirk through the prototype.
    vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue([
      { type: "year", value: "2026" },
      { type: "month", value: "03" },
      { type: "day", value: "09" },
      { type: "hour", value: "24" },
      // no minute part at all
    ] as Intl.DateTimeFormatPart[]);
    const p = londonNowParts(new Date("2026-03-09T00:00:00Z"));
    expect(p.hour).toBe(0);
    expect(p.minute).toBe(0);
    expect(p.minutesOfDay).toBe(0);
    expect(p.dateStr).toBe("2026-03-09");
  });
});

describe("londonDateStr", () => {
  it("is the London calendar date, not the UTC one", () => {
    expect(londonDateStr(new Date("2026-08-31T23:15:00Z"))).toBe("2026-09-01");
    expect(londonDateStr(new Date("2026-12-31T23:15:00Z"))).toBe("2026-12-31");
  });
});

describe("londonOffsetMs", () => {
  it("is 0 in winter and +1h in summer", () => {
    expect(londonOffsetMs(new Date("2026-01-15T12:00:00Z"))).toBe(0);
    expect(londonOffsetMs(new Date("2026-07-15T12:00:00Z"))).toBe(HOUR);
  });

  it("flips at the clock changes", () => {
    // Clocks go forward at 01:00 UTC on the last Sunday of March 2026 (29th).
    expect(londonOffsetMs(new Date("2026-03-29T00:59:00Z"))).toBe(0);
    expect(londonOffsetMs(new Date("2026-03-29T01:00:00Z"))).toBe(HOUR);
    // …and back at 01:00 UTC on the last Sunday of October 2026 (25th).
    expect(londonOffsetMs(new Date("2026-10-25T00:59:00Z"))).toBe(HOUR);
    expect(londonOffsetMs(new Date("2026-10-25T01:00:00Z"))).toBe(0);
  });
});

describe("londonWallClockToUtcMs", () => {
  it("treats a winter slot as UTC and a summer slot as UTC minus one hour", () => {
    expect(londonWallClockToUtcMs("2026-01-15", "09:30")).toBe(
      Date.parse("2026-01-15T09:30:00Z"),
    );
    expect(londonWallClockToUtcMs("2026-07-15", "09:30")).toBe(
      Date.parse("2026-07-15T08:30:00Z"),
    );
  });

  it("returns NaN for an unparseable date or time rather than a wrong instant", () => {
    expect(londonWallClockToUtcMs("not-a-date", "09:30")).toBeNaN();
    expect(londonWallClockToUtcMs("2026-13-45", "09:30")).toBeNaN();
    // NB: not every malformed input reaches the NaN guard. V8's legacy parser
    // accepts "T:00Z" (both arguments empty) as 2000-01-01T00:00Z, so a caller
    // must not rely on this function to reject empty strings.
  });
});
