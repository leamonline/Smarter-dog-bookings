import { LARGE_DOG_SLOTS } from "../constants/index.js";

export function getSeatsNeeded(size, slot) {
  if (size === "large") {
    const rule = LARGE_DOG_SLOTS[slot];
    return rule ? rule.seats : 2;
  }
  return 1;
}

export function getSeatsUsed(bookings, slot) {
  return bookings
    .filter((b) => b.slot === slot)
    .reduce((total, b) => total + getSeatsNeeded(b.size, slot), 0);
}

export function getSeatsUsedMap(bookings, activeSlots) {
  const map = {};
  for (const slot of activeSlots) {
    map[slot] = getSeatsUsed(bookings, slot);
  }
  return map;
}

export function hasLargeDog(bookings, slot) {
  return bookings.some((b) => b.slot === slot && b.size === "large");
}

export function getMaxSeatsForSlot(slotIndex, seatsMap, activeSlots) {
  function isDouble(idx) {
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

export function computeSlotCapacities(bookings, activeSlots) {
  const seatsMap = getSeatsUsedMap(bookings, activeSlots);
  const capacities = {};

  for (let i = 0; i < activeSlots.length; i++) {
    const slot = activeSlots[i];
    const used = seatsMap[slot];
    const max = getMaxSeatsForSlot(i, seatsMap, activeSlots);
    const available = Math.max(0, max - used);
    const isLargeDogSlot = LARGE_DOG_SLOTS[slot] !== undefined;
    const hasLarge = hasLargeDog(bookings, slot);
    const largeFills =
      hasLarge && LARGE_DOG_SLOTS[slot] && !LARGE_DOG_SLOTS[slot].canShare;

    capacities[slot] = {
      used,
      max,
      baseMax: max,
      available: largeFills ? 0 : available,
      bookings: bookings.filter((b) => b.slot === slot),
      isConstrained: max < 2,
      isLargeDogApproved: isLargeDogSlot,
      hasLargeDog: hasLarge,
    };
  }

  return capacities;
}

export function getSeatStatesForSlot(
  bookings,
  slot,
  activeSlots,
  overrides = {},
  selectedSeatIndex = null,
) {
  const capacities = computeSlotCapacities(bookings, activeSlots);
  const cap = capacities[slot];

  if (!cap) return [];

  const slotBookings = bookings.filter((b) => b.slot === slot);
  const states = [
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
      states[i] = { type: "blocked", seatIndex: i };
    }
  }

  return states;
}

export function getBookableSeatCount(
  bookings,
  slot,
  activeSlots,
  overrides = {},
  selectedSeatIndex = null,
) {
  return getSeatStatesForSlot(
    bookings,
    slot,
    activeSlots,
    overrides,
    selectedSeatIndex,
  ).filter((seat) => seat.type === "available").length;
}

export function canBookSlot(bookings, slot, size, activeSlots, options = {}) {
  const { overrides = {}, selectedSeatIndex = null } = options;
  const capacities = computeSlotCapacities(bookings, activeSlots);
  const cap = capacities[slot];

  if (!cap) return { allowed: false, reason: "Invalid slot" };

  const seatsNeeded = getSeatsNeeded(size, slot);

  if (size === "large") {
    const rule = LARGE_DOG_SLOTS[slot];
    if (!rule) {
      return {
        allowed: false,
        reason: "Large dogs need Leam's approval for this slot",
        needsApproval: true,
      };
    }

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
          reason: "9:00am conditional: 10:00am must have 0–1 seats",
        };
      }
    }

    if (!rule.canShare && cap.used > 0) {
      return {
        allowed: false,
        reason: "Large dog fills this slot — already has bookings",
      };
    }

    if (!rule.canShare && seatsNeeded > cap.max) {
      return {
        allowed: false,
        reason: "Not enough capacity (2-2-1 rule)",
      };
    }
  }

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
          : cap.isConstrained
            ? "Capped at 1 (2-2-1 rule)"
            : "Slot is full",
    };
  }

  if (size !== "large" && cap.hasLargeDog) {
    const rule = LARGE_DOG_SLOTS[slot];
    if (rule && !rule.canShare) {
      return { allowed: false, reason: "Large dog fills this slot" };
    }
  }

  return { allowed: true };
}
