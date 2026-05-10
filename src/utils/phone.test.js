import { describe, expect, it } from "vitest";
import { normaliseUkMobile } from "./phone.js";

describe("normaliseUkMobile", () => {
  it("accepts the canonical E.164 form unchanged", () => {
    expect(normaliseUkMobile("+447700900123")).toBe("+447700900123");
  });

  it("normalises common UK customer-typed formats to E.164", () => {
    expect(normaliseUkMobile("07700900123")).toBe("+447700900123");
    expect(normaliseUkMobile("07700 900123")).toBe("+447700900123");
    expect(normaliseUkMobile("07700-900-123")).toBe("+447700900123");
    expect(normaliseUkMobile("447700900123")).toBe("+447700900123");
    expect(normaliseUkMobile("+44 7700 900123")).toBe("+447700900123");
    expect(normaliseUkMobile("+44 (0)7700 900123")).toBe("+447700900123");
    expect(normaliseUkMobile("00447700900123")).toBe("+447700900123");
    expect(normaliseUkMobile("  +447700900123  ")).toBe("+447700900123");
  });

  it("rejects landlines, non-UK numbers, and malformed input", () => {
    expect(normaliseUkMobile("+441612345678")).toBe("");
    expect(normaliseUkMobile("+33123456789")).toBe("");
    expect(normaliseUkMobile("07700")).toBe("");
    expect(normaliseUkMobile("+44770090012")).toBe("");
    expect(normaliseUkMobile("+4477009001234")).toBe("");
    expect(normaliseUkMobile("hello")).toBe("");
    expect(normaliseUkMobile("")).toBe("");
    expect(normaliseUkMobile(null)).toBe("");
    expect(normaliseUkMobile(undefined)).toBe("");
    expect(normaliseUkMobile(447700900123)).toBe("");
  });
});
