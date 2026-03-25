import { LARGE_DOG_SLOTS } from "../constants/index.js";

export function getSeatsUsed(bookings, slot) {
  return bookings
    .filter((b) => b.slot === slot)
    .reduce((total, b) => {
      if (b.size === "large") {
        const rule = LARGE_DOG_SLOTS[slot];
        return total + (rule ? rule.seats : 2);
      }
      return total + 1;
    }, 0);
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
    return seatsMap[activeSlots[idx]] >= 2;
  }

  const prevPrev = isDouble(slotIndex - 2);
  const prev = isDouble(slotIndex - 1);
  const next = isDouble(slotIndex + 1);
  const nextNext = isDouble(slotIndex + 2);

  const wouldViolate =
    (prevPrev && prev) ||
    (prev && next) ||
    (next && nextNext);

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
    const largeFills = hasLarge && LARGE_DOG_SLOTS[slot] && !LARGE_DOG_SLOTS[slot].canShare;

    capacities[slot] = {
      used,
      max,
      available: largeFills ? 0 : available,
      bookings: bookings.filter((b) => b.slot === slot),
      isConstrained: max < 2,
      isLargeDogApproved: isLargeDogSlot,
      hasLargeDog: hasLarge,
    };
  }

  return capacities;
}

export function canBookSlot(bookings, slot, size, activeSlots) {
  const capacities = computeSlotCapacities(bookings, activeSlots);
  const cap = capacities[slot];
  if (!cap) return { allowed: false, reason: "Invalid slot" };

  const seatsNeeded = size === "large" ? (LARGE_DOG_SLOTS[slot]?.seats ?? 2) : 1;

  if (size === "large") {
    const rule = LARGE_DOG_SLOTS[slot];
    if (!rule) {
      return { allowed: false, reason: "Large dogs need Leam's approval for this slot", needsApproval: true };
    }
    if (rule.conditional && slot === "09:00") {
      const seats830 = getSeatsUsed(bookings, "08:30");
      const seats1000 = getSeatsUsed(bookings, "10:00");
      if (seats830 > 0) return { allowed: false, reason: "9:00am conditional: 8:30am must be empty" };
      if (seats1000 > 1) return { allowed: false, reason: "9:00am conditional: 10:00am must have 0\u20131 seats" };
    }
    if (!rule.canShare && cap.used > 0) return { allowed: false, reason: "Large dog fills this slot \u2014 already has bookings" };
    if (rule.canShare && cap.used + seatsNeeded > cap.max) return { allowed: false, reason: "Not enough capacity (2-2-1 rule)" };
    if (!rule.canShare && seatsNeeded > cap.max) return { allowed: false, reason: "Not enough capacity (2-2-1 rule)" };
  } else {
    if (cap.available < 1) return { allowed: false, reason: cap.isConstrained ? "Capped at 1 (2-2-1 rule)" : "Slot is full" };
    if (cap.hasLargeDog) {
      const rule = LARGE_DOG_SLOTS[slot];
      if (rule && !rule.canShare) return { allowed: false, reason: "Large dog fills this slot" };
    }
  }

  return { allowed: true };
}
