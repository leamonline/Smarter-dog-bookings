import { describe, it, expect } from "vitest";

import {
  isServiceSupportedForSize,
  getAllowedServicesForSize,
  normalizeServiceForSize,
  getServicePriceLabel,
  getNumericPrice,
  toLocalDateStr,
  getHumanByIdOrName,
  getDogByIdOrName,
  computeBookingPricing,
} from "./bookingRules.js";

// ── isServiceSupportedForSize ───────────────────────────────────

describe("isServiceSupportedForSize", () => {
  it("returns true for valid service+size combos", () => {
    expect(isServiceSupportedForSize("full-groom", "small")).toBe(true);
    expect(isServiceSupportedForSize("full-groom", "large")).toBe(true);
    expect(isServiceSupportedForSize("bath-and-brush", "medium")).toBe(true);
  });

  it("returns false for N/A combos", () => {
    expect(isServiceSupportedForSize("puppy-groom", "large")).toBe(false);
  });

  it("returns false for unknown services", () => {
    expect(isServiceSupportedForSize("nonexistent", "small")).toBe(false);
  });

  it("returns false for unknown sizes", () => {
    expect(isServiceSupportedForSize("full-groom", "giant")).toBe(false);
  });
});

// ── getAllowedServicesForSize ────────────────────────────────────

describe("getAllowedServicesForSize", () => {
  it("returns all 4 services for small dogs", () => {
    const services = getAllowedServicesForSize("small");
    expect(services.length).toBe(4);
    expect(services.map((s) => s.id)).toContain("puppy-groom");
  });

  it("excludes puppy-groom for large dogs", () => {
    const services = getAllowedServicesForSize("large");
    expect(services.map((s) => s.id)).not.toContain("puppy-groom");
    expect(services.length).toBe(3);
  });

  it("returns empty for unknown size", () => {
    expect(getAllowedServicesForSize("giant")).toEqual([]);
  });
});

// ── normalizeServiceForSize ─────────────────────────────────────

describe("normalizeServiceForSize", () => {
  it("returns the same service if supported", () => {
    expect(normalizeServiceForSize("full-groom", "small")).toBe("full-groom");
  });

  it("falls back to first allowed service if not supported", () => {
    const result = normalizeServiceForSize("puppy-groom", "large");
    expect(result).toBe("full-groom"); // first allowed for large
  });
});

// ── getServicePriceLabel ────────────────────────────────────────

describe("getServicePriceLabel", () => {
  it("returns price string for valid combo", () => {
    expect(getServicePriceLabel("full-groom", "small")).toBe("\u00A342+");
  });

  it("returns N/A for unsupported combo", () => {
    expect(getServicePriceLabel("puppy-groom", "large")).toBe("N/A");
  });

  it("returns N/A for unknown service", () => {
    expect(getServicePriceLabel("nonexistent", "small")).toBe("N/A");
  });
});

// ── getNumericPrice ─────────────────────────────────────────────

describe("getNumericPrice", () => {
  it("extracts number from currency string", () => {
    expect(getNumericPrice("\u00A342+")).toBe(42);
    expect(getNumericPrice("\u00A360+")).toBe(60);
  });

  it("returns number as-is", () => {
    expect(getNumericPrice(55)).toBe(55);
  });

  it("returns 0 for non-numeric string", () => {
    expect(getNumericPrice("N/A")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(getNumericPrice("")).toBe(0);
  });
});

// ── toLocalDateStr ──────────────────────────────────────────────

describe("toLocalDateStr", () => {
  it("formats a Date object as YYYY-MM-DD", () => {
    const d = new Date(2025, 0, 15); // Jan 15, 2025
    expect(toLocalDateStr(d)).toBe("2025-01-15");
  });

  it("pads single-digit month and day", () => {
    const d = new Date(2025, 2, 5); // Mar 5, 2025
    expect(toLocalDateStr(d)).toBe("2025-03-05");
  });

  it("returns a string as-is", () => {
    expect(toLocalDateStr("2025-06-30")).toBe("2025-06-30");
  });

  it("returns empty string for invalid input", () => {
    expect(toLocalDateStr(null as any)).toBe("");
    expect(toLocalDateStr(undefined as any)).toBe("");
  });
});

// ── getHumanByIdOrName ──────────────────────────────────────────

describe("getHumanByIdOrName", () => {
  const humans = {
    h1: { id: "h1", name: "Jane", surname: "Doe", fullName: "Jane Doe" },
    h2: { id: "h2", name: "Bob", surname: "Smith", fullName: "Bob Smith" },
  } as any;

  it("finds by key", () => {
    expect(getHumanByIdOrName(humans, "h1")?.id).toBe("h1");
  });

  it("finds by fullName", () => {
    expect(getHumanByIdOrName(humans, "Bob Smith")?.id).toBe("h2");
  });

  it("returns null for missing", () => {
    expect(getHumanByIdOrName(humans, "nobody")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(getHumanByIdOrName(humans, "")).toBeNull();
    expect(getHumanByIdOrName(null as any, "h1")).toBeNull();
  });
});

// ── getDogByIdOrName ────────────────────────────────────────────

describe("getDogByIdOrName", () => {
  const dogs = {
    d1: { id: "d1", name: "Bella" },
    d2: { id: "d2", name: "Max" },
  } as any;

  it("finds by key", () => {
    expect(getDogByIdOrName(dogs, "d1")?.name).toBe("Bella");
  });

  it("finds by name", () => {
    expect(getDogByIdOrName(dogs, "Max")?.id).toBe("d2");
  });

  it("returns null for missing", () => {
    expect(getDogByIdOrName(dogs, "Buddy")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(getDogByIdOrName(dogs, "")).toBeNull();
  });
});

// ── computeBookingPricing ────────────────────────────────────────

describe("computeBookingPricing", () => {
  it("uses PRICING when no custom price", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small" });
    expect(result.basePrice).toBe(42);
    expect(result.subtotal).toBe(42);
    expect(result.amountDue).toBe(42);
  });

  it("prefers customPrice over PRICING", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small", customPrice: 55 });
    expect(result.basePrice).toBe(55);
    expect(result.subtotal).toBe(55);
  });

  it("treats null customPrice as unset and falls back to PRICING", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "medium", customPrice: null });
    expect(result.basePrice).toBe(46);
  });

  it("adds addons to subtotal", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small", addons: ["Flea Bath"] });
    expect(result.addonsTotal).toBe(10);
    expect(result.subtotal).toBe(52);
    expect(result.amountDue).toBe(52);
  });

  it("subtracts deposit when Deposit Paid", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small", addons: ["Flea Bath"], payment: "Deposit Paid", depositAmount: 10 });
    expect(result.subtotal).toBe(52);
    expect(result.depositPaid).toBe(10);
    expect(result.amountDue).toBe(42);
    expect(result.isDepositPaid).toBe(true);
  });

  it("defaults deposit to £10 when Deposit Paid with no amount", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small", payment: "Deposit Paid" });
    expect(result.amountDue).toBe(32);
  });

  it("zeroes amountDue when Paid in Full", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small", addons: ["Flea Bath"], payment: "Paid in Full" });
    expect(result.subtotal).toBe(52);
    expect(result.amountDue).toBe(0);
    expect(result.isPaidInFull).toBe(true);
  });

  it("clamps amountDue at 0 when deposit exceeds subtotal", () => {
    const result = computeBookingPricing({ service: "full-groom", size: "small", payment: "Deposit Paid", depositAmount: 100 });
    expect(result.amountDue).toBe(0);
  });

  it("normalizes invalid service+size combo via PRICING fallback", () => {
    const result = computeBookingPricing({ service: "puppy-groom", size: "large" });
    expect(result.basePrice).toBeGreaterThan(0);
  });
});
