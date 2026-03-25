// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  getSeatsUsed,
  getSeatsUsedMap,
  hasLargeDog,
  getMaxSeatsForSlot,
  computeSlotCapacities,
  canBookSlot,
} from "./capacity.ts";

const SLOTS = ["08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00"];

function mkBooking(slot, size = "small") {
  return { id: Math.random(), slot, size, dogName: "Dog", breed: "Mix", service: "full_groom", owner: "Owner" };
}

describe("getSeatsUsed", () => {
  it("returns 0 for empty bookings", () => {
    expect(getSeatsUsed([], "08:30")).toBe(0);
  });

  it("counts small dogs as 1 seat each", () => {
    const bookings = [mkBooking("08:30"), mkBooking("08:30"), mkBooking("09:00")];
    expect(getSeatsUsed(bookings, "08:30")).toBe(2);
    expect(getSeatsUsed(bookings, "09:00")).toBe(1);
  });

  it("counts large dogs using LARGE_DOG_SLOTS seats config", () => {
    // 08:30 has seats: 1 in LARGE_DOG_SLOTS, so large dog uses 1 seat
    const bookings = [mkBooking("08:30", "large")];
    expect(getSeatsUsed(bookings, "08:30")).toBe(1);
  });

  it("counts large dogs as 2 seats in non-approved slots", () => {
    // 09:30 is not in LARGE_DOG_SLOTS, so large dog uses 2 seats
    const bookings = [mkBooking("09:30", "large")];
    expect(getSeatsUsed(bookings, "09:30")).toBe(2);
  });

  it("counts large dogs as 2 seats in non-shareable slots", () => {
    // 12:00 has seats: 2 in LARGE_DOG_SLOTS
    const bookings = [mkBooking("12:00", "large")];
    expect(getSeatsUsed(bookings, "12:00")).toBe(2);
  });
});

describe("getSeatsUsedMap", () => {
  it("builds a map of seat counts per slot", () => {
    const bookings = [mkBooking("08:30"), mkBooking("09:00"), mkBooking("09:00")];
    const map = getSeatsUsedMap(bookings, SLOTS);
    expect(map["08:30"]).toBe(1);
    expect(map["09:00"]).toBe(2);
    expect(map["09:30"]).toBe(0);
  });
});

describe("hasLargeDog", () => {
  it("returns false when no large dogs", () => {
    expect(hasLargeDog([mkBooking("08:30")], "08:30")).toBe(false);
  });

  it("returns true when a large dog is in the slot", () => {
    expect(hasLargeDog([mkBooking("08:30", "large")], "08:30")).toBe(true);
  });

  it("checks the correct slot", () => {
    expect(hasLargeDog([mkBooking("08:30", "large")], "09:00")).toBe(false);
  });
});

describe("getMaxSeatsForSlot", () => {
  it("returns 2 when no adjacent double-booked slots", () => {
    const seatsMap = {};
    SLOTS.forEach((s) => (seatsMap[s] = 0));
    expect(getMaxSeatsForSlot(0, seatsMap, SLOTS)).toBe(2);
  });

  it("constrains to 1 when two adjacent slots are double-booked (2-2-1 rule)", () => {
    const seatsMap = {};
    SLOTS.forEach((s) => (seatsMap[s] = 0));
    // Slots 0 and 1 are double-booked, so slot 2 must be capped
    seatsMap["08:30"] = 2;
    seatsMap["09:00"] = 2;
    expect(getMaxSeatsForSlot(2, seatsMap, SLOTS)).toBe(1); // 09:30 constrained
  });

  it("constrains the slot between two double-booked neighbors", () => {
    const seatsMap = {};
    SLOTS.forEach((s) => (seatsMap[s] = 0));
    seatsMap["08:30"] = 2; // prev
    seatsMap["09:30"] = 2; // next
    // 09:00 (index 1) has prev double and next double
    expect(getMaxSeatsForSlot(1, seatsMap, SLOTS)).toBe(1);
  });

  it("allows 2 when only one neighbor is double-booked", () => {
    const seatsMap = {};
    SLOTS.forEach((s) => (seatsMap[s] = 0));
    seatsMap["08:30"] = 2;
    // 09:00 (index 1) only has prev double, next is 0
    expect(getMaxSeatsForSlot(1, seatsMap, SLOTS)).toBe(2);
  });
});

describe("computeSlotCapacities", () => {
  it("returns capacity for all active slots", () => {
    const caps = computeSlotCapacities([], SLOTS);
    expect(Object.keys(caps).length).toBe(SLOTS.length);
    expect(caps["08:30"].used).toBe(0);
    expect(caps["08:30"].max).toBe(2);
    expect(caps["08:30"].available).toBe(2);
  });

  it("computes correct availability with bookings", () => {
    const bookings = [mkBooking("08:30"), mkBooking("08:30")];
    const caps = computeSlotCapacities(bookings, SLOTS);
    expect(caps["08:30"].used).toBe(2);
    expect(caps["08:30"].available).toBe(0);
  });

  it("marks large dog non-shareable slot as zero available", () => {
    // 12:00 is canShare: false — a large dog fills the entire slot
    const bookings = [mkBooking("12:00", "large")];
    const caps = computeSlotCapacities(bookings, SLOTS);
    expect(caps["12:00"].available).toBe(0);
    expect(caps["12:00"].hasLargeDog).toBe(true);
  });

  it("tracks isConstrained flag", () => {
    const bookings = [mkBooking("08:30"), mkBooking("08:30"), mkBooking("09:00"), mkBooking("09:00")];
    const caps = computeSlotCapacities(bookings, SLOTS);
    // 09:30 should be constrained since both neighbors are double
    expect(caps["09:30"].isConstrained).toBe(true);
    expect(caps["09:30"].max).toBe(1);
  });
});

describe("canBookSlot", () => {
  it("allows booking in an empty slot", () => {
    const result = canBookSlot([], "08:30", "small", SLOTS);
    expect(result.allowed).toBe(true);
  });

  it("rejects booking in a full slot", () => {
    const bookings = [mkBooking("08:30"), mkBooking("08:30")];
    const result = canBookSlot(bookings, "08:30", "small", SLOTS);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("full");
  });

  it("rejects large dog in unapproved slot", () => {
    const result = canBookSlot([], "09:30", "large", SLOTS);
    expect(result.allowed).toBe(false);
    expect(result.needsApproval).toBe(true);
  });

  it("allows large dog in approved slot", () => {
    const result = canBookSlot([], "08:30", "large", SLOTS);
    expect(result.allowed).toBe(true);
  });

  it("rejects large dog in non-shareable slot with existing booking", () => {
    const bookings = [mkBooking("12:00")];
    const result = canBookSlot(bookings, "12:00", "large", SLOTS);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("already has bookings");
  });

  it("enforces 09:00 conditional rule (08:30 must be empty)", () => {
    const bookings = [mkBooking("08:30")];
    const result = canBookSlot(bookings, "09:00", "large", SLOTS);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("8:30am must be empty");
  });

  it("enforces 09:00 conditional rule (10:00 must have <=1 seats)", () => {
    const bookings = [mkBooking("10:00"), mkBooking("10:00")];
    const result = canBookSlot(bookings, "09:00", "large", SLOTS);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("10:00am");
  });

  it("allows 09:00 large dog when conditions met", () => {
    // No 08:30 bookings, 10:00 has <=1 seat
    const result = canBookSlot([], "09:00", "large", SLOTS);
    expect(result.allowed).toBe(true);
  });

  it("rejects small dog when large dog fills non-shareable slot", () => {
    const bookings = [mkBooking("12:00", "large")];
    const result = canBookSlot(bookings, "12:00", "small", SLOTS);
    expect(result.allowed).toBe(false);
    // Capacity is 0 because largeFills sets available to 0 in computeSlotCapacities
    expect(result.reason).toBeDefined();
  });

  it("rejects booking with 2-2-1 constraint", () => {
    // Fill 08:30 and 09:00 to 2 each → 09:30 is constrained to 1
    const bookings = [
      mkBooking("08:30"), mkBooking("08:30"),
      mkBooking("09:00"), mkBooking("09:00"),
      mkBooking("09:30"),
    ];
    const result = canBookSlot(bookings, "09:30", "small", SLOTS);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("2-2-1");
  });

  it("returns invalid slot for unknown slot", () => {
    const result = canBookSlot([], "99:99", "small", SLOTS);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Invalid slot");
  });
});
