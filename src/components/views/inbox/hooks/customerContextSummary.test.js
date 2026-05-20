/**
 * customerContextSummary — unit tests for the pure helpers behind
 * the inbox customer-context panel.
 *
 * Run: npx vitest run src/components/views/inbox/hooks/customerContextSummary.test.js
 */

import { describe, it, expect } from "vitest";
import {
  buildCustomerSummary,
  formatBookingDate,
  waMeLink,
  telLink,
} from "./customerContextSummary.js";

describe("buildCustomerSummary", () => {
  it("returns empty string when human is null", () => {
    expect(buildCustomerSummary({ human: null, dogs: [], lastBooking: null })).toBe("");
  });

  it("returns 'on file with no dogs' when human exists but has no dogs", () => {
    const human = { id: "h1", fullName: "Sam Smith" };
    expect(
      buildCustomerSummary({ human, dogs: [], lastBooking: null }),
    ).toBe("On file with no dogs yet.");
  });

  it("returns first-time-visitor copy when dogs exist but no past booking", () => {
    const human = { id: "h1" };
    const dogs = [{ id: "d1", name: "Rex" }];
    expect(
      buildCustomerSummary({ human, dogs, lastBooking: null }),
    ).toBe("First-time visitor — Rex on file, no past grooms yet.");
  });

  it("pluralises dogs when there's more than one and no last booking", () => {
    const human = { id: "h1" };
    const dogs = [
      { id: "d1", name: "Rex" },
      { id: "d2", name: "Bella" },
    ];
    expect(
      buildCustomerSummary({ human, dogs, lastBooking: null }),
    ).toBe("First-time visitor — 2 dogs on file, no past grooms yet.");
  });

  it("uses 'returning client' phrasing when there's a past booking", () => {
    const human = { id: "h1" };
    const dogs = [{ id: "d1", name: "Rex" }];
    const lastBooking = {
      date: "2026-05-06",
      service: "full-groom",
    };
    const summary = buildCustomerSummary({ human, dogs, lastBooking });
    expect(summary).toContain("Returning client");
    expect(summary).toContain("Rex");
    expect(summary).toContain("full groom");
    // Date format depends on the test environment's locale, but
    // it should at least mention "May" in en-GB.
    expect(summary.toLowerCase()).toContain("may");
  });

  it("falls back to short dog count when 2+ dogs and a past booking", () => {
    const human = { id: "h1" };
    const dogs = [
      { id: "d1", name: "Rex" },
      { id: "d2", name: "Bella" },
      { id: "d3", name: "Spike" },
    ];
    const lastBooking = { date: "2026-05-06", service: "bath-and-brush" };
    const summary = buildCustomerSummary({ human, dogs, lastBooking });
    expect(summary).toContain("3 dogs");
    expect(summary).toContain("bath & brush");
  });
});

describe("formatBookingDate", () => {
  it("returns empty string for falsy input", () => {
    expect(formatBookingDate(null)).toBe("");
    expect(formatBookingDate("")).toBe("");
    expect(formatBookingDate(undefined)).toBe("");
  });

  it("formats a valid YYYY-MM-DD as UK short", () => {
    const out = formatBookingDate("2026-05-12");
    // Tue 12 May (or similar)
    expect(out).toMatch(/12 May/);
  });

  it("falls back to the raw string when it doesn't parse", () => {
    expect(formatBookingDate("not-a-date")).toBe("not-a-date");
  });
});

describe("waMeLink", () => {
  it("returns null for empty or missing input", () => {
    expect(waMeLink(null)).toBeNull();
    expect(waMeLink("")).toBeNull();
    expect(waMeLink(undefined)).toBeNull();
  });

  it("normalises UK numbers to E.164 digits and prefixes wa.me", () => {
    expect(waMeLink("+44 7700 900000")).toBe("https://wa.me/447700900000");
    // Leading "00" international dial prefix is stripped — "0044…" is
    // the international form of a UK number, not a separate country.
    expect(waMeLink("(0044) 7700 900000")).toBe("https://wa.me/447700900000");
  });

  it("returns null when nothing-digit is left after stripping", () => {
    expect(waMeLink("(no number)")).toBeNull();
  });
});

describe("telLink", () => {
  it("returns null for empty or missing input", () => {
    expect(telLink(null)).toBeNull();
    expect(telLink("")).toBeNull();
    expect(telLink("   ")).toBeNull();
  });

  it("normalises the phone into a clean tel: link", () => {
    expect(telLink("+44 7700 900000")).toBe("tel:+447700900000");
  });
});
