import { describe, it, expect } from "vitest";
import { intlPlural, pluralCount, formatDelta } from "./intl.js";

describe("intlPlural", () => {
  it("returns the singular form for 1", () => {
    expect(intlPlural(1, "booking", "bookings")).toBe("booking");
  });
  it("returns the plural form for 0, 2, and other counts", () => {
    expect(intlPlural(0, "booking", "bookings")).toBe("bookings");
    expect(intlPlural(2, "booking", "bookings")).toBe("bookings");
    expect(intlPlural(42, "booking", "bookings")).toBe("bookings");
  });
});

describe("pluralCount", () => {
  it("formats 1 with the singular form", () => {
    expect(pluralCount(1, "booking", "bookings")).toBe("1 booking");
  });
  it("formats other counts with the plural form", () => {
    expect(pluralCount(0, "booking", "bookings")).toBe("0 bookings");
    expect(pluralCount(5, "booking", "bookings")).toBe("5 bookings");
  });
});

describe("formatDelta", () => {
  it("returns em-dash when previous is zero (avoids the misleading +100%)", () => {
    expect(formatDelta(5, 0)).toBe("—");
    expect(formatDelta(0, 0)).toBe("—");
  });
  it("returns a signed percentage otherwise", () => {
    expect(formatDelta(110, 100)).toBe("+10%");
    expect(formatDelta(90, 100)).toBe("-10%");
    expect(formatDelta(100, 100)).toBe("0%");
  });
  it("returns em-dash for non-finite inputs", () => {
    expect(formatDelta(NaN, 100)).toBe("—");
    expect(formatDelta(100, Infinity)).toBe("—");
  });
});
