import { describe, expect, it } from "vitest";
import { findNextAvailable, capacityRatio, currentSlotIndex } from "./utilisation";

// Today is fixed in tests via the `now` injection so the assertion
// is deterministic — otherwise a past-date case would flip into a
// future-date case once the calendar moved on.
const TODAY = new Date("2026-05-17T12:00:00Z");

describe("findNextAvailable", () => {
  it("returns null when fromDate is missing", () => {
    expect(findNextAvailable({ fromDate: null, now: TODAY })).toBeNull();
    expect(findNextAvailable({ now: TODAY })).toBeNull();
  });

  it("does not advertise a date earlier than today, even if fromDate is in the past", () => {
    // From a past date with no bookings anywhere — the first available
    // slot should land on today (or later), never on Mon 11 May 2026.
    const result = findNextAvailable({
      fromDate: new Date("2026-05-11T00:00:00Z"),
      bookingsByDate: {},
      dayOpenState: {},
      daySettings: {},
      now: TODAY,
    });
    if (result) {
      expect(new Date(result.dateStr).getTime()).toBeGreaterThanOrEqual(
        new Date("2026-05-17").getTime(),
      );
    }
  });

  it("respects fromDate when it is already today or in the future", () => {
    const future = new Date("2026-06-01T00:00:00Z");
    const result = findNextAvailable({
      fromDate: future,
      bookingsByDate: {},
      dayOpenState: {},
      daySettings: {},
      now: TODAY,
    });
    if (result) {
      expect(new Date(result.dateStr).getTime()).toBeGreaterThanOrEqual(future.getTime());
    }
  });
});

// capacityRatio drives the wordless capacity bar above the schedule. Unlike
// computeDayCapacity (which caps pct at 100), the ratio is uncapped so the bar
// and number can signal "over capacity" without a label.
describe("capacityRatio", () => {
  it("reports a comfortable half-full day", () => {
    const r = capacityRatio(7, true);
    expect(r.cap).toBe(14);
    expect(r.count).toBe(7);
    expect(r.ratio).toBeCloseTo(0.5);
    expect(r.over).toBe(false);
  });

  it("is exactly full at the cap without being over", () => {
    const r = capacityRatio(14, true);
    expect(r.ratio).toBe(1);
    expect(r.over).toBe(false);
  });

  it("flags over-capacity with an uncapped ratio when bookings exceed the cap", () => {
    const r = capacityRatio(16, true);
    expect(r.over).toBe(true);
    expect(r.ratio).toBeGreaterThan(1);
  });

  it("has no capacity and is never over when the day is closed", () => {
    const r = capacityRatio(5, false);
    expect(r.cap).toBe(0);
    expect(r.ratio).toBe(0);
    expect(r.over).toBe(false);
  });
});

// currentSlotIndex powers the today-only "Now" row. It returns the index of the
// slot whose [start, nextStart) window contains `now` (last slot gets a 30-min
// tail), or -1 outside salon hours.
describe("currentSlotIndex", () => {
  const SLOTS = ["08:30", "09:00", "09:30", "10:00"];
  const at = (h, m) => new Date(2026, 0, 1, h, m);

  it("returns -1 before the first slot opens", () => {
    expect(currentSlotIndex(SLOTS, at(7, 0))).toBe(-1);
    expect(currentSlotIndex(SLOTS, at(8, 29))).toBe(-1);
  });

  it("returns the index of the in-progress slot", () => {
    expect(currentSlotIndex(SLOTS, at(8, 30))).toBe(0);
    expect(currentSlotIndex(SLOTS, at(8, 59))).toBe(0);
    expect(currentSlotIndex(SLOTS, at(9, 0))).toBe(1);
    expect(currentSlotIndex(SLOTS, at(9, 45))).toBe(2);
    expect(currentSlotIndex(SLOTS, at(10, 0))).toBe(3); // last slot
    expect(currentSlotIndex(SLOTS, at(10, 29))).toBe(3);
  });

  it("returns -1 once the last slot's 30-minute window has passed", () => {
    expect(currentSlotIndex(SLOTS, at(10, 30))).toBe(-1);
    expect(currentSlotIndex(SLOTS, at(15, 0))).toBe(-1);
  });

  it("returns -1 for an empty slot list", () => {
    expect(currentSlotIndex([], at(9, 0))).toBe(-1);
  });
});
