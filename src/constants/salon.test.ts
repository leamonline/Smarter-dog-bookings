import { describe, it, expect } from "vitest";
import { AVAILABLE_ADDONS, getAddonPrice, getAddonsTotal } from "./salon.js";

describe("Add-on pricing helpers", () => {
  it("Flea Bath is £10", () => {
    expect(getAddonPrice("Flea Bath")).toBe(10);
  });

  it("Sensitive Shampoo is included (£0)", () => {
    expect(getAddonPrice("Sensitive Shampoo")).toBe(0);
  });

  it("Anal Glands is included (£0)", () => {
    expect(getAddonPrice("Anal Glands")).toBe(0);
  });

  it("Unknown add-on returns 0", () => {
    expect(getAddonPrice("Made Up Service")).toBe(0);
  });

  it("Empty or nullish list totals 0", () => {
    expect(getAddonsTotal([])).toBe(0);
    expect(getAddonsTotal(null)).toBe(0);
    expect(getAddonsTotal(undefined)).toBe(0);
  });

  it("Sums multiple add-ons correctly", () => {
    expect(getAddonsTotal(["Flea Bath", "Sensitive Shampoo"])).toBe(10);
    expect(getAddonsTotal(["Sensitive Shampoo", "Anal Glands"])).toBe(0);
    expect(getAddonsTotal(["Flea Bath"])).toBe(10);
  });

  it("AVAILABLE_ADDONS contains all three known add-ons", () => {
    expect(AVAILABLE_ADDONS).toContain("Flea Bath");
    expect(AVAILABLE_ADDONS).toContain("Sensitive Shampoo");
    expect(AVAILABLE_ADDONS).toContain("Anal Glands");
  });
});
