import { describe, expect, it } from "vitest";
import { bookedLine } from "./bookingCreator";

const NOW = new Date("2026-11-17T21:30:00Z");

describe("bookedLine", () => {
  it("names staff creators with a staff qualifier", () => {
    expect(
      bookedLine(
        { createdAt: "2026-11-14T10:05:00Z", createdByName: "Sam", createdByRole: "staff" },
        NOW,
      ),
    ).toBe("14 Nov by Sam (staff)");
  });

  it("names customer creators with a customer qualifier", () => {
    expect(
      bookedLine(
        { createdAt: "2026-10-03T08:00:00Z", createdByName: "Lizzie James", createdByRole: "customer" },
        NOW,
      ),
    ).toBe("3 Oct by Lizzie James (customer)");
  });

  it("adds no qualifier for the AI, whose name already says what it is", () => {
    expect(
      bookedLine(
        { createdAt: "2026-10-28T12:00:00Z", createdByName: "Smarter Dog AI", createdByRole: "ai" },
        NOW,
      ),
    ).toBe("28 Oct by Smarter Dog AI");
  });

  it("uses the London calendar day, not the UTC one", () => {
    // 23:30 UTC on 31 May is 00:30 BST on 1 June.
    expect(
      bookedLine(
        { createdAt: "2026-05-31T23:30:00Z", createdByName: "Sam", createdByRole: "staff" },
        NOW,
      ),
    ).toBe("1 Jun by Sam (staff)");
  });

  it("adds the year only when the booking was made in another year", () => {
    expect(
      bookedLine(
        { createdAt: "2025-12-20T10:00:00Z", createdByName: "Sam", createdByRole: "staff" },
        NOW,
      ),
    ).toBe("20 Dec 2025 by Sam (staff)");
  });

  it("gives just the date when the creator was never recorded", () => {
    expect(
      bookedLine({ createdAt: "2026-04-02T10:00:00Z", createdByName: null, createdByRole: null }, NOW),
    ).toBe("2 Apr");
  });

  it("treats a blank creator name as unrecorded", () => {
    expect(
      bookedLine({ createdAt: "2026-04-02T10:00:00Z", createdByName: "  ", createdByRole: "staff" }, NOW),
    ).toBe("2 Apr");
  });

  it("gives just the creator when the timestamp is missing or unreadable", () => {
    expect(
      bookedLine({ createdAt: "not a date", createdByName: "Sam", createdByRole: "staff" }, NOW),
    ).toBe("by Sam (staff)");
  });

  it("says nothing when it knows nothing", () => {
    expect(bookedLine({ createdAt: null, createdByName: null, createdByRole: null }, NOW)).toBeNull();
  });
});
