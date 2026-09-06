import { describe, expect, it } from "vitest";
import { deadlineAnchorSlot } from "./changeDeadline";

describe("deadlineAnchorSlot", () => {
  it("takes the earliest assigned slot, not the drop-off time", () => {
    // cancel_customer_booking scopes to the visit and uses min(date + slot),
    // so a group closes on its first dog. Ordering the assignments the other
    // way round must not change the answer.
    expect(
      deadlineAnchorSlot({
        dropOffTime: "09:30",
        assignments: [
          { dogId: "b", slot: "09:30" },
          { dogId: "a", slot: "09:00" },
        ],
      }),
    ).toBe("09:00");
  });

  it("handles the single-dog case", () => {
    expect(
      deadlineAnchorSlot({ dropOffTime: "11:00", assignments: [{ dogId: "a", slot: "11:00" }] }),
    ).toBe("11:00");
  });

  it("compares slots chronologically, not by string length", () => {
    // Zero padding is what makes the lexical minimum safe; assert it rather
    // than assume it, because an unpadded "9:00" would sort after "11:00".
    expect(
      deadlineAnchorSlot({
        dropOffTime: "08:30",
        assignments: [
          { dogId: "a", slot: "11:00" },
          { dogId: "b", slot: "08:30" },
        ],
      }),
    ).toBe("08:30");
  });

  it("falls back to the drop-off time when a draft carries no assignments", () => {
    expect(deadlineAnchorSlot({ dropOffTime: "10:00", assignments: [] })).toBe("10:00");
  });

  it("returns null when there is nothing to measure from", () => {
    expect(deadlineAnchorSlot(null)).toBeNull();
    expect(deadlineAnchorSlot(undefined)).toBeNull();
    expect(deadlineAnchorSlot({ dropOffTime: "", assignments: [] })).toBeNull();
  });
});
