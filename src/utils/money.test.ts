import { describe, it, expect } from "vitest";
import {
  formatGBP,
  parseGBPInput,
  penceToPounds,
  poundsToPence,
  pricePenceFromTableValue,
} from "./money";

describe("formatGBP", () => {
  it("formats whole pounds without decimals", () => {
    expect(formatGBP(4200)).toBe("£42");
    expect(formatGBP(1000)).toBe("£10");
    expect(formatGBP(0)).toBe("£0");
  });

  it("formats fractional pence with two decimals", () => {
    expect(formatGBP(4250)).toBe("£42.50");
    expect(formatGBP(4205)).toBe("£42.05");
  });

  it("returns empty string for null/undefined/NaN", () => {
    expect(formatGBP(null)).toBe("");
    expect(formatGBP(undefined)).toBe("");
    expect(formatGBP(NaN)).toBe("");
  });
});

describe("parseGBPInput", () => {
  it("parses plain and £-prefixed pound strings to pence", () => {
    expect(parseGBPInput("42")).toBe(4200);
    expect(parseGBPInput("£42")).toBe(4200);
    expect(parseGBPInput("42.5")).toBe(4250);
    expect(parseGBPInput("£42.50")).toBe(4250);
    expect(parseGBPInput(" £46 ")).toBe(4600);
  });

  it("tolerates the legacy trailing + (from-price marker)", () => {
    expect(parseGBPInput("£42+")).toBe(4200);
  });

  it("accepts plain numbers as pounds", () => {
    expect(parseGBPInput(42)).toBe(4200);
    expect(parseGBPInput(42.5)).toBe(4250);
  });

  it("rejects blank, zero, negatives and junk", () => {
    expect(parseGBPInput("")).toBeNull();
    expect(parseGBPInput("   ")).toBeNull();
    expect(parseGBPInput("0")).toBeNull();
    expect(parseGBPInput("£0")).toBeNull();
    expect(parseGBPInput(0)).toBeNull();
    expect(parseGBPInput(-5)).toBeNull();
    expect(parseGBPInput("free")).toBeNull();
    expect(parseGBPInput("N/A")).toBeNull();
    expect(parseGBPInput(null)).toBeNull();
    expect(parseGBPInput(undefined)).toBeNull();
  });
});

describe("pence/pounds conversions", () => {
  it("round-trips", () => {
    expect(penceToPounds(4200)).toBe(42);
    expect(penceToPounds(4250)).toBe(42.5);
    expect(poundsToPence(42)).toBe(4200);
    expect(poundsToPence(42.5)).toBe(4250);
  });
});

describe("pricePenceFromTableValue", () => {
  it("passes through pence numbers", () => {
    expect(pricePenceFromTableValue(4200)).toBe(4200);
  });

  it("converts legacy £-strings (pounds) to pence", () => {
    expect(pricePenceFromTableValue("£42")).toBe(4200);
    expect(pricePenceFromTableValue("£42+")).toBe(4200);
    expect(pricePenceFromTableValue("38")).toBe(3800);
  });

  it("returns null for N/A, blank, zero and junk", () => {
    expect(pricePenceFromTableValue("N/A")).toBeNull();
    expect(pricePenceFromTableValue("n/a")).toBeNull();
    expect(pricePenceFromTableValue("")).toBeNull();
    expect(pricePenceFromTableValue(0)).toBeNull();
    expect(pricePenceFromTableValue(null)).toBeNull();
    expect(pricePenceFromTableValue(undefined)).toBeNull();
  });
});
