import { describe, expect, it } from "vitest";

import {
  dateStepBlocker,
  dogStepBlocker,
  FUNNEL_BLOCKED_REASONS,
  isSelectableDog,
} from "./funnelBlockers";

describe("isSelectableDog", () => {
  it("accepts a dog with a known size and no pregnancy flag", () => {
    expect(isSelectableDog({ size: "small", isPregnant: false })).toBe(true);
    expect(isSelectableDog({ size: "large" })).toBe(true);
  });

  it("rejects an unknown or missing size, which the dog step disables", () => {
    expect(isSelectableDog({ size: null })).toBe(false);
    expect(isSelectableDog({ size: "" })).toBe(false);
    expect(isSelectableDog({ size: "giant" })).toBe(false);
    expect(isSelectableDog({})).toBe(false);
  });

  it("rejects a pregnant dog even when her size is known", () => {
    expect(isSelectableDog({ size: "medium", isPregnant: true })).toBe(false);
  });
});

describe("dogStepBlocker", () => {
  it("reports nothing while the dogs are still loading", () => {
    // A customer waiting on the network has not been blocked by the product.
    expect(dogStepBlocker([], true)).toBeNull();
    expect(dogStepBlocker(null, true)).toBeNull();
  });

  it("reports nothing when the list has not arrived at all", () => {
    expect(dogStepBlocker(null, false)).toBeNull();
    expect(dogStepBlocker(undefined, false)).toBeNull();
  });

  it("reports an empty roster", () => {
    expect(dogStepBlocker([], false)).toBe("no_dogs_on_file");
  });

  it("reports a roster where nothing can be picked", () => {
    expect(
      dogStepBlocker([{ size: "small", isPregnant: true }, { size: null }], false),
    ).toBe("no_eligible_dogs");
  });

  it("reports nothing when at least one dog is selectable", () => {
    expect(
      dogStepBlocker([{ size: "small", isPregnant: true }, { size: "large" }], false),
    ).toBeNull();
  });

  it("does not treat the four-dog cap as a blocker", () => {
    // The cap limits a selection already under way; it never leaves the
    // customer with nothing to choose.
    const five = Array.from({ length: 5 }, () => ({ size: "small" as const }));
    expect(dogStepBlocker(five, false)).toBeNull();
  });
});

describe("dateStepBlocker", () => {
  const base = { pageIndex: 0, openDayCount: 0, complete: true };

  it("reports an empty first page", () => {
    expect(dateStepBlocker(base)).toBe("no_open_days_in_first_page");
  });

  it("reports nothing when the first page has an open day", () => {
    expect(dateStepBlocker({ ...base, openDayCount: 1 })).toBeNull();
  });

  it("reports nothing for a later empty page", () => {
    // Paging past the horizon is browsing, not a wall.
    expect(dateStepBlocker({ ...base, pageIndex: 1 })).toBeNull();
    expect(dateStepBlocker({ ...base, pageIndex: 5 })).toBeNull();
  });

  it("reports nothing while the page is still resolving availability", () => {
    expect(dateStepBlocker({ ...base, complete: false })).toBeNull();
  });
});

describe("the governed vocabulary", () => {
  it("is the exact set the database CHECK constraint allows", () => {
    // Adding a reason means adding it to the migration in the same change;
    // this pins the two together so a value cannot be logged that the
    // database will reject.
    expect([...FUNNEL_BLOCKED_REASONS]).toEqual([
      "no_dogs_on_file",
      "no_eligible_dogs",
      "no_open_days_in_first_page",
    ]);
  });

  it("only ever returns a value from that set", () => {
    const produced = [
      dogStepBlocker([], false),
      dogStepBlocker([{ size: null }], false),
      dateStepBlocker({ pageIndex: 0, openDayCount: 0, complete: true }),
    ];
    for (const reason of produced) {
      expect(FUNNEL_BLOCKED_REASONS).toContain(reason);
    }
  });
});
