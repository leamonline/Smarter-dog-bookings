import { describe, it, expect } from "vitest";
import {
  formatFullDate,
  getDefaultOpenForDate,
  getDefaultPickupTime,
  generateTimeOptions,
} from "./utils.js";

describe("formatFullDate", () => {
  it("formats a Tuesday in April", () => {
    const d = new Date(2026, 3, 21); // Tue Apr 21 2026
    expect(formatFullDate(d)).toBe("Tue, 21 Apr 2026");
  });

  it("formats a Sunday in December", () => {
    const d = new Date(2025, 11, 7); // Sun Dec 7 2025
    expect(formatFullDate(d)).toBe("Sun, 7 Dec 2025");
  });

  it("does not zero-pad the day number", () => {
    const d = new Date(2026, 0, 5); // Mon Jan 5 2026
    expect(formatFullDate(d)).toBe("Mon, 5 Jan 2026");
  });
});

describe("getDefaultOpenForDate", () => {
  it("returns true for Monday–Wednesday (default-open days)", () => {
    expect(getDefaultOpenForDate(new Date(2026, 3, 20))).toBe(true); // Mon
    expect(getDefaultOpenForDate(new Date(2026, 3, 21))).toBe(true); // Tue
    expect(getDefaultOpenForDate(new Date(2026, 3, 22))).toBe(true); // Wed
  });

  it("returns false for Thursday–Sunday (default-closed days)", () => {
    expect(getDefaultOpenForDate(new Date(2026, 3, 23))).toBe(false); // Thu
    expect(getDefaultOpenForDate(new Date(2026, 3, 24))).toBe(false); // Fri
    expect(getDefaultOpenForDate(new Date(2026, 3, 25))).toBe(false); // Sat
    expect(getDefaultOpenForDate(new Date(2026, 3, 26))).toBe(false); // Sun
  });

  it("handles Sunday correctly (JS day 0 → Mon-first index 6)", () => {
    // Sunday is day 0 in JS but the 7th (index 6) in Mon-first ordering.
    const sunday = new Date(2026, 3, 26);
    expect(sunday.getDay()).toBe(0);
    expect(getDefaultOpenForDate(sunday)).toBe(false);
  });
});

describe("getDefaultPickupTime", () => {
  it("adds 120 minutes to an am start", () => {
    expect(getDefaultPickupTime("08:30")).toBe("10:30am");
    expect(getDefaultPickupTime("09:00")).toBe("11:00am");
  });

  it("handles transitions across noon", () => {
    expect(getDefaultPickupTime("11:00")).toBe("1:00pm");
    expect(getDefaultPickupTime("12:00")).toBe("2:00pm");
    expect(getDefaultPickupTime("13:00")).toBe("3:00pm");
  });

  it("zero-pads minutes", () => {
    expect(getDefaultPickupTime("10:05")).toBe("12:05pm");
  });

  it("returns em-dash for empty input", () => {
    expect(getDefaultPickupTime("")).toBe("—");
  });
});

describe("generateTimeOptions", () => {
  it("starts 30 minutes after the slot and advances in 10-minute steps", () => {
    const opts = generateTimeOptions("08:30");
    expect(opts[0]).toBe("9:00am");
    expect(opts[1]).toBe("9:10am");
    expect(opts[2]).toBe("9:20am");
  });

  it("stops at the 17:00 cap", () => {
    const opts = generateTimeOptions("08:30");
    expect(opts[opts.length - 1]).toBe("5:00pm");
  });

  it("crosses noon cleanly", () => {
    const opts = generateTimeOptions("11:00");
    expect(opts).toContain("12:00pm");
    expect(opts).toContain("1:00pm");
  });

  it("returns empty array for empty start", () => {
    expect(generateTimeOptions("")).toEqual([]);
  });
});
