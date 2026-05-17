import { describe, expect, it } from "vitest";
import { normalisePhoneDigits, telLink, waLink } from "./helpers.js";

describe("normalisePhoneDigits", () => {
  it("returns empty string for empty / nullish input", () => {
    expect(normalisePhoneDigits("")).toBe("");
    expect(normalisePhoneDigits(null)).toBe("");
    expect(normalisePhoneDigits(undefined)).toBe("");
    expect(normalisePhoneDigits("   ")).toBe("");
    expect(normalisePhoneDigits("(no number)")).toBe("");
  });

  it("normalises common UK formats to digits-only international", () => {
    expect(normalisePhoneDigits("+447510053019")).toBe("447510053019");
    expect(normalisePhoneDigits("07510053019")).toBe("447510053019");
    expect(normalisePhoneDigits("07510 053019")).toBe("447510053019");
    expect(normalisePhoneDigits("0044 7510 053019")).toBe("447510053019");
    expect(normalisePhoneDigits("+44 (0)7510 053019")).toBe("447510053019");
    expect(normalisePhoneDigits("+44 7510-053-019")).toBe("447510053019");
  });

  it("passes non-UK international numbers through stripped", () => {
    expect(normalisePhoneDigits("+1 415 555 0100")).toBe("14155550100");
    expect(normalisePhoneDigits("+33 1 23 45 67 89")).toBe("33123456789");
  });
});

describe("telLink", () => {
  it("returns '#' for empty input", () => {
    expect(telLink("")).toBe("#");
    expect(telLink(null)).toBe("#");
    expect(telLink(undefined)).toBe("#");
  });

  it("produces a single-plus tel: link regardless of input format", () => {
    expect(telLink("+447510053019")).toBe("tel:+447510053019");
    expect(telLink("07510053019")).toBe("tel:+447510053019");
    expect(telLink("+44 (0)7510 053019")).toBe("tel:+447510053019");
    expect(telLink("0044 7510 053019")).toBe("tel:+447510053019");
  });

  it("never returns the buggy double-plus form", () => {
    // Regression: +447... used to become tel:++447... because the old
    // helper prepended a '+' even when one was already there.
    expect(telLink("+447510053019")).not.toContain("++");
  });
});

describe("waLink", () => {
  it("returns '#' for empty input", () => {
    expect(waLink("")).toBe("#");
    expect(waLink(null)).toBe("#");
    expect(waLink(undefined)).toBe("#");
  });

  it("produces a digits-only wa.me link", () => {
    expect(waLink("+447510053019")).toBe("https://wa.me/447510053019");
    expect(waLink("07510053019")).toBe("https://wa.me/447510053019");
    expect(waLink("+44 (0)7510 053019")).toBe("https://wa.me/447510053019");
  });

  it("never returns a wa.me URL containing a '+'", () => {
    // Regression: wa.me rejects any non-digit in the path. Old helper
    // produced https://wa.me/+447... which 404s on some platforms.
    expect(waLink("+447510053019")).not.toContain("+");
  });
});
