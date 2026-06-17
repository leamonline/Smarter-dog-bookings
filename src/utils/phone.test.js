import { describe, expect, it } from "vitest";
import {
  normaliseUkMobile,
  formatPhoneForDisplay,
  stripFormatChars,
  validateContactPhone,
} from "./phone.js";

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

  it("strips invisible Unicode format characters from pasted numbers (iOS/WhatsApp)", () => {
    // iOS Contacts / WhatsApp wrap copied numbers in bidi marks: U+202A
    // (LEFT-TO-RIGHT EMBEDDING) … U+202C (POP DIRECTIONAL FORMATTING). This is
    // the exact shape that left a real customer un-messageable.
    expect(normaliseUkMobile("\u202a07856684962\u202c")).toBe("+447856684962");
    // Newer iOS uses directional isolates: U+2066 (FSI) … U+2069 (PDI).
    expect(normaliseUkMobile("\u2066+447700900123\u2069")).toBe("+447700900123");
    // Zero-width space (U+200B) embedded mid-number.
    expect(normaliseUkMobile("07700\u200b900123")).toBe("+447700900123");
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

describe("formatPhoneForDisplay", () => {
  it("formats E.164 UK mobiles as the national 07… form with a space", () => {
    expect(formatPhoneForDisplay("+447700900123")).toBe("07700 900123");
    expect(formatPhoneForDisplay("+447507731487")).toBe("07507 731487");
  });

  it("formats other UK-typed shapes once normalised", () => {
    expect(formatPhoneForDisplay("07700900123")).toBe("07700 900123");
    expect(formatPhoneForDisplay("07700 900123")).toBe("07700 900123");
    expect(formatPhoneForDisplay("+44 7700 900123")).toBe("07700 900123");
  });

  it("returns trimmed input verbatim when it isn't a UK mobile", () => {
    expect(formatPhoneForDisplay("+33123456789")).toBe("+33123456789");
    expect(formatPhoneForDisplay("  +33123456789  ")).toBe("+33123456789");
  });

  it("returns an empty string for nullish or non-string input", () => {
    expect(formatPhoneForDisplay("")).toBe("");
    expect(formatPhoneForDisplay("   ")).toBe("");
    expect(formatPhoneForDisplay(null)).toBe("");
    expect(formatPhoneForDisplay(undefined)).toBe("");
    expect(formatPhoneForDisplay(447700900123)).toBe("");
  });
});

describe("validateContactPhone", () => {
  it("normalises a valid UK mobile (any accepted format) to E.164", () => {
    expect(validateContactPhone("07700900123")).toEqual({ value: "+447700900123", error: "" });
    expect(validateContactPhone("+44 7700 900123")).toEqual({ value: "+447700900123", error: "" });
    expect(validateContactPhone("  447700900123  ")).toEqual({ value: "+447700900123", error: "" });
    // Real rows from the customer table, stored unnormalised — should be fixed up.
    expect(validateContactPhone("+44 7393 834335")).toEqual({ value: "+447393834335", error: "" });
    expect(validateContactPhone("07860553279")).toEqual({ value: "+447860553279", error: "" });
  });

  it("rejects a mobile-shaped number with the wrong digit count", () => {
    // The Rachel Cassidy bug: +44 then only 9 digits (one short).
    expect(validateContactPhone("+44768938855").value).toBe("");
    expect(validateContactPhone("+44768938855").error).toMatch(/missing or extra digit/i);
    // Other real broken rows from the table.
    expect(validateContactPhone("+44737714789").value).toBe("");
    expect(validateContactPhone("+44786942779").value).toBe("");
    expect(validateContactPhone("0757013935").value).toBe("");
    // A mobile with an extra digit.
    expect(validateContactPhone("+4477009001234").value).toBe("");
  });

  it("accepts UK landlines and non-UK numbers as-is (trimmed)", () => {
    // Manchester landlines that genuinely live in the table.
    expect(validateContactPhone("+441612855218")).toEqual({ value: "+441612855218", error: "" });
    expect(validateContactPhone("  0161 285 5218  ")).toEqual({ value: "0161 285 5218", error: "" });
    // Non-UK / other — not mobile-shaped, kept if long enough.
    expect(validateContactPhone("+33123456789")).toEqual({ value: "+33123456789", error: "" });
  });

  it("rejects too-short non-mobile input and treats empty as optional", () => {
    expect(validateContactPhone("12345").value).toBe("");
    expect(validateContactPhone("12345").error).toMatch(/at least 10 digits/i);
    expect(validateContactPhone("")).toEqual({ value: "", error: "" });
    expect(validateContactPhone("   ")).toEqual({ value: "", error: "" });
    expect(validateContactPhone(null)).toEqual({ value: "", error: "" });
    expect(validateContactPhone(undefined)).toEqual({ value: "", error: "" });
  });
});

describe("stripFormatChars", () => {
  it("removes bidi marks, isolates, zero-width chars and the BOM", () => {
    expect(stripFormatChars("\u202a07856684962\u202c")).toBe("07856684962");
    expect(stripFormatChars("\u2066abc\u2069")).toBe("abc");
    expect(stripFormatChars("a\u200bb\ufeffc")).toBe("abc");
  });

  it("leaves clean strings untouched and returns '' for non-strings", () => {
    expect(stripFormatChars("07700900123")).toBe("07700900123");
    expect(stripFormatChars(null)).toBe("");
    expect(stripFormatChars(undefined)).toBe("");
    expect(stripFormatChars(12345)).toBe("");
  });
});
