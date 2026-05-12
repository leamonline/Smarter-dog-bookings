// ============================================================
// src/components/views/inbox/hooks/slotCapacityPreview.js
//
// Pure helpers for the BookingCapacityPreview that lives inside
// BookingActionPanel. Reasons live here so the unit tests can run
// the full classification path without mounting React.
// ============================================================

import { canBookSlot, computeSlotCapacities } from "../../../../engine/capacity.ts";
import { SALON_SLOTS } from "../../../../constants/index.ts";

const SIZE_LABEL_SHORT = {
  small: "small",
  medium: "medium",
  large: "large",
};

// Build a short, plain-English summary of the existing bookings at
// this slot. Returns "Empty slot" when nothing's there yet so the
// preview always has something to say.
export function summariseExistingBookings(bookings, slot) {
  const slotBookings = (bookings || []).filter((b) => b.slot === slot);
  if (slotBookings.length === 0) return "Empty slot";

  const counts = { small: 0, medium: 0, large: 0 };
  for (const b of slotBookings) {
    const size = (b.size || "").toLowerCase();
    if (counts[size] !== undefined) counts[size] += 1;
  }

  const parts = [];
  if (counts.small) parts.push(`${counts.small} ${SIZE_LABEL_SHORT.small}`);
  if (counts.medium) parts.push(`${counts.medium} ${SIZE_LABEL_SHORT.medium}`);
  if (counts.large) parts.push(`${counts.large} ${SIZE_LABEL_SHORT.large}`);

  // "1 small" doesn't say "dog"; "1 small + 1 medium already in" reads
  // more naturally to staff who already know they're looking at dogs.
  return parts.length === 1
    ? `${parts[0]} dog already in`
    : `${parts.join(" + ")} already in`;
}

// Top-level: classify a proposed (slot, size) tuple given the
// existing bookings on that day. Wraps canBookSlot so the UI
// component doesn't need to know about the engine API.
//
// Return shape:
//   {
//     fits: boolean,
//     summary: string,          // "Adds to 1 small + 1 medium. Fits the 2-2-1 rule."
//     reason: string | null,    // when fits === false
//     needsApproval: boolean,   // surfaces the engine's needsApproval hint
//     existing: Booking[],      // the existing bookings at this slot
//   }
//
// activeSlots defaults to SALON_SLOTS. Day-specific extras aren't
// honoured yet — the Postgres capacity trigger is still the source
// of truth at apply time; this hook is an informational preview.
export function classifyProposedBooking({
  bookings,
  slot,
  size,
  activeSlots = SALON_SLOTS,
}) {
  if (!slot || !size) {
    return {
      fits: false,
      summary: "Pick a date, slot and size to preview capacity.",
      reason: null,
      needsApproval: false,
      existing: [],
    };
  }

  const safeBookings = Array.isArray(bookings) ? bookings : [];

  const result = canBookSlot(safeBookings, slot, size, activeSlots);
  const capacities = computeSlotCapacities(safeBookings, activeSlots);
  const cap = capacities[slot];
  const existing = safeBookings.filter((b) => b.slot === slot);

  const existingSummary = summariseExistingBookings(safeBookings, slot);

  if (result.allowed) {
    // "Empty slot. Fits — first booking of the day."
    // "Adds to 1 small. Fits the 2-2-1 rule."
    const second =
      existing.length === 0
        ? "Fits — first booking of the day."
        : cap?.isConstrained
          ? "Fits — slot is capped at 1 by the 2-2-1 rule."
          : "Fits the 2-2-1 rule.";
    const first =
      existing.length === 0
        ? existingSummary
        : `Adds to ${existingSummary}.`;
    return {
      fits: true,
      summary: `${first} ${second}`,
      reason: null,
      needsApproval: !!result.needsApproval,
      existing,
    };
  }

  // Doesn't fit — surface the engine's reason verbatim.
  const reason = result.reason || "Slot is full.";
  return {
    fits: false,
    summary: existing.length === 0 ? `Empty slot. ${reason}` : `${existingSummary}. ${reason}`,
    reason,
    needsApproval: !!result.needsApproval,
    existing,
  };
}
