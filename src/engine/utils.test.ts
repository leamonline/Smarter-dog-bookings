// @ts-nocheck
import { describe, it, expect } from "vitest";
import { formatFullDate, getDefaultPickupTime, generateTimeOptions } from "./utils.ts";

describe("formatFullDate", () => {
  it("formats a date correctly", () => {
    const d = new Date(2026, 2, 25); // March 25, 2026 (Wed)
    expect(formatFullDate(d)).toBe("Wed, 25 Mar 2026");
  });

  it("handles single-digit day", () => {
    const d = new Date(2026, 0, 5); // Jan 5, 2026 (Mon)
    expect(formatFullDate(d)).toBe("Mon, 5 Jan 2026");
  });
});

describe("getDefaultPickupTime", () => {
  it("returns dash for empty input", () => {
    expect(getDefaultPickupTime("")).toBe("\u2014");
    expect(getDefaultPickupTime(null)).toBe("\u2014");
    expect(getDefaultPickupTime(undefined)).toBe("\u2014");
  });

  it("adds 120 minutes to start time", () => {
    expect(getDefaultPickupTime("08:30")).toBe("10:30am");
    expect(getDefaultPickupTime("10:00")).toBe("12:00pm");
    expect(getDefaultPickupTime("11:00")).toBe("1:00pm");
  });
});

describe("generateTimeOptions", () => {
  it("returns empty array for empty input", () => {
    expect(generateTimeOptions("")).toEqual([]);
    expect(generateTimeOptions(null)).toEqual([]);
  });

  it("starts 30 minutes after the given time", () => {
    const options = generateTimeOptions("08:30");
    expect(options[0]).toBe("9:00am");
  });

  it("generates options in 10-minute increments", () => {
    const options = generateTimeOptions("08:30");
    expect(options[0]).toBe("9:00am");
    expect(options[1]).toBe("9:10am");
    expect(options[2]).toBe("9:20am");
  });

  it("does not exceed 5:00pm", () => {
    const options = generateTimeOptions("08:30");
    const lastOption = options[options.length - 1];
    expect(lastOption).toBe("5:00pm");
  });
});
