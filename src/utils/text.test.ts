import { describe, it, expect } from "vitest";
import { titleCase, normaliseSurname, isRealPersonName } from "./text";

describe("titleCase", () => {
  it("capitalizes first letter of each word", () => {
    expect(titleCase("hello world")).toBe("Hello World");
  });

  it("handles single word", () => {
    expect(titleCase("hello")).toBe("Hello");
  });

  it("handles already-capitalized input", () => {
    expect(titleCase("Hello World")).toBe("Hello World");
  });

  it("handles mixed case", () => {
    expect(titleCase("jAnE dOe")).toBe("JAnE DOe");
  });

  it("returns empty string for empty input", () => {
    expect(titleCase("")).toBe("");
  });

  it("returns empty string for null/undefined", () => {
    expect(titleCase(null as any)).toBe("");
    expect(titleCase(undefined as any)).toBe("");
  });

  it("handles multiple spaces", () => {
    expect(titleCase("hello  world")).toBe("Hello  World");
  });

  it("handles hyphenated names", () => {
    expect(titleCase("jean-claude")).toBe("Jean-Claude");
  });
});

describe("normaliseSurname", () => {
  it("returns empty string for falsy / non-string input", () => {
    expect(normaliseSurname("")).toBe("");
    expect(normaliseSurname("   ")).toBe("");
    expect(normaliseSurname(null)).toBe("");
    expect(normaliseSurname(undefined)).toBe("");
    expect(normaliseSurname(123)).toBe("");
  });

  it("strips sentinel strings that leak from seed/import data", () => {
    expect(normaliseSurname("Null")).toBe("");
    expect(normaliseSurname("NULL")).toBe("");
    expect(normaliseSurname("null")).toBe("");
    expect(normaliseSurname("Undefined")).toBe("");
    expect(normaliseSurname("N/A")).toBe("");
    expect(normaliseSurname("n/a")).toBe("");
    expect(normaliseSurname("None")).toBe("");
  });

  it("preserves real surnames including mixed case and apostrophes", () => {
    expect(normaliseSurname("Smith")).toBe("Smith");
    expect(normaliseSurname("McDonald")).toBe("McDonald");
    expect(normaliseSurname("O'Brien")).toBe("O'Brien");
    expect(normaliseSurname("  Smith  ")).toBe("Smith");
  });
});

describe("isRealPersonName", () => {
  it("rejects empty, whitespace-only and non-string input", () => {
    expect(isRealPersonName("")).toBe(false);
    expect(isRealPersonName("   ")).toBe(false);
    expect(isRealPersonName(null)).toBe(false);
    expect(isRealPersonName(undefined)).toBe(false);
    expect(isRealPersonName(42)).toBe(false);
  });

  it("rejects punctuation- and digit-only placeholders", () => {
    expect(isRealPersonName("?")).toBe(false);
    expect(isRealPersonName("??")).toBe(false);
    expect(isRealPersonName("-")).toBe(false);
    expect(isRealPersonName("...")).toBe(false);
    expect(isRealPersonName("123")).toBe(false);
    expect(isRealPersonName("!!")).toBe(false);
  });

  it("rejects known placeholder tokens regardless of case", () => {
    expect(isRealPersonName("n/a")).toBe(false);
    expect(isRealPersonName("NA")).toBe(false);
    expect(isRealPersonName("none")).toBe(false);
    expect(isRealPersonName("Null")).toBe(false);
    expect(isRealPersonName("unknown")).toBe(false);
    expect(isRealPersonName("TBC")).toBe(false);
    expect(isRealPersonName("tbd")).toBe(false);
    expect(isRealPersonName("x")).toBe(false);
    expect(isRealPersonName("xxx")).toBe(false);
  });

  it("accepts real names, including short and non-Latin ones", () => {
    expect(isRealPersonName("Amanda")).toBe(true);
    expect(isRealPersonName("O'Brien")).toBe(true);
    expect(isRealPersonName("Jean-Claude")).toBe(true);
    expect(isRealPersonName("Xu")).toBe(true);
    expect(isRealPersonName("Ng")).toBe(true);
    expect(isRealPersonName("José")).toBe(true);
    expect(isRealPersonName("  Amanda  ")).toBe(true);
  });
});
