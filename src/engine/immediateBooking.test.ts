import { describe, expect, it } from "vitest";

import { allocationIsImmediate, isBeforeImmediateCutoff } from "./immediateBooking";

describe("isBeforeImmediateCutoff", () => {
  // 10:00 slot: cutoff is 09:30 — bookable AT the cutoff, not a minute after.
  it("allows exactly 30 minutes before the slot", () => {
    expect(isBeforeImmediateCutoff("10:00", new Date(2026, 6, 2, 9, 30))).toBe(true);
  });

  it("blocks 29 minutes before the slot", () => {
    expect(isBeforeImmediateCutoff("10:00", new Date(2026, 6, 2, 9, 31))).toBe(false);
  });

  it("allows a comfortably-future slot and blocks a past one", () => {
    expect(isBeforeImmediateCutoff("13:00", new Date(2026, 6, 2, 8, 0))).toBe(true);
    expect(isBeforeImmediateCutoff("08:30", new Date(2026, 6, 2, 9, 0))).toBe(false);
  });
});

describe("allocationIsImmediate", () => {
  const flagged = new Set(["09:00", "09:30"]);

  it("passes when every assignment is on a flagged slot", () => {
    const allocation = {
      assignments: [
        { dogId: "a", slot: "09:00" },
        { dogId: "b", slot: "09:30" },
      ],
    };
    expect(allocationIsImmediate(allocation, flagged)).toBe(true);
  });

  it("fails when the group spills into an unflagged slot", () => {
    // The trigger validates each row's own slot, so one unflagged
    // assignment sinks the whole group.
    const allocation = {
      assignments: [
        { dogId: "a", slot: "09:00" },
        { dogId: "b", slot: "10:00" },
      ],
    };
    expect(allocationIsImmediate(allocation, flagged)).toBe(false);
  });

  it("fails against an empty flag set", () => {
    const allocation = { assignments: [{ dogId: "a", slot: "09:00" }] };
    expect(allocationIsImmediate(allocation, new Set())).toBe(false);
  });
});
