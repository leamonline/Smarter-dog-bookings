import { describe, expect, it } from "vitest";
import { findNextAvailableSlot, isOnlineBookableDog } from "./nextAvailableSlot";
import { DAILY_DOG_CAP, SALON_SLOTS } from "../constants/salon";

const dog = { id: "tipi", size: "medium" as const, isPregnant: false };
const allOpen = () => true;

// Fill every seat on the canonical grid with small dogs: the 2-2-1 rule then
// leaves no room for another dog anywhere that day.
function fullDay() {
  return SALON_SLOTS.flatMap((slot) => [
    { slot, size: "small", _dogId: `${slot}-a`, status: "Booked" },
    { slot, size: "small", _dogId: `${slot}-b`, status: "Booked" },
  ]) as never[];
}

describe("isOnlineBookableDog", () => {
  it("needs a confirmed size and no pregnancy flag", () => {
    expect(isOnlineBookableDog(dog)).toBe(true);
    expect(isOnlineBookableDog({ ...dog, size: null })).toBe(false);
    expect(isOnlineBookableDog({ ...dog, isPregnant: true })).toBe(false);
    expect(isOnlineBookableDog(null)).toBe(false);
  });
});

describe("findNextAvailableSlot", () => {
  it("returns the earliest drop-off on the first open date", () => {
    const next = findNextAvailableSlot({
      dates: ["2026-11-16", "2026-11-17"],
      dog,
      isOpen: allOpen,
      occupancyByDate: {},
      blockedByDate: {},
    });
    expect(next).toEqual({ date: "2026-11-16", dropOffTime: SALON_SLOTS[0] });
  });

  it("skips closed dates", () => {
    const next = findNextAvailableSlot({
      dates: ["2026-11-16", "2026-11-17"],
      dog,
      isOpen: (date) => date !== "2026-11-16",
      occupancyByDate: {},
      blockedByDate: {},
    });
    expect(next?.date).toBe("2026-11-17");
  });

  it("skips a day with no seat left and moves to the next", () => {
    const next = findNextAvailableSlot({
      dates: ["2026-11-16", "2026-11-17"],
      dog,
      isOpen: allOpen,
      occupancyByDate: { "2026-11-16": fullDay() },
      blockedByDate: {},
    });
    expect(next?.date).toBe("2026-11-17");
  });

  it("respects the daily cap", () => {
    const capped = Array.from({ length: DAILY_DOG_CAP }, (_, i) => ({
      slot: SALON_SLOTS[i % SALON_SLOTS.length],
      size: "small",
      _dogId: `d${i}`,
      status: "Booked",
    })) as never[];
    const next = findNextAvailableSlot({
      dates: ["2026-11-16", "2026-11-17"],
      dog,
      isOpen: allOpen,
      occupancyByDate: { "2026-11-16": capped },
      blockedByDate: {},
    });
    expect(next?.date).toBe("2026-11-17");
  });

  it("does not offer a staff-blocked seat", () => {
    const first = SALON_SLOTS[0];
    const next = findNextAvailableSlot({
      dates: ["2026-11-16"],
      dog,
      isOpen: allOpen,
      occupancyByDate: {},
      blockedByDate: { "2026-11-16": { [first]: { 0: "blocked", 1: "blocked" } } },
    });
    expect(next?.dropOffTime).not.toBe(first);
    expect(next?.dropOffTime).toBe(SALON_SLOTS[1]);
  });

  it("removes the owner's blocked slots", () => {
    const next = findNextAvailableSlot({
      dates: ["2026-11-16"],
      dog,
      isOpen: allOpen,
      occupancyByDate: {},
      blockedByDate: {},
      rules: { blockedSlots: [SALON_SLOTS[0], SALON_SLOTS[1]], preferredSlots: [] },
    });
    expect(next?.dropOffTime).toBe(SALON_SLOTS[2]);
  });

  it("offers nothing for a dog the wizard would grey out", () => {
    const args = { dates: ["2026-11-16"], isOpen: allOpen, occupancyByDate: {}, blockedByDate: {} };
    expect(findNextAvailableSlot({ ...args, dog: { ...dog, size: null } })).toBeNull();
    expect(findNextAvailableSlot({ ...args, dog: { ...dog, isPregnant: true } })).toBeNull();
  });

  it("returns null when nothing is free in the window", () => {
    const next = findNextAvailableSlot({
      dates: ["2026-11-16"],
      dog,
      isOpen: allOpen,
      occupancyByDate: { "2026-11-16": fullDay() },
      blockedByDate: {},
    });
    expect(next).toBeNull();
  });
});
