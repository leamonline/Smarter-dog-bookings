import { describe, it, expect } from "vitest";

import { computeRevenue } from "./pricing.js";
import { computeBookingPricing, getDogByIdOrName } from "./bookingRules.js";

// computeRevenue is the day/week/lifetime money figure. It must agree with the
// booking card, which uses computeBookingPricing(...).subtotal — i.e. the full
// appointment value (service + add-ons + custom price), independent of how much
// has been paid. Before this change it re-parsed PRICING and ignored add-ons.

describe("computeRevenue", () => {
  it("counts add-ons in the appointment value", () => {
    const bookings = [
      { service: "full-groom", size: "small", addons: ["Flea Bath"], _dogId: "d1" },
    ] as any;
    const dogs = { d1: { id: "d1", name: "Bella" } } as any;
    expect(computeRevenue(bookings, dogs)).toBe(52); // £42 groom + £10 flea bath
  });

  it("uses the dog's custom price and still adds add-ons on top", () => {
    const bookings = [
      { service: "full-groom", size: "small", addons: ["Flea Bath"], _dogId: "d1" },
    ] as any;
    const dogs = { d1: { id: "d1", name: "Bella", customPrice: 55 } } as any;
    expect(computeRevenue(bookings, dogs)).toBe(65); // £55 custom + £10 flea bath
  });

  it("is invariant to payment state (revenue = appointment value, not amount due)", () => {
    const base = { service: "full-groom", size: "small", addons: ["Flea Bath"], _dogId: "d1" };
    const dogs = { d1: { id: "d1", name: "Bella" } } as any;
    const due = computeRevenue([{ ...base, payment: "Due at Pick-up" }] as any, dogs);
    const deposit = computeRevenue([{ ...base, payment: "Deposit Paid" }] as any, dogs);
    const paid = computeRevenue([{ ...base, payment: "Paid in Full" }] as any, dogs);
    expect(due).toBe(52);
    expect(deposit).toBe(52);
    expect(paid).toBe(52);
  });

  it("matches the sum of computeBookingPricing(...).subtotal across a mixed day", () => {
    const bookings = [
      { service: "full-groom", size: "small", addons: ["Flea Bath"], _dogId: "d1", payment: "Deposit Paid" },
      { service: "bath-and-brush", size: "medium", addons: [], _dogId: "d2", payment: "Paid in Full" },
      { service: "full-groom", size: "large", addons: [], dogName: "Rex" },
    ] as any;
    const dogs = {
      d1: { id: "d1", name: "Bella", customPrice: 55 },
      d2: { id: "d2", name: "Max" },
      d3: { id: "d3", name: "Rex" },
    } as any;
    const expected = bookings.reduce((sum: number, b: any) => {
      const dog = getDogByIdOrName(dogs, b._dogId || b.dogName);
      return (
        sum +
        computeBookingPricing({
          service: b.service,
          size: b.size,
          addons: b.addons,
          customPrice: dog?.customPrice,
        }).subtotal
      );
    }, 0);
    expect(computeRevenue(bookings, dogs)).toBe(expected);
  });

  it("returns 0 for empty or nullish input", () => {
    expect(computeRevenue(null, null)).toBe(0);
    expect(computeRevenue([], {})).toBe(0);
    expect(computeRevenue(undefined, undefined)).toBe(0);
  });
});
