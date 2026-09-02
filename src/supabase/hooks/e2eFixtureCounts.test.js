import { describe, expect, it } from "vitest";
import { e2eFixtureCount } from "./e2eFixtureCounts";

describe("e2eFixtureCount", () => {
  it("ignores fixture counts unless the app is explicitly forced offline", () => {
    expect(e2eFixtureCount("12", false)).toBe(0);
    expect(e2eFixtureCount("12", true)).toBe(12);
  });

  it("normalises missing, invalid and negative fixture counts to zero", () => {
    expect(e2eFixtureCount(undefined, true)).toBe(0);
    expect(e2eFixtureCount("not-a-number", true)).toBe(0);
    expect(e2eFixtureCount("-3", true)).toBe(0);
  });
});
