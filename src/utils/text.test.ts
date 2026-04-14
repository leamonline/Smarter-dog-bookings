import { describe, it, expect } from "vitest";
import { titleCase } from "./text.js";

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
