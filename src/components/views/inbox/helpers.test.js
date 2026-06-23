import { describe, it, expect, vi, afterEach } from "vitest";
import { formatDayToken, formatTime } from "./helpers.js";

describe("formatDayToken", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels today, yesterday, recent weekdays, and older dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));

    expect(formatDayToken("2026-06-10T08:00:00Z")).toBe("Today");
    expect(formatDayToken("2026-06-09T08:00:00Z")).toBe("Yesterday");

    // 3 days ago → weekday name (compare against the same locale call so
    // the assertion is timezone/locale-agnostic and only checks the branch).
    const recent = "2026-06-07T08:00:00Z";
    expect(formatDayToken(recent)).toBe(
      new Date(recent).toLocaleDateString("en-GB", { weekday: "long" }),
    );

    // Older than a week → day + month.
    const older = "2026-05-20T08:00:00Z";
    expect(formatDayToken(older)).toBe(
      new Date(older).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    );

    expect(formatDayToken(null)).toBe("");
  });
});

describe("formatTime", () => {
  it("formats 24-hour HH:MM and tolerates null", () => {
    expect(formatTime("2026-06-10T05:09:00Z")).toMatch(/^\d{2}:\d{2}$/);
    expect(formatTime(null)).toBe("");
  });
});
