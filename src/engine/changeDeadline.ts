// What the CLIENT is allowed to do about the online change deadline: pick the
// slot the deadline is measured from. Nothing else.
//
// There is deliberately no deadline arithmetic in this file. `bookingPolicy.ts`
// records why — "a client that re-derives a deadline will eventually disagree
// with the database that actually enforces it" — and the enforcing code is
// cancel_customer_booking (SDC02), which reschedule inherits. The answer comes
// from customer_change_deadline_preview instead.
import type { SlotAllocation } from "../types/index";

/**
 * The slot a visit's change deadline is measured from.
 *
 * cancel_customer_booking scopes to the whole visit and takes
 * `min(booking_date + slot)`, so a two-dog booking at 09:00 and 09:30 closes on
 * the 09:00 one. Slots are zero-padded "HH:MM", so a lexical minimum is the
 * chronological one. Falls back to the drop-off time when a draft carries no
 * per-dog assignments; null when there is nothing to measure from.
 */
export function deadlineAnchorSlot(
  allocation: Pick<SlotAllocation, "assignments" | "dropOffTime"> | null | undefined,
): string | null {
  if (!allocation) return null;
  const slots = (allocation.assignments ?? [])
    .map((assignment) => assignment.slot)
    .filter((slot): slot is string => typeof slot === "string" && slot !== "");
  if (slots.length === 0) {
    return allocation.dropOffTime && allocation.dropOffTime !== ""
      ? allocation.dropOffTime
      : null;
  }
  return slots.reduce((earliest, slot) => (slot < earliest ? slot : earliest));
}
