import { expect, it } from "vitest";
import { measurementWindow } from "./measurementWindow";
it("defines a UTC calendar window across a year boundary", () => {
  expect(measurementWindow(7, new Date("2026-01-02T10:00:00Z"))).toEqual({ start: "2025-12-27T00:00:00.000Z", end: "2026-01-02T10:00:00.000Z" });
});
it.each([0, -1, 1.5, NaN])("rejects invalid periods %s", days => {
  expect(() => measurementWindow(days)).toThrow();
});
it("rejects an invalid clock", () => { expect(() => measurementWindow(7, new Date("bad"))).toThrow(); });
