import { describe, expect, it } from "vitest";

// Staff-blocked seats live in day_settings.overrides (per-slot
// seatIndex -> "blocked"). These tests pin the behaviour the booking wizards
// rely on: a blocked seat removes a free seat from its OWN slot only, without
// counting toward the daily cap or cascading through the 2-2-1 windowing.
import { canBookSlot, findGroupedSlots, getSeatStatesForSlot } from "./capacity";
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

describe("blocked seats are never displaced by bookings", () => {
  // Regression: a block at seat index 0 with a booking present used to be
  // silently swallowed — the booking claimed index 0, the block applied to
  // nothing, and the slot's second seat came back on sale. A blocked seat
  // must always subtract one usable seat from its own slot, whichever index
  // the booking renders in (mirrors validate_booking_capacity in the DB).
  it("rejects a dog when the block sits at index 0 and a booking holds the slot", () => {
    const result = canBookSlot(
      bookings({ slot: "10:30", size: "small", _dogId: "other" }),
      "10:30",
      "small",
      SALON_SLOTS as never,
      { overrides: { 0: "blocked" } },
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Slot is full");
  });

  it("renders the block at its own index and the booking beside it", () => {
    const states = getSeatStatesForSlot(
      bookings({ slot: "10:30", size: "small", _dogId: "other" }),
      "10:30",
      SALON_SLOTS as never,
      { 0: "blocked" },
    );
    expect(states).toHaveLength(2);
    expect(states[0]).toMatchObject({ type: "blocked", staffBlocked: true, seatIndex: 0 });
    expect(states[1].type).toBe("booking");
    expect(states.filter((s) => s.type === "available")).toHaveLength(0);
  });

  it("expands the row so a block and a full slot can render together", () => {
    // Historical overbook: two bookings + one block must all stay visible.
    const states = getSeatStatesForSlot(
      bookings(
        { slot: "10:30", size: "small", _dogId: "a" },
        { slot: "10:30", size: "small", _dogId: "b" },
      ),
      "10:30",
      SALON_SLOTS as never,
      { 0: "blocked" },
    );
    expect(states).toHaveLength(3);
    expect(states[0]).toMatchObject({ type: "blocked", staffBlocked: true });
    expect(states.filter((s) => s.type === "booking")).toHaveLength(2);
  });

  it("an empty slot with one blocked seat still offers the other", () => {
    const states = getSeatStatesForSlot(
      bookings(),
      "10:30",
      SALON_SLOTS as never,
      { 0: "blocked" },
    );
    expect(states.filter((s) => s.type === "available")).toHaveLength(1);
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
