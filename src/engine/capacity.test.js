/**
 * Capacity Engine Tests
 *
 * Run: npx vitest run src/engine/capacity.test.js
 *
 * Tests cover:
 * 1. Basic 2-2-1 rule
 * 2. Start-of-day exception (08:30, 09:00)
 * 3. 12:00 large dog sharing + early close
 * 4. Back-to-back large dogs (12:30 + 13:00 only)
 * 5. Mid-morning block
 * 6. Edge cases and interactions
 */

import { describe, it, expect } from "vitest";

import {
  getSeatsNeeded,
  getSeatsUsed,
  hasLargeDog,
  getMaxSeatsForSlot,
  isEarlyCloseActive,
  computeSlotCapacities,
  canBookSlot,
  getBookableSeatCount,
  findGroupedSlots,
} from "./capacity.js";

const SLOTS = [
  "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00",
];

// Helper: create a booking
function b(slot, size = "small", id = null) {
  return {
    id: id || Date.now() + Math.random(),
    slot,
    size,
    dogName: "Test",
    breed: "Test",
    service: "full-groom",
    owner: "Test",
  };
}

// Helper: create a list of dogs by size
function dogs(sizes) {
  return sizes.map((size, i) => ({ id: `dog-${i}`, size }));
}

// ============================================================
// 1. SEATS NEEDED
// ============================================================
describe("Seats Needed", () => {
  it("Small dog = 1 seat", () => {
    expect(getSeatsNeeded("small", "08:30")).toBe(1);
  });

  it("Medium dog = 1 seat", () => {
    expect(getSeatsNeeded("medium", "09:00")).toBe(1);
  });

  it("Large dog at 08:30 = 1 seat (start-of-day)", () => {
    expect(getSeatsNeeded("large", "08:30")).toBe(1);
  });

  it("Large dog at 09:00 = 1 seat (start-of-day)", () => {
    expect(getSeatsNeeded("large", "09:00")).toBe(1);
  });

  it("Large dog at 12:00 = 1 seat (shareable)", () => {
    expect(getSeatsNeeded("large", "12:00")).toBe(1);
  });

  it("Large dog at 12:30 = 2 seats (full takeover)", () => {
    expect(getSeatsNeeded("large", "12:30")).toBe(2);
  });

  it("Large dog at 13:00 = 2 seats (full takeover)", () => {
    expect(getSeatsNeeded("large", "13:00")).toBe(2);
  });

  it("Large dog at 10:00 = 2 seats (no LARGE_DOG_SLOTS entry)", () => {
    expect(getSeatsNeeded("large", "10:00")).toBe(2);
  });
});

// ============================================================
// 2. BASIC 2-2-1 RULE
// ============================================================
describe("2-2-1 Rule", () => {
  it("After two doubles, next caps at 1 and is constrained", () => {
    const bookings = [
      b("08:30"), b("08:30"),
      b("09:00"), b("09:00"),
    ];
    const caps = computeSlotCapacities(bookings, SLOTS);
    expect(caps["09:30"].max).toBe(1);
    expect(caps["09:30"].isConstrained).toBe(true);
  });

  it("Empty slot resets the 2-2-1 chain", () => {
    const bookings = [
      b("08:30"), b("08:30"),
      b("09:00"), b("09:00"),
      // 09:30 empty
      b("10:00"), b("10:00"),
      b("10:30"), b("10:30"),
    ];
    const caps = computeSlotCapacities(bookings, SLOTS);
    expect(caps["09:30"].max).toBe(1);
    expect(caps["11:00"].max).toBe(1);
  });

  it("Bidirectional: slot before two doubles caps at 1", () => {
    const bookings = [
      b("09:00"), b("09:00"),
      b("09:30"), b("09:30"),
    ];
    const caps = computeSlotCapacities(bookings, SLOTS);
    expect(caps["08:30"].max).toBe(1);
  });

  it("Slot between doubles on both sides is capped at 1 with 0 available", () => {
    const bookings = [
      b("08:30"), b("08:30"),
      b("09:00"),
      b("09:30"), b("09:30"),
      b("10:00"), b("10:00"),
    ];
    const caps = computeSlotCapacities(bookings, SLOTS);
    expect(caps["09:00"].max).toBe(1);
    expect(caps["09:00"].available).toBe(0);
    expect(caps["10:30"].max).toBe(1);
  });
});

// ============================================================
// 3. EARLY CLOSE
// ============================================================
describe("Early Close (12:00 large dog closes 13:00)", () => {
  it("Early close active when 12:00 has large dog", () => {
    const bookings = [b("12:00", "large")];
    expect(isEarlyCloseActive(bookings)).toBe(true);
    const caps = computeSlotCapacities(bookings, SLOTS);
    expect(caps["13:00"].max).toBe(0);
    expect(caps["13:00"].available).toBe(0);
    expect(caps["13:00"].isEarlyClosed).toBe(true);
  });

  it("No early close when 12:00 has small dog", () => {
    const bookings = [b("12:00", "small")];
    expect(isEarlyCloseActive(bookings)).toBe(false);
    const caps = computeSlotCapacities(bookings, SLOTS);
    expect(caps["13:00"].max).toBe(2);
  });

  it("13:00 still closed with 12:00 large + 12:30 large", () => {
    const bookings = [b("12:00", "large"), b("12:30", "large")];
    const caps = computeSlotCapacities(bookings, SLOTS);
    expect(caps["13:00"].max).toBe(0);
    expect(caps["12:30"].used).toBe(2);
  });

  it("No early close with two small/medium at 12:00", () => {
    const bookings = [b("12:00", "small"), b("12:00", "medium")];
    expect(isEarlyCloseActive(bookings)).toBe(false);
  });
});

// ============================================================
// 4. 12:00 LARGE DOG CONDITIONAL
// ============================================================
describe("12:00 Large Dog Conditional (13:00 must be empty)", () => {
  it("Large dog at 12:00 allowed when 13:00 is empty", () => {
    const bookings = [];
    const result = canBookSlot(bookings, "12:00", "large", SLOTS);
    expect(result.allowed).toBe(true);
  });

  it("Large dog at 12:00 blocked when 13:00 has bookings", () => {
    const bookings = [b("13:00", "small")];
    const result = canBookSlot(bookings, "12:00", "large", SLOTS);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("early close");
  });

  it("Large dog at 12:00 blocked when 13:00 has large dog", () => {
    const bookings = [b("13:00", "large")];
    const result = canBookSlot(bookings, "12:00", "large", SLOTS);
    expect(result.allowed).toBe(false);
  });

  it("Small dog can share 12:00 with large dog", () => {
    const bookings = [b("12:00", "large")];
    const result = canBookSlot(bookings, "12:00", "small", SLOTS);
    expect(result.allowed).toBe(true);
  });

  it("12:00 full with large + small", () => {
    const bookings = [b("12:00", "large"), b("12:00", "small")];
    const result = canBookSlot(bookings, "12:00", "small", SLOTS);
    expect(result.allowed).toBe(false);
  });
});

// ============================================================
// 5. 13:00 EARLY CLOSE CHECK
// ============================================================
describe("13:00 Blocked by Early Close", () => {
  it("All sizes blocked at 13:00 by early close", () => {
    const bookings = [b("12:00", "large")];
    const resultSmall = canBookSlot(bookings, "13:00", "small", SLOTS);
    expect(resultSmall.allowed).toBe(false);
    const resultLarge = canBookSlot(bookings, "13:00", "large", SLOTS);
    expect(resultLarge.allowed).toBe(false);
  });

  it("13:00 open when 12:00 has only small dogs", () => {
    const bookings = [b("12:00", "small")];
    const result = canBookSlot(bookings, "13:00", "small", SLOTS);
    expect(result.allowed).toBe(true);
  });
});

// ============================================================
// 6. BACK-TO-BACK LARGE DOGS
// ============================================================
describe("Back-to-Back Large Dogs", () => {
  it("Back-to-back large at 12:30 + 13:00 allowed", () => {
    const bookings = [b("12:30", "large")];
    const result = canBookSlot(bookings, "13:00", "large", SLOTS);
    expect(result.allowed).toBe(true);
  });

  it("Back-to-back large at 12:30 + 13:00 allowed (reverse order)", () => {
    const bookings = [b("13:00", "large")];
    const result = canBookSlot(bookings, "12:30", "large", SLOTS);
    expect(result.allowed).toBe(true);
  });

  it("Back-to-back at 12:30+13:00 blocked by early close", () => {
    const bookings = [b("12:00", "large"), b("12:30", "large")];
    const result = canBookSlot(bookings, "13:00", "large", SLOTS);
    expect(result.allowed).toBe(false);
  });
});

// ============================================================
// 7. START-OF-DAY EXCEPTION
// ============================================================
describe("Start-of-Day Exception (08:30, 09:00)", () => {
  it("Large dog at 08:30 allowed", () => {
    const bookings = [];
    const result = canBookSlot(bookings, "08:30", "large", SLOTS);
    expect(result.allowed).toBe(true);
  });

  it("Small dog can share 08:30 with large dog", () => {
    const bookings = [b("08:30", "large")];
    const result = canBookSlot(bookings, "08:30", "small", SLOTS);
    expect(result.allowed).toBe(true);
  });

  it("Second large dog can't share 08:30 with first large", () => {
    const bookings = [b("08:30", "large")];
    const result = canBookSlot(bookings, "08:30", "large", SLOTS);
    expect(result.allowed).toBe(false);
  });

  it("Second large dog can't share 12:00 with first large", () => {
    const bookings = [b("12:00", "large")];
    const result = canBookSlot(bookings, "12:00", "large", SLOTS);
    expect(result.allowed).toBe(false);
  });

  it("09:00 large blocked when 08:30 has bookings", () => {
    const bookings = [b("08:30", "small")];
    const result = canBookSlot(bookings, "09:00", "large", SLOTS);
    expect(result.allowed).toBe(false);
  });

  it("09:00 large allowed when 08:30 empty and 10:00 has 1", () => {
    const bookings = [b("10:00", "small")];
    const result = canBookSlot(bookings, "09:00", "large", SLOTS);
    expect(result.allowed).toBe(true);
  });

  it("09:00 large blocked when 10:00 has 2 seats", () => {
    const bookings = [b("10:00", "small"), b("10:00", "small")];
    const result = canBookSlot(bookings, "09:00", "large", SLOTS);
    expect(result.allowed).toBe(false);
  });
});

// ============================================================
// 8. MID-MORNING BLOCK
// ============================================================
describe("Mid-Morning Block (10:00 - 11:30)", () => {
  it.each(["10:00", "10:30", "11:00", "11:30"])("Large dog blocked at %s with needsApproval flag", (slot) => {
    const result = canBookSlot([], slot, "large", SLOTS);
    expect(result.allowed).toBe(false);
    expect(result.needsApproval).toBe(true);
  });

  it("Small dog at 10:00 allowed", () => {
    const result = canBookSlot([], "10:00", "small", SLOTS);
    expect(result.allowed).toBe(true);
  });
});

// ============================================================
// 9. FULL-TAKEOVER SLOT RULES (12:30, 13:00)
// ============================================================
describe("Full-Takeover Slots (12:30, 13:00)", () => {
  it("Large at 12:30 uses 2 seats with 0 available", () => {
    const bookings = [b("12:30", "large")];
    const caps = computeSlotCapacities(bookings, SLOTS);
    expect(caps["12:30"].used).toBe(2);
    expect(caps["12:30"].available).toBe(0);
  });

  it("Small dog can't share 12:30 with large (canShare: false)", () => {
    const bookings = [b("12:30", "large")];
    const result = canBookSlot(bookings, "12:30", "small", SLOTS);
    expect(result.allowed).toBe(false);
  });

  it("Large dog at 13:00 allowed when slot empty", () => {
    const bookings = [];
    const result = canBookSlot(bookings, "13:00", "large", SLOTS);
    expect(result.allowed).toBe(true);
  });

  it("Large at 12:30 blocked when slot has bookings", () => {
    const bookings = [b("12:30", "small")];
    const result = canBookSlot(bookings, "12:30", "large", SLOTS);
    expect(result.allowed).toBe(false);
  });
});

// ============================================================
// 10. COMBINED SCENARIOS
// ============================================================
describe("Combined Scenarios", () => {
  it("Realistic busy day capacities", () => {
    const bookings = [
      b("08:30"), b("08:30"),
      b("09:00"), b("09:00"),
      b("09:30"),
      b("10:00"), b("10:00"),
      b("10:30"), b("10:30"),
      b("12:00", "large"),
    ];
    const caps = computeSlotCapacities(bookings, SLOTS);

    expect(caps["09:30"].max).toBe(1);
    expect(caps["11:00"].max).toBe(1);
    expect(caps["12:00"].used).toBe(1);
    expect(caps["12:00"].available).toBe(1);
    expect(caps["13:00"].max).toBe(0);
    expect(caps["12:30"].max).toBe(2);
  });

  it("Large at 12:30 allowed with 12:00 large+small", () => {
    const bookings = [
      b("12:00", "large"),
      b("12:00", "small"),
    ];
    const result = canBookSlot(bookings, "12:30", "large", SLOTS);
    expect(result.allowed).toBe(true);
  });

  it("Full afternoon scenario: 12:00 large+small, 12:30 large", () => {
    const bookings = [
      b("12:00", "large"),
      b("12:00", "small"),
      b("12:30", "large"),
    ];
    const caps = computeSlotCapacities(bookings, SLOTS);
    expect(caps["13:00"].max).toBe(0);
    expect(caps["12:30"].available).toBe(0);
    expect(caps["12:00"].available).toBe(0);
  });

  it("Small at 13:00 allowed without early close", () => {
    const bookings = [b("12:00", "small")];
    const result = canBookSlot(bookings, "13:00", "small", SLOTS);
    expect(result.allowed).toBe(true);
  });
});

// ============================================================
// 10B. DUPLICATE DOG IN SAME SLOT
// ============================================================
describe("Duplicate Dog Prevention", () => {
  it("Rejects same dog booked twice in same slot", () => {
    const bookings = [{ ...b("09:00", "small"), _dogId: "dog-123" }];
    const result = canBookSlot(bookings, "09:00", "small", SLOTS, {
      dogId: "dog-123",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/already booked/i);
  });

  it("Allows same dog in a different slot", () => {
    const bookings = [{ ...b("09:00", "small"), _dogId: "dog-123" }];
    const result = canBookSlot(bookings, "10:00", "small", SLOTS, {
      dogId: "dog-123",
    });
    expect(result.allowed).toBe(true);
  });

  it("Allows a different dog in the same slot", () => {
    const bookings = [{ ...b("09:00", "small"), _dogId: "dog-123" }];
    const result = canBookSlot(bookings, "09:00", "small", SLOTS, {
      dogId: "dog-456",
    });
    expect(result.allowed).toBe(true);
  });

  it("Skips duplicate check when dogId not provided (backwards compatible)", () => {
    const bookings = [{ ...b("09:00", "small"), _dogId: "dog-123" }];
    const result = canBookSlot(bookings, "09:00", "small", SLOTS);
    expect(result.allowed).toBe(true);
  });

  it("Ignores bookings with missing _dogId", () => {
    const bookings = [b("09:00", "small")];
    const result = canBookSlot(bookings, "09:00", "small", SLOTS, {
      dogId: "dog-123",
    });
    expect(result.allowed).toBe(true);
  });
});

// ============================================================
// 10C. CALLER INTEGRATION PATTERNS
//
// Exercises the patterns used by callers of canBookSlot across
// the codebase: find-first-available (useRebookFlow,
// WeekCalendarView), filter-available-slots (RescheduleModal,
// TimeSlotPicker, ChainBookingModal), and reject-on-save
// (useBookingSave, BookingDetailModal).
// ============================================================
describe("Caller integration patterns", () => {
  it("find-first-available skips the dog's existing slot (useRebookFlow / WeekCalendarView pattern)", () => {
    // 08:30 is full, 09:00 has the dog, 09:30 onwards capped by 2-2-1 after 08:30+09:00 doubles.
    // 10:00 is the first slot with real capacity after walking.
    const bookings = [
      { ...b("08:30", "small"), _dogId: "dog-a" },
      { ...b("08:30", "small"), _dogId: "dog-b" },
      { ...b("09:00", "small"), _dogId: "bella" },
    ];

    const pick = (dogId) =>
      SLOTS.find(
        (slot) =>
          canBookSlot(bookings, slot, "small", SLOTS, { dogId }).allowed,
      );

    // Without dogId, 09:00 looks bookable (1 free seat) and is picked first.
    expect(pick(undefined)).toBe("09:00");
    // With Bella's dogId, 09:00 is skipped → fall through to 09:30.
    expect(pick("bella")).toBe("09:30");
  });

  it("filter-available-slots hides the dog's existing slot (RescheduleModal / TimeSlotPicker pattern)", () => {
    const bookings = [{ ...b("10:00", "small"), _dogId: "bella" }];

    const availableFor = (dogId) =>
      SLOTS.filter(
        (slot) =>
          canBookSlot(bookings, slot, "small", SLOTS, { dogId }).allowed,
      );

    const withoutFilter = availableFor(undefined);
    const withFilter = availableFor("bella");

    expect(withoutFilter).toContain("10:00");
    expect(withFilter).not.toContain("10:00");
  });

  it("reject-on-save fires when dog has another booking in target slot (useBookingSave / BookingDetailModal pattern)", () => {
    // Simulate the "otherBookings excludes the edit target" convention:
    // the edit target (id=edit-me) is filtered out, but Bella also has a
    // separate booking at 12:30 — moving the edit target to 12:30 must be
    // rejected.
    const allBookings = [
      { ...b("09:00", "small"), id: "edit-me", _dogId: "bella" },
      { ...b("12:30", "small"), id: "other", _dogId: "bella" },
    ];
    const otherBookings = allBookings.filter((x) => x.id !== "edit-me");

    const result = canBookSlot(otherBookings, "12:30", "small", SLOTS, {
      dogId: "bella",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/already booked/i);
  });

  it("simulated-booking flow catches within-batch duplicates (NewBookingModal pattern)", () => {
    // NewBookingModal iterates dogEntries and appends simulated bookings.
    // If the second entry is the same dog, the dogId check on the second
    // iteration must fire.
    let simulated = [];
    const entries = [
      { dog: { id: "bella", size: "small" } },
      { dog: { id: "bella", size: "small" } },
    ];

    const failures = [];
    for (const entry of entries) {
      const check = canBookSlot(simulated, "12:30", entry.dog.size, SLOTS, {
        dogId: entry.dog.id,
      });
      if (!check.allowed) {
        failures.push(check.reason);
        break;
      }
      simulated = [
        ...simulated,
        { slot: "12:30", size: entry.dog.size, _dogId: entry.dog.id },
      ];
    }

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/already booked/i);
  });
});

// ============================================================
// 11. STAFF OVERRIDES
// ============================================================
describe("Staff Overrides", () => {
  it("Staff-blocked seat reduces available by 1", () => {
    const bookings = [];
    const overrides = { 0: "blocked" };
    const count = getBookableSeatCount(bookings, "10:00", SLOTS, overrides);
    expect(count).toBe(1);
  });

  it("Staff-opened seat overrides 2-2-1 cap", () => {
    const bookings = [
      b("08:30"), b("08:30"),
      b("09:00"), b("09:00"),
    ];
    const overrides = { 1: "open" };
    const count = getBookableSeatCount(bookings, "09:30", SLOTS, overrides);
    expect(count).toBe(2);
  });
});

// ============================================================
// 12. EARLY CLOSE + 2-2-1 INTERACTION
// ============================================================
describe("Early Close + 2-2-1 Interaction", () => {
  it("Early close overrides 2-2-1 for 13:00", () => {
    const bookings = [b("12:00", "large")];
    const caps = computeSlotCapacities(bookings, SLOTS);
    expect(caps["13:00"].max).toBe(0);
  });

  it("13:00 max = 0 despite 12:30 double (early close)", () => {
    const bookings = [
      b("12:00", "large"),
      b("12:30", "small"), b("12:30", "small"),
    ];
    const caps = computeSlotCapacities(bookings, SLOTS);
    expect(caps["13:00"].max).toBe(0);
  });
});

// ============================================================
// 13. MULTI-DOG SLOT GROUPING
// ============================================================
describe("Multi-Dog Slot Grouping", () => {
  it("1 small dog finds available slots with correct assignment", () => {
    const result = findGroupedSlots(dogs(["small"]), [], SLOTS);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].assignments.length).toBe(1);
    expect(result[0].dropOffTime).toBe(result[0].assignments[0].slot);
  });

  it("2 small dogs placed in same slot", () => {
    const result = findGroupedSlots(dogs(["small", "small"]), [], SLOTS);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].assignments.length).toBe(2);
    expect(result[0].assignments[0].slot).toBe(result[0].assignments[1].slot);
  });

  it("3 small dogs spread across 2 slots", () => {
    const result = findGroupedSlots(dogs(["small", "small", "small"]), [], SLOTS);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].assignments.length).toBe(3);
    const uniqueSlots = [...new Set(result[0].assignments.map(a => a.slot))];
    expect(uniqueSlots.length).toBe(2);
  });

  it("4 small dogs spread across 2 slots", () => {
    const result = findGroupedSlots(dogs(["small", "small", "small", "small"]), [], SLOTS);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].assignments.length).toBe(4);
    const uniqueSlots = [...new Set(result[0].assignments.map(a => a.slot))];
    expect(uniqueSlots.length).toBe(2);
  });

  it("Full day returns no slots", () => {
    const fullBookings = SLOTS.flatMap(slot => [b(slot, "small"), b(slot, "small")]);
    const result = findGroupedSlots(dogs(["small"]), fullBookings, SLOTS);
    expect(result.length).toBe(0);
  });

  it("Drop-off is the earlier slot", () => {
    const result = findGroupedSlots(dogs(["small", "small", "small"]), [], SLOTS);
    if (result.length > 0) {
      const assignedSlots = result[0].assignments.map(a => a.slot).sort();
      expect(result[0].dropOffTime).toBe(assignedSlots[0]);
    }
  });

  it("0 dogs returns empty", () => {
    expect(findGroupedSlots([], [], SLOTS).length).toBe(0);
  });

  it("5 dogs returns empty", () => {
    expect(findGroupedSlots(dogs(["small", "small", "small", "small", "small"]), [], SLOTS).length).toBe(0);
  });

  it("selected dog order does not change grouped slot availability", () => {
    const compactSlots = ["12:30", "13:00"];
    const orderA = findGroupedSlots(dogs(["small", "large", "small"]), [], compactSlots);
    const orderB = findGroupedSlots(dogs(["small", "small", "large"]), [], compactSlots);

    expect(orderA.map((allocation) => allocation.dropOffTime).sort()).toEqual(
      orderB.map((allocation) => allocation.dropOffTime).sort(),
    );
    expect(orderA.length).toBeGreaterThan(0);
    expect(orderB.length).toBeGreaterThan(0);
  });
});
