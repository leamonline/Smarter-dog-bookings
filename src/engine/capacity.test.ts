import { describe, expect, it } from "vitest";

// Staff-blocked seats live in day_settings.overrides (per-slot
// seatIndex -> "blocked"). These tests pin the behaviour the booking wizards
// rely on: a blocked seat removes a free seat from its OWN slot only, without
// counting toward the daily cap or cascading through the 2-2-1 windowing.
import { canBookSlot, findGroupedSlots } from "./capacity";
import { SALON_SLOTS, DAILY_DOG_CAP } from "../constants/salon";

type Bk = { slot: string; size: "small" | "medium" | "large"; _dogId?: string };

function bookings(...rows: Bk[]) {
  return rows as never;
}

describe("canBookSlot — staff-blocked seats", () => {
  it("rejects a dog when the slot's only free seat is blocked", () => {
    const result = canBookSlot(
      bookings({ slot: "10:30", size: "small", _dogId: "other" }),
      "10:30",
      "small",
      SALON_SLOTS as never,
      { overrides: { 1: "blocked" } },
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Slot is full");
  });

  it("allows the same booking when no seat is blocked (proves the block is the cause)", () => {
    const result = canBookSlot(
      bookings({ slot: "10:30", size: "small", _dogId: "other" }),
      "10:30",
      "small",
      SALON_SLOTS as never,
      {},
    );
    expect(result.allowed).toBe(true);
  });

  it("a capacity override books past a blocked seat", () => {
    const result = canBookSlot(
      bookings({ slot: "10:30", size: "small", _dogId: "other" }),
      "10:30",
      "small",
      SALON_SLOTS as never,
      { overrides: { 1: "blocked" }, staffOverride: { approval: true, capacity: true } },
    );
    expect(result.allowed).toBe(true);
  });
});

describe("findGroupedSlots — staff-blocked seats", () => {
  it("does not offer a slot whose only free seat is blocked, but still offers others", () => {
    const dogs = [{ id: "d1", size: "small" as const }];
    const occ = bookings({ slot: "10:30", size: "small", _dogId: "other" });

    const withBlock = findGroupedSlots(dogs, occ, SALON_SLOTS, DAILY_DOG_CAP, {
      "10:30": { 1: "blocked" },
    });
    expect(withBlock.some((a) => a.dropOffTime === "10:30")).toBe(false);
    expect(withBlock.length).toBeGreaterThan(0);

    // Without the block, 10:30 IS offered — confirms the override drives it.
    const without = findGroupedSlots(dogs, occ, SALON_SLOTS, DAILY_DOG_CAP);
    expect(without.some((a) => a.dropOffTime === "10:30")).toBe(true);
  });

  it("blocking a slot does not cap neighbouring slots (no 2-2-1 cascade)", () => {
    const dogs = [{ id: "d1", size: "small" as const }];
    const results = findGroupedSlots(dogs, bookings(), SALON_SLOTS, DAILY_DOG_CAP, {
      "10:30": { 0: "blocked", 1: "blocked" },
    });
    expect(results.some((a) => a.dropOffTime === "10:30")).toBe(false);
    expect(results.some((a) => a.dropOffTime === "10:00")).toBe(true);
    expect(results.some((a) => a.dropOffTime === "11:00")).toBe(true);
  });

  it("a blocked seat does not count toward the daily cap", () => {
    // 13 real dogs in (cap 14) → one more fits. A block elsewhere must not be
    // counted as occupancy and must not push the day over the cap.
    const existing = Array.from({ length: 13 }, (_, i) => ({
      slot: ["08:30", "09:30", "11:30", "12:30", "13:00"][i % 5],
      size: "small" as const,
      _dogId: `e${i}`,
    }));
    const results = findGroupedSlots(
      [{ id: "new", size: "small" as const }],
      existing as never,
      SALON_SLOTS,
      DAILY_DOG_CAP,
      { "10:30": { 0: "blocked" } },
    );
    // The 14th dog still has somewhere to go (10:30 seat 1, 11:00, etc.).
    expect(results.length).toBeGreaterThan(0);
  });
});
