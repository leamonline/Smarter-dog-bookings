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
    _groupId: null,
  };
}

const DOG_SIZE_PRIORITY: Record<DogSize, number> = {
  large: 2,
  medium: 1,
  small: 0,
};

function searchAllocationsForSlots(
  dogs: Array<{ id: string; size: DogSize }>,
  bookings: Booking[],
  activeSlots: string[],
  targetSlots: string[],
): SlotAllocation[] {
  const results: SlotAllocation[] = [];
  const seen = new Set<string>();
  const slotIndex = (slot: string) => activeSlots.indexOf(slot);
  const orderedDogs = [...dogs].sort(
    (a, b) =>
      DOG_SIZE_PRIORITY[b.size] - DOG_SIZE_PRIORITY[a.size] ||
      a.id.localeCompare(b.id),
  );

  function addResult(assignments: Array<{ dogId: string; slot: string }>) {
    const normalizedAssignments = [...assignments].sort((a, b) => {
      const slotDiff = slotIndex(a.slot) - slotIndex(b.slot);
      if (slotDiff !== 0) return slotDiff;
      return a.dogId.localeCompare(b.dogId);
    });

    const dropOffIndex = normalizedAssignments.reduce(
      (lowest, assignment) => Math.min(lowest, slotIndex(assignment.slot)),
      activeSlots.length,
    );

    if (dropOffIndex < 0 || dropOffIndex >= activeSlots.length) return;

    const dropOffTime = activeSlots[dropOffIndex];
    const signature = normalizedAssignments
      .map((assignment) => `${assignment.dogId}:${assignment.slot}`)
      .join("|");
    const key = `${dropOffTime}::${signature}`;

    if (seen.has(key)) return;
    seen.add(key);

    results.push({
      dropOffTime,
      assignments: normalizedAssignments,
      groupId: crypto.randomUUID(),
    });
  }

  function dfs(
    remainingDogs: Array<{ id: string; size: DogSize }>,
    simulatedBookings: Booking[],
    assignments: Array<{ dogId: string; slot: string }>,
  ) {
    if (remainingDogs.length === 0) {
      addResult(assignments);
      return;
    }

    for (let i = 0; i < remainingDogs.length; i++) {
      const dog = remainingDogs[i];

      for (const slot of targetSlots) {
        const result = canBookSlot(simulatedBookings, slot, dog.size, activeSlots);
        if (!result.allowed) continue;

        const nextRemaining = [
          ...remainingDogs.slice(0, i),
          ...remainingDogs.slice(i + 1),
        ];

        dfs(
          nextRemaining,
          [...simulatedBookings, makeTempBooking(dog, slot)],
          [...assignments, { dogId: dog.id, slot }],
        );
      }
    }
  }

  dfs(orderedDogs, [...bookings], []);
  return results;
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

  function addResults(allocations: SlotAllocation[]) {
    for (const allocation of allocations) {
      if (seenDropOffs.has(allocation.dropOffTime)) continue;
      seenDropOffs.add(allocation.dropOffTime);
      results.push(allocation);
    }
  }

  for (const slot of activeSlots) {
    addResults(searchAllocationsForSlots(dogs, bookings, activeSlots, [slot]));
  }

  for (let i = 0; i < activeSlots.length - 1; i++) {
    addResults(
      searchAllocationsForSlots(
        dogs,
        bookings,
        activeSlots,
        [activeSlots[i], activeSlots[i + 1]],
      ),
    );
  }

  return results;
}
