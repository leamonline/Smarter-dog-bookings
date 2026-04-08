import { LARGE_DOG_SLOTS } from "../constants/index.js";
import type { Booking, DogSize, SlotCapacity, SlotCapacities, SeatState, BookingResult, SlotOverrides, LargeDogSlotRule, SlotAllocation } from "../types/index.js";

// ============================================================
// SEAT CALCULATION
// ============================================================

export function getSeatsNeeded(size: DogSize, slot: string): number {
  if (size === "large") {
    const rule = (LARGE_DOG_SLOTS as Record<string, LargeDogSlotRule>)[slot];
    return rule ? rule.seats : 2;
  }
  return 1;
}

export function getSeatsUsed(bookings: Booking[], slot: string): number {
  return bookings
    .filter((b) => b.slot === slot)
    .reduce((total, b) => total + getSeatsNeeded(b.size, slot), 0);
}

export function getSeatsUsedMap(bookings: Booking[], activeSlots: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const slot of activeSlots) {
    map[slot] = getSeatsUsed(bookings, slot);
  }
  return map;
}

export function hasLargeDog(bookings: Booking[], slot: string): boolean {
  return bookings.some((b) => b.slot === slot && b.size === "large");
}

// ============================================================
// 2-2-1 RULE
// ============================================================

export function getMaxSeatsForSlot(slotIndex: number, seatsMap: Record<string, number>, activeSlots: string[]): number {
  function isDouble(idx: number): boolean {
    if (idx < 0 || idx >= activeSlots.length) return false;
    return (seatsMap[activeSlots[idx]] || 0) >= 2;
  }

  const prevPrev = isDouble(slotIndex - 2);
  const prev = isDouble(slotIndex - 1);
  const next = isDouble(slotIndex + 1);
  const nextNext = isDouble(slotIndex + 2);

  const wouldViolate =
    (prevPrev && prev) || (prev && next) || (next && nextNext);

  return wouldViolate ? 1 : 2;
}

// ============================================================
// EARLY CLOSE DETECTION
//
// Business rule: booking a large dog at 12:00 closes the 1:00
// slot. This is pure engine logic — if the large dog at 12:00
// is cancelled, 1:00 reopens automatically.
// ============================================================

export function isEarlyCloseActive(bookings: Booking[]): boolean {
  return hasLargeDog(bookings, "12:00");
}

// ============================================================
// SLOT CAPACITIES (the main calculation)
// ============================================================

export function computeSlotCapacities(bookings: Booking[], activeSlots: string[]): SlotCapacities {
  const seatsMap = getSeatsUsedMap(bookings, activeSlots);
  const capacities: SlotCapacities = {};
  const earlyClose = isEarlyCloseActive(bookings);
  const largeDogSlots = LARGE_DOG_SLOTS as Record<string, LargeDogSlotRule>;

  for (let i = 0; i < activeSlots.length; i++) {
    const slot = activeSlots[i];
    const used = seatsMap[slot];

    // Start with 2-2-1 max
    let max = getMaxSeatsForSlot(i, seatsMap, activeSlots);

    // Early close: large dog at 12:00 kills 13:00 capacity
    if (slot === "13:00" && earlyClose) {
      max = 0;
    }

    const available = Math.max(0, max - used);
    const isLargeDogSlot = largeDogSlots[slot] !== undefined;
    const hasLarge = hasLargeDog(bookings, slot);
    const largeFills =
      hasLarge && largeDogSlots[slot] && !largeDogSlots[slot].canShare;

    capacities[slot] = {
      used,
      max,
      baseMax: max,
      available: largeFills ? 0 : available,
      bookings: bookings.filter((b) => b.slot === slot),
      isConstrained: max < 2,
      isLargeDogApproved: isLargeDogSlot,
      hasLargeDog: hasLarge,
      isEarlyClosed: slot === "13:00" && earlyClose,
    };
  }

  return capacities;
}

// ============================================================
// SEAT STATES (for UI rendering)
// ============================================================

export function getSeatStatesForSlot(
  bookings: Booking[],
  slot: string,
  activeSlots: string[],
  overrides: SlotOverrides = {},
  selectedSeatIndex: number | null = null,
): SeatState[] {
  const capacities = computeSlotCapacities(bookings, activeSlots);
  const cap = capacities[slot];

  if (!cap) return [];

  const slotBookings = bookings.filter((b) => b.slot === slot);
  const states: SeatState[] = [
    { type: "blocked", seatIndex: 0 },
    { type: "blocked", seatIndex: 1 },
  ];

  let cursor = 0;
  for (const booking of slotBookings) {
    const seatsNeeded = getSeatsNeeded(booking.size, slot);
    while (cursor < 2 && states[cursor].type === "booking") cursor += 1;
    if (cursor >= 2) break;

    states[cursor] = { type: "booking", seatIndex: cursor, booking };

    for (let used = 1; used < seatsNeeded && cursor + used < 2; used++) {
      states[cursor + used] = {
        type: "reserved",
        seatIndex: cursor + used,
        booking,
      };
    }

    cursor += seatsNeeded;
  }

  for (let i = 0; i < 2; i++) {
    if (states[i].type === "booking" || states[i].type === "reserved") continue;

    const override = overrides?.[i];

    if (override === "blocked" && i !== selectedSeatIndex) {
      states[i] = { type: "blocked", seatIndex: i, staffBlocked: true };
      continue;
    }

    if (override === "open") {
      states[i] = { type: "available", seatIndex: i, staffOpened: true };
      continue;
    }

    if (i < cap.max || i === selectedSeatIndex) {
      states[i] = { type: "available", seatIndex: i };
    } else {
      states[i] = {
        type: "blocked",
        seatIndex: i,
        isEarlyClosed: cap.isEarlyClosed || false,
      };
    }
  }

  return states;
}

export function getBookableSeatCount(
  bookings: Booking[],
  slot: string,
  activeSlots: string[],
  overrides: SlotOverrides = {},
  selectedSeatIndex: number | null = null,
): number {
  return getSeatStatesForSlot(
    bookings,
    slot,
    activeSlots,
    overrides,
    selectedSeatIndex,
  ).filter((seat) => seat.type === "available").length;
}

// ============================================================
// BOOKING VALIDATION
//
// All large dog rules consolidated here:
//
// 1. Mid-morning block (10:00-11:30): rejected because
//    LARGE_DOG_SLOTS has no entry for those times.
//
// 2. Start-of-day exception (08:30, 09:00): seats: 1,
//    canShare: true. 09:00 is conditional on 08:30 being
//    empty and 10:00 having ≤1 seats.
//
// 3. 12:00 conditional: large dog allowed only if 13:00
//    is currently empty. Triggers early close on 13:00.
//
// 4. 13:00 early close: blocked if 12:00 already has a
//    large dog.
//
// 5. Back-to-back full-takeover: two adjacent slots both
//    with large dogs at 2 seats each — only permitted at
//    12:30 + 13:00, and only if early close isn't active.
// ============================================================

export function canBookSlot(
  bookings: Booking[],
  slot: string,
  size: DogSize,
  activeSlots: string[],
  options: { overrides?: SlotOverrides; selectedSeatIndex?: number | null } = {},
): BookingResult {
  const { overrides = {}, selectedSeatIndex = null } = options;
  const capacities = computeSlotCapacities(bookings, activeSlots);
  const cap = capacities[slot];
  const largeDogSlots = LARGE_DOG_SLOTS as Record<string, LargeDogSlotRule>;

  if (!cap) return { allowed: false, reason: "Invalid slot" };

  const seatsNeeded = getSeatsNeeded(size, slot);

  if (size === "large") {
    const rule = largeDogSlots[slot];

    // --- Mid-morning block: no LARGE_DOG_SLOTS entry ---
    if (!rule) {
      return {
        allowed: false,
        reason: "Large dogs need Leam's approval for this slot",
        needsApproval: true,
      };
    }

    // --- 09:00 conditional: start-of-day exception ---
    if (rule.conditional && slot === "09:00") {
      const seats830 = getSeatsUsed(bookings, "08:30");
      const seats1000 = getSeatsUsed(bookings, "10:00");
      if (seats830 > 0) {
        return {
          allowed: false,
          reason: "9:00am conditional: 8:30am must be empty",
        };
      }
      if (seats1000 > 1) {
        return {
          allowed: false,
          reason: "9:00am conditional: 10:00am must have 0\u20131 seats",
        };
      }
    }

    // --- 12:00 conditional: 13:00 must be empty ---
    if (slot === "12:00") {
      const seats1300 = getSeatsUsed(bookings, "13:00");
      if (seats1300 > 0) {
        return {
          allowed: false,
          reason: "12:00 large dog requires 1:00pm to be empty (early close)",
        };
      }
    }

    // --- 13:00 early close: blocked if 12:00 has large dog ---
    if (slot === "13:00" && isEarlyCloseActive(bookings)) {
      return {
        allowed: false,
        reason: "1:00pm is closed \u2014 large dog at 12:00 triggered early close",
      };
    }

    // --- Back-to-back full-takeover check ---
    // Only applies to slots where large dogs take 2 seats (canShare: false)
    if (!rule.canShare) {
      const slotIndex = activeSlots.indexOf(slot);

      // Check the slot before this one
      if (slotIndex > 0) {
        const prevSlot = activeSlots[slotIndex - 1];
        const prevRule = largeDogSlots[prevSlot];
        if (prevRule && !prevRule.canShare && hasLargeDog(bookings, prevSlot)) {
          // Two adjacent full-takeover large dog slots
          const pair = [prevSlot, slot].sort();
          if (!(pair[0] === "12:30" && pair[1] === "13:00")) {
            return {
              allowed: false,
              reason: "Back-to-back large dogs only allowed at 12:30 + 1:00pm",
            };
          }
        }
      }

      // Check the slot after this one
      if (slotIndex < activeSlots.length - 1) {
        const nextSlot = activeSlots[slotIndex + 1];
        const nextRule = largeDogSlots[nextSlot];
        if (nextRule && !nextRule.canShare && hasLargeDog(bookings, nextSlot)) {
          const pair = [slot, nextSlot].sort();
          if (!(pair[0] === "12:30" && pair[1] === "13:00")) {
            return {
              allowed: false,
              reason: "Back-to-back large dogs only allowed at 12:30 + 1:00pm",
            };
          }
        }
      }
    }

    // --- Shareable slot: only small/medium can join a large dog ---
    // Business rule: "The remaining seat can only be booked by a
    // small/medium dog — not another large dog."
    if (rule.canShare && hasLargeDog(bookings, slot)) {
      return {
        allowed: false,
        reason: "Only a small/medium dog can share this slot with a large dog",
      };
    }

    // --- Full-takeover slot already has bookings ---
    if (!rule.canShare && cap.used > 0) {
      return {
        allowed: false,
        reason: "Large dog fills this slot \u2014 already has bookings",
      };
    }

    // --- Full-takeover needs 2 seats but 2-2-1 caps at 1 ---
    if (!rule.canShare && seatsNeeded > cap.max) {
      return {
        allowed: false,
        reason: "Not enough capacity (2-2-1 rule)",
      };
    }
  }

  // --- General seat availability check (all sizes) ---
  const availableSeats = getBookableSeatCount(
    bookings,
    slot,
    activeSlots,
    overrides,
    selectedSeatIndex,
  );

  if (availableSeats < seatsNeeded) {
    return {
      allowed: false,
      reason:
        size === "large"
          ? "Not enough capacity (2-2-1 rule)"
          : cap.isEarlyClosed
            ? "1:00pm closed \u2014 early close from 12:00 large dog"
            : cap.isConstrained
              ? "Capped at 1 (2-2-1 rule)"
              : "Slot is full",
    };
  }

  // --- Small/medium blocked by full-takeover large dog ---
  if (size !== "large" && cap.hasLargeDog) {
    const rule = largeDogSlots[slot];
    if (rule && !rule.canShare) {
      return { allowed: false, reason: "Large dog fills this slot" };
    }
  }

  return { allowed: true };
}

// ============================================================
// MULTI-DOG SLOT GROUPING
// ============================================================

function makeTempBooking(dog: { id: string; size: DogSize }, slot: string): Booking {
  return {
    id: `temp-${dog.id}`,
    slot,
    size: dog.size,
    dogName: "",
    breed: "",
    service: "full-groom" as any,
    owner: "",
    status: "No-show" as any,
    addons: [],
    pickupBy: "",
    payment: "",
    confirmed: false,
    _dogId: dog.id,
    _ownerId: null,
    _pickupById: null,
    _bookingDate: "",
  };
}

function trySlotSplit(
  dogs: Array<{ id: string; size: DogSize }>,
  indicesA: number[],
  indicesB: number[],
  slotA: string,
  slotB: string,
  bookings: Booking[],
  activeSlots: string[],
): SlotAllocation | null {
  let simulated = [...bookings];
  const assignments: Array<{ dogId: string; slot: string }> = [];

  // Place dogs assigned to slotA
  for (const idx of indicesA) {
    const dog = dogs[idx];
    const result = canBookSlot(simulated, slotA, dog.size, activeSlots);
    if (!result.allowed) return null;
    simulated = [...simulated, makeTempBooking(dog, slotA)];
    assignments.push({ dogId: dog.id, slot: slotA });
  }

  // Place dogs assigned to slotB
  for (const idx of indicesB) {
    const dog = dogs[idx];
    const result = canBookSlot(simulated, slotB, dog.size, activeSlots);
    if (!result.allowed) return null;
    simulated = [...simulated, makeTempBooking(dog, slotB)];
    assignments.push({ dogId: dog.id, slot: slotB });
  }

  // Drop-off time is the earlier slot (earlier in activeSlots order)
  const idxA = activeSlots.indexOf(slotA);
  const idxB = activeSlots.indexOf(slotB);
  const dropOffTime = idxA <= idxB ? slotA : slotB;

  return {
    dropOffTime,
    assignments,
    groupId: crypto.randomUUID(),
  };
}

export function findGroupedSlots(
  dogs: Array<{ id: string; size: DogSize }>,
  bookings: Booking[],
  activeSlots: string[],
): SlotAllocation[] {
  const count = dogs.length;

  // Out of range
  if (count === 0 || count > 4) return [];

  const results: SlotAllocation[] = [];
  const seenDropOffs = new Set<string>();

  function addResult(allocation: SlotAllocation | null) {
    if (!allocation) return;
    if (seenDropOffs.has(allocation.dropOffTime)) return;
    seenDropOffs.add(allocation.dropOffTime);
    results.push(allocation);
  }

  if (count === 1) {
    for (const slot of activeSlots) {
      const dog = dogs[0];
      const result = canBookSlot(bookings, slot, dog.size, activeSlots);
      if (result.allowed) {
        addResult({
          dropOffTime: slot,
          assignments: [{ dogId: dog.id, slot }],
          groupId: crypto.randomUUID(),
        });
      }
    }
    return results;
  }

  if (count === 2) {
    for (const slot of activeSlots) {
      // Simulate placing dog[0] then dog[1] in the same slot
      const r0 = canBookSlot(bookings, slot, dogs[0].size, activeSlots);
      if (!r0.allowed) continue;
      const simulated = [...bookings, makeTempBooking(dogs[0], slot)];
      const r1 = canBookSlot(simulated, slot, dogs[1].size, activeSlots);
      if (!r1.allowed) continue;
      addResult({
        dropOffTime: slot,
        assignments: [
          { dogId: dogs[0].id, slot },
          { dogId: dogs[1].id, slot },
        ],
        groupId: crypto.randomUUID(),
      });
    }
    return results;
  }

  if (count === 3) {
    for (let i = 0; i < activeSlots.length - 1; i++) {
      const slotA = activeSlots[i];
      const slotB = activeSlots[i + 1];

      // Try 2 in slotA, 1 in slotB
      addResult(trySlotSplit(dogs, [0, 1], [2], slotA, slotB, bookings, activeSlots));
      // Try 1 in slotA, 2 in slotB
      addResult(trySlotSplit(dogs, [0], [1, 2], slotA, slotB, bookings, activeSlots));
    }
    return results;
  }

  // count === 4
  for (let i = 0; i < activeSlots.length - 1; i++) {
    const slotA = activeSlots[i];
    const slotB = activeSlots[i + 1];

    // Try 2 in slotA, 2 in slotB
    addResult(trySlotSplit(dogs, [0, 1], [2, 3], slotA, slotB, bookings, activeSlots));
  }
  return results;
}
