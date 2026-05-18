import { describe, it, expect } from "vitest";
import { sanitiseFieldValue } from "./sanitiseFieldValue.js";

describe("sanitiseFieldValue", () => {
  it("returns trimmed real values unchanged", () => {
    expect(sanitiseFieldValue("Cockapoo")).toBe("Cockapoo");
    expect(sanitiseFieldValue("  Cockapoo  ")).toBe("Cockapoo");
  });

  it("strips legacy placeholder tokens regardless of case", () => {
    expect(sanitiseFieldValue("Unknown")).toBe("");
    expect(sanitiseFieldValue("unknown")).toBe("");
    expect(sanitiseFieldValue("UNKNOWN")).toBe("");
    expect(sanitiseFieldValue("Unknown owner")).toBe("");
    expect(sanitiseFieldValue("Null")).toBe("");
    expect(sanitiseFieldValue("null")).toBe("");
    expect(sanitiseFieldValue("N/A")).toBe("");
    expect(sanitiseFieldValue("TBD")).toBe("");
    expect(sanitiseFieldValue("undefined")).toBe("");
  });

  it("returns empty string for nullish or non-string input", () => {
    expect(sanitiseFieldValue("")).toBe("");
    expect(sanitiseFieldValue("   ")).toBe("");
    expect(sanitiseFieldValue(null)).toBe("");
    expect(sanitiseFieldValue(undefined)).toBe("");
    expect(sanitiseFieldValue(42)).toBe("");
  });

  it("preserves names that happen to contain 'unknown' as a substring", () => {
    // Defensive: only the exact token is stripped, not substrings.
    expect(sanitiseFieldValue("Mrs Unknownsurname")).toBe("Mrs Unknownsurname");
    expect(sanitiseFieldValue("Annull")).toBe("Annull");
  });
});
