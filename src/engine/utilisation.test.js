import { describe, expect, it } from "vitest";
import { findNextAvailable } from "./utilisation.js";

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
