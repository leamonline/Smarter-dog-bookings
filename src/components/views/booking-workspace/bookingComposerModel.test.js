import { describe, expect, it } from "vitest";

import {
  MAX_OFFER_SLOTS,
  availableServicesFor,
  buildOfferText,
  defaultServiceFor,
  isDogSelectable,
  seatOccupancy,
  toggleOfferSlot,
} from "./bookingComposerModel.js";

const SMALL = { id: "d1", name: "Alfie", breed: "Cockapoo", size: "small" };
const MEDIUM = { id: "d2", name: "Bella", breed: "Cocker", size: "medium" };
const LARGE = { id: "d3", name: "Rex", breed: "Rottweiler", size: "large" };
const SIZELESS = { id: "d4", name: "Pip", breed: "Unknown", size: null };

function booking(dogName, slot, size = "small") {
  return { dogName, slot, size, status: "Booked" };
}

describe("isDogSelectable", () => {
  it("allows a dog with a recorded size", () => {
    expect(isDogSelectable(SMALL)).toBe(true);
  });

  // Capacity is safety-critical: a dog with no authoritative size on its
  // record must never be guessed at from conversation text.
  it("blocks a dog with no size on file", () => {
    expect(isDogSelectable(SIZELESS)).toBe(false);
    expect(isDogSelectable({ id: "x", name: "X" })).toBe(false);
  });

  it("blocks a size the engine does not recognise", () => {
    expect(isDogSelectable({ id: "x", name: "X", size: "enormous" })).toBe(false);
  });
});

describe("availableServicesFor", () => {
  it("offers every service to a small dog", () => {
    expect(availableServicesFor(SMALL).map((s) => s.id)).toContain("puppy-groom");
  });

  // PRICING marks puppy-groom as null for large — not offered at that size.
  it("drops puppy groom for a large dog", () => {
    const ids = availableServicesFor(LARGE).map((s) => s.id);
    expect(ids).not.toContain("puppy-groom");
    expect(ids).toContain("full-groom");
  });

  it("returns nothing useful for a dog with no size", () => {
    expect(availableServicesFor(SIZELESS)).toEqual([]);
  });
});

describe("defaultServiceFor", () => {
  it("uses the dog's most recent service when there is one", () => {
    expect(defaultServiceFor(SMALL, { d1: "bath-and-brush" })).toBe("bath-and-brush");
  });

  it("falls back to Full Groom when the dog has no history", () => {
    expect(defaultServiceFor(SMALL, {})).toBe("full-groom");
    expect(defaultServiceFor(SMALL, undefined)).toBe("full-groom");
  });

  // A large dog previously booked as a puppy groom must not default back into
  // a service that isn't offered at its current size.
  it("falls back when the last service is not offered at this dog's size", () => {
    expect(defaultServiceFor(LARGE, { d3: "puppy-groom" })).toBe("full-groom");
  });

  it("ignores an unknown service id", () => {
    expect(defaultServiceFor(SMALL, { d1: "nonsense" })).toBe("full-groom");
  });
});

describe("seatOccupancy", () => {
  const slots = ["08:30", "09:00", "09:30", "10:00"];

  it("reports an empty slot as fully free", () => {
    const result = seatOccupancy("09:00", [], slots);
    expect(result).toMatchObject({ booked: 0, total: 2, free: 2, dogs: [] });
  });

  it("reports a part-filled slot with the dogs already in it", () => {
    const result = seatOccupancy("09:00", [booking("Alfie", "09:00")], slots);
    expect(result).toMatchObject({ booked: 1, free: 1, total: 2 });
    expect(result.dogs).toEqual([{ name: "Alfie", breed: null, size: "small" }]);
  });

  it("reports a full slot as having no free seats", () => {
    const result = seatOccupancy(
      "09:00",
      [booking("Alfie", "09:00"), booking("Bella", "09:00", "medium")],
      slots,
    );
    expect(result.free).toBe(0);
    expect(result.dogs).toHaveLength(2);
  });

  // A large dog takes the whole slot, so the seat total for that slot drops.
  it("accounts for a large dog taking the slot over", () => {
    const result = seatOccupancy("09:00", [booking("Rex", "09:00", "large")], slots);
    expect(result.free).toBe(0);
  });

  it("carries breed through for display when known", () => {
    const rows = [{ dogName: "Alfie", breed: "Cockapoo", slot: "09:00", size: "small" }];
    expect(seatOccupancy("09:00", rows, slots).dogs[0]).toEqual({
      name: "Alfie",
      breed: "Cockapoo",
      size: "small",
    });
  });

  it("ignores bookings in other slots", () => {
    const result = seatOccupancy("09:00", [booking("Alfie", "10:00")], slots);
    expect(result.booked).toBe(0);
  });
});

describe("toggleOfferSlot", () => {
  const a = { dateStr: "2026-08-17", slot: "11:00" };
  const b = { dateStr: "2026-08-18", slot: "12:30" };
  const c = { dateStr: "2026-08-19", slot: "09:30" };
  const d = { dateStr: "2026-08-20", slot: "10:00" };

  it("adds a slot", () => {
    expect(toggleOfferSlot([], a)).toEqual([a]);
  });

  it("removes a slot that is already chosen", () => {
    expect(toggleOfferSlot([a, b], a)).toEqual([b]);
  });

  it("keeps slots across different dates", () => {
    expect(toggleOfferSlot(toggleOfferSlot([a], b), c)).toEqual([a, b, c]);
  });

  it("refuses a fourth slot", () => {
    const full = [a, b, c];
    expect(toggleOfferSlot(full, d)).toBe(full);
    expect(MAX_OFFER_SLOTS).toBe(3);
  });

  it("still allows deselecting when at the limit", () => {
    expect(toggleOfferSlot([a, b, c], b)).toEqual([a, c]);
  });
});

describe("buildOfferText", () => {
  const choices = [
    { dateStr: "2026-08-17", slot: "11:00" },
    { dateStr: "2026-08-18", slot: "12:30" },
    { dateStr: "2026-08-19", slot: "09:30" },
  ];

  it("names one dog and lists the offered times", () => {
    const text = buildOfferText({
      customerName: "Steve",
      dogs: [SMALL],
      choices,
    });
    expect(text).toContain("Hi Steve");
    expect(text).toContain("Alfie");
    expect(text).toContain("Monday 17 August at 11:00");
    expect(text).toContain("Tuesday 18 August at 12:30");
    expect(text).toContain("Wednesday 19 August at 09:30");
    expect(text).toContain("Let us know which works best.");
  });

  it("joins two dogs naturally", () => {
    const text = buildOfferText({
      customerName: "Steve",
      dogs: [SMALL, MEDIUM],
      choices: [choices[0]],
    });
    expect(text).toContain("Alfie and Bella");
  });

  it("joins three dogs with commas and a final and", () => {
    const text = buildOfferText({
      customerName: "Steve",
      dogs: [SMALL, MEDIUM, LARGE],
      choices: [choices[0]],
    });
    expect(text).toContain("Alfie, Bella and Rex");
  });

  it("orders times chronologically regardless of selection order", () => {
    const text = buildOfferText({
      customerName: "Steve",
      dogs: [SMALL],
      choices: [choices[2], choices[0], choices[1]],
    });
    const monday = text.indexOf("Monday 17 August");
    const wednesday = text.indexOf("Wednesday 19 August");
    expect(monday).toBeGreaterThan(-1);
    expect(monday).toBeLessThan(wednesday);
  });

  it("copes with a missing customer name without printing undefined", () => {
    const text = buildOfferText({ customerName: "", dogs: [SMALL], choices });
    expect(text).not.toContain("undefined");
    expect(text.startsWith("Hi,")).toBe(false);
  });

  it("returns an empty string when there is nothing to offer", () => {
    expect(buildOfferText({ customerName: "Steve", dogs: [SMALL], choices: [] })).toBe("");
    expect(buildOfferText({ customerName: "Steve", dogs: [], choices })).toBe("");
  });
});
