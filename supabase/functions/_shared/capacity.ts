// ============================================================
// supabase/functions/_shared/capacity.ts
//
// 2-2-1 seat engine — a BEHAVIOURAL MIRROR of src/engine/capacity.ts.
// The Supabase Edge (Deno) runtime can't import the Vite frontend's
// src/engine/capacity.ts (its barrel imports pull in browser code), so the
// group-fitting logic the WhatsApp Flow needs is duplicated here, exactly
// like _shared/salonConstants.ts mirrors src/constants/salon.ts.
//
// The control flow of every function below is copied verbatim from the
// source so findGroupedSlots() returns the same allocations. The only
// deliberate change is the local type definitions (the source imports them
// from src/types/index) and a slimmed makeTempBooking() that sets just the
// fields the engine actually reads (slot, size, _dogId, status) — the engine
// never reads the other ~20 Booking fields. A parity test
// (src/lib/whatsapp/capacityParity.test.ts) guards against drift.
//
// The DB capacity + calendar triggers remain the hard guard on every insert;
// this engine only decides which drop-off times to OFFER and how to assign
// each dog to a slot.
// ============================================================

import {
  LARGE_DOG_SLOTS,
  BOOKING_STATUS,
  DOG_SIZE,
  DAILY_DOG_CAP,
  type DogSize,
  type LargeDogSlotRule,
} from "./salonConstants.ts";

// ── Local type mirror (subset of src/types/index the engine touches) ──
export interface Booking {
  slot: string;
  size: DogSize;
  status?: string;
  // Internal dog id — used by canBookSlot's "same dog already in slot" guard.
  _dogId?: string | null;
}

export interface SlotCapacity {
  used: number;
  max: number;
  baseMax: number;
  available: number;
  bookings: Booking[];
  isConstrained: boolean;
  isLargeDogApproved: boolean;
  hasLargeDog: boolean;
  isEarlyClosed: boolean;
}

export type SlotCapacities = Record<string, SlotCapacity>;

export type SlotOverrides = Record<number, "blocked" | "open">;

export interface SeatState {
  type: "available" | "blocked" | "booking" | "reserved";
  seatIndex: number;
  booking?: Booking;
  staffBlocked?: boolean;
  staffOpened?: boolean;
  isEarlyClosed?: boolean;
}

export interface BookingResult {
  allowed: boolean;
  reason?: string;
  needsApproval?: boolean;
}

export interface SlotAllocation {
  dropOffTime: string;
  assignments: Array<{ dogId: string; slot: string }>;
  groupId: string;
}

// ============================================================
// SEAT CALCULATION
// ============================================================

export function getSeatsNeeded(size: DogSize, slot: string): number {
  if (size === DOG_SIZE.LARGE) {
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
  return bookings.some((b) => b.slot === slot && b.size === DOG_SIZE.LARGE);
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
// SEAT STATES
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

  // Staff-blocked seat indexes (the two physical seats only — junk indexes
  // in legacy data are ignored). A blocked seat always removes one usable
  // seat from THIS slot: bookings claim the remaining indexes rather than
  // landing on a blocked one and silently displacing the block. MIRRORS
  // src/engine/capacity.ts and the blocked-seat subtraction in
  // validate_booking_capacity (DB).
  const blockedIdx = new Set<number>();
  for (const key of [0, 1]) {
    if (overrides?.[key] === "blocked" && key !== selectedSeatIndex) blockedIdx.add(key);
  }

  const totalSeats = Math.max(2, slotBookings.length + blockedIdx.size);

  const states: SeatState[] = [];
  for (let i = 0; i < totalSeats; i++) {
    states.push({ type: "blocked", seatIndex: i });
  }

  let cursor = 0;
  for (const booking of slotBookings) {
    const seatsNeeded = getSeatsNeeded(booking.size, slot);
    while (
      cursor < totalSeats &&
      (states[cursor].type === "booking" ||
        states[cursor].type === "reserved" ||
        blockedIdx.has(cursor))
    ) {
      cursor += 1;
    }
    if (cursor >= totalSeats) break;

    states[cursor] = { type: "booking", seatIndex: cursor, booking };

    for (let used = 1, j = cursor + 1; used < seatsNeeded && j < totalSeats; j++) {
      if (blockedIdx.has(j)) continue;
      states[j] = { type: "reserved", seatIndex: j, booking };
      used += 1;
    }

    cursor += 1;
  }

  for (let i = 0; i < totalSeats; i++) {
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
// ============================================================

type StaffOverride =
  | boolean
  | { approval?: boolean; capacity?: boolean };

function resolveStaffOverride(raw: StaffOverride): { approval: boolean; capacity: boolean } {
  if (typeof raw === "boolean") return { approval: raw, capacity: false };
  return { approval: raw.approval ?? false, capacity: raw.capacity ?? false };
}

export function canBookSlot(
  bookings: Booking[],
  slot: string,
  size: DogSize,
  activeSlots: string[],
  options: {
    overrides?: SlotOverrides;
    selectedSeatIndex?: number | null;
    dogId?: string | null;
    staffOverride?: StaffOverride;
  } = {},
): BookingResult {
  const {
    overrides = {},
    selectedSeatIndex = null,
    dogId = null,
    staffOverride: rawOverride = false,
  } = options;
  const override = resolveStaffOverride(rawOverride);

  const capacities = computeSlotCapacities(bookings, activeSlots);
  const cap = capacities[slot];
  const largeDogSlots = LARGE_DOG_SLOTS as Record<string, LargeDogSlotRule>;

  if (!cap) return { allowed: false, reason: "Invalid slot" };

  if (dogId && bookings.some((b) => b.slot === slot && b._dogId === dogId)) {
    return {
      allowed: false,
      reason: "This dog is already booked in this slot",
    };
  }

  const seatsNeeded = getSeatsNeeded(size, slot);

  if (size === DOG_SIZE.LARGE) {
    const rule = largeDogSlots[slot];

    // --- Mid-morning block: no LARGE_DOG_SLOTS entry ---
    if (!rule) {
      if (!override.approval) {
        return {
          allowed: false,
          reason: "Needs manager approval for this slot",
          needsApproval: true,
        };
      }
    } else {
      // --- 09:00 conditional ---
      if (rule.conditional && slot === "09:00") {
        const seats830 = getSeatsUsed(bookings, "08:30");
        const seats1000 = getSeatsUsed(bookings, "10:00");
        if (seats830 > 0 && !override.capacity) {
          return {
            allowed: false,
            reason: "9:00am conditional: 8:30am must be empty",
          };
        }
        if (seats1000 > 1 && !override.capacity) {
          return {
            allowed: false,
            reason: "9:00am conditional: 10:00am must have 0–1 seats",
          };
        }
      }

      // --- 12:00 conditional ---
      if (slot === "12:00") {
        const seats1300 = getSeatsUsed(bookings, "13:00");
        if (seats1300 > 0 && !override.capacity) {
          return {
            allowed: false,
            reason: "12:00 large dog requires 1:00pm to be empty (early close)",
          };
        }
      }

      // --- 13:00 early close ---
      if (slot === "13:00" && isEarlyCloseActive(bookings) && !override.capacity) {
        return {
          allowed: false,
          reason: "1:00pm is closed — large dog at 12:00 triggered early close",
        };
      }

      // --- Back-to-back full-takeover ---
      if (!rule.canShare) {
        const slotIndex = activeSlots.indexOf(slot);

        if (slotIndex > 0) {
          const prevSlot = activeSlots[slotIndex - 1];
          const prevRule = largeDogSlots[prevSlot];
          if (prevRule && !prevRule.canShare && hasLargeDog(bookings, prevSlot)) {
            const pair = [prevSlot, slot].sort();
            if (!(pair[0] === "12:30" && pair[1] === "13:00") && !override.capacity) {
              return {
                allowed: false,
                reason: "Back-to-back large dogs only allowed at 12:30 + 1:00pm",
              };
            }
          }
        }

        if (slotIndex < activeSlots.length - 1) {
          const nextSlot = activeSlots[slotIndex + 1];
          const nextRule = largeDogSlots[nextSlot];
          if (nextRule && !nextRule.canShare && hasLargeDog(bookings, nextSlot)) {
            const pair = [slot, nextSlot].sort();
            if (!(pair[0] === "12:30" && pair[1] === "13:00") && !override.capacity) {
              return {
                allowed: false,
                reason: "Back-to-back large dogs only allowed at 12:30 + 1:00pm",
              };
            }
          }
        }
      }

      // --- Shareable slot: only small/medium can join a large dog ---
      if (rule.canShare && hasLargeDog(bookings, slot) && !override.capacity) {
        return {
          allowed: false,
          reason: "Only a small/medium dog can share this slot with a large dog",
        };
      }

      // --- Full-takeover slot already has bookings ---
      if (!rule.canShare && cap.used > 0 && !override.capacity) {
        return {
          allowed: false,
          reason: "Large dog fills this slot — already has bookings",
        };
      }

      // --- Full-takeover needs 2 seats but 2-2-1 caps at 1 ---
      if (!rule.canShare && seatsNeeded > cap.max && !override.capacity) {
        return {
          allowed: false,
          reason: "Not enough capacity (2-2-1 rule)",
        };
      }
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

  if (availableSeats < seatsNeeded && !override.capacity) {
    return {
      allowed: false,
      reason:
        size === DOG_SIZE.LARGE
          ? "Not enough capacity (2-2-1 rule)"
          : cap.isEarlyClosed
            ? "1:00pm closed — early close from 12:00 large dog"
            : cap.isConstrained
              ? "Capped at 1 (2-2-1 rule)"
              : "Slot is full",
    };
  }

  // --- Small/medium blocked by full-takeover large dog ---
  if (size !== DOG_SIZE.LARGE && cap.hasLargeDog && !override.capacity) {
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
  // Only the fields the engine reads — see header note.
  return {
    slot,
    size: dog.size,
    status: BOOKING_STATUS.BOOKED,
    _dogId: dog.id,
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
  overrides: Record<string, SlotOverrides> = {},
): SlotAllocation[] {
  const results: SlotAllocation[] = [];
  const seen = new Set<string>();
  const slotIndex = (slot: string) => activeSlots.indexOf(slot);
  const orderedDogs = [...dogs].sort(
    (a, b) =>
      DOG_SIZE_PRIORITY[b.size] - DOG_SIZE_PRIORITY[a.size] ||
      a.id.localeCompare(b.id),
  );

  // Re-check a finished allocation as a whole. The search validates each
  // placement against the day as it stood at that moment, but some rules are
  // DIRECTIONAL — booking 09:00 inspects 08:30, while booking 08:30 does not
  // inspect 09:00 — so a depth-first path can reach an invalid final state
  // through individually valid steps. Two large dogs placed 09:00 first and
  // 08:30 second were offered that way, and PostgreSQL, which evaluates the
  // whole day on every insert, then refused the booking (issue #664).
  //
  // Checking each dog against all the others closes that gap using only the
  // rules already in canBookSlot(): no rule is added here, so this can only
  // remove offers the database would have rejected.
  function allocationHoldsTogether(
    assignments: Array<{ dogId: string; slot: string }>,
  ): boolean {
    const placed = assignments.map((assignment) => {
      const dog = dogs.find((d) => d.id === assignment.dogId)!;
      return { assignment, booking: makeTempBooking(dog, assignment.slot), dog };
    });

    return placed.every(({ assignment, dog }) => {
      const others = [
        ...bookings,
        ...placed
          .filter((other) => other.assignment.dogId !== assignment.dogId)
          .map((other) => other.booking),
      ];
      return canBookSlot(others, assignment.slot, dog.size, activeSlots, {
        overrides: overrides[assignment.slot] || {},
      }).allowed;
    });
  }

  function addResult(assignments: Array<{ dogId: string; slot: string }>) {
    if (!allocationHoldsTogether(assignments)) return;

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
        const result = canBookSlot(simulatedBookings, slot, dog.size, activeSlots, {
          overrides: overrides[slot] || {},
        });
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
  dailyDogCap = DAILY_DOG_CAP,
  // Whole-day staff-blocked seats (day_settings.overrides), keyed by slot.
  // MIRRORS src/engine/capacity.ts. A blocked seat removes a free seat from
  // its own slot only — it doesn't count toward the daily cap or the 2-2-1
  // windowing, so it can't cascade to neighbours.
  overrides: Record<string, SlotOverrides> = {},
): SlotAllocation[] {
  const count = dogs.length;

  // Out of range
  if (count === 0 || count > 4) return [];

  // Day-total cap — MIRRORS src/engine/capacity.ts. The per-slot 2-2-1 rules
  // only limit seats *within a slot*; without this guard a near-empty slot on
  // an otherwise-full day is still offered, letting the WhatsApp Flow propose a
  // drop-off the DB trigger (salon_config.daily_dog_cap) then rejects. The
  // whole group must fit (atomic). `bookings` is this day's non-cancelled
  // occupancy, one row per dog.
  if (bookings.length + count > dailyDogCap) return [];

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
    addResults(searchAllocationsForSlots(dogs, bookings, activeSlots, [slot], overrides));
  }

  for (let i = 0; i < activeSlots.length - 1; i++) {
    addResults(
      searchAllocationsForSlots(
        dogs,
        bookings,
        activeSlots,
        [activeSlots[i], activeSlots[i + 1]],
        overrides,
      ),
    );
  }

  return results;
}
