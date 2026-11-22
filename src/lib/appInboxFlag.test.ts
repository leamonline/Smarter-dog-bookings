import { describe, expect, it } from "vitest";
import { isAppInboxEnabled } from "./appInboxFlag";

describe("isAppInboxEnabled", () => {
  it("stays off unless the build variable is exactly 1", () => {
    expect(isAppInboxEnabled(undefined)).toBe(false);
    expect(isAppInboxEnabled("")).toBe(false);
    expect(isAppInboxEnabled("true")).toBe(false);
    expect(isAppInboxEnabled("0")).toBe(false);
    expect(isAppInboxEnabled("1")).toBe(true);
  });
});
