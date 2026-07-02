// ============================================================
// Last-minute ("immediate") booking helpers — pure logic, zero React.
//
// Staff flag slots on the current day (day_settings.immediate_slots) so
// customers can book them same-day until IMMEDIATE_CUTOFF_MINUTES before
// the slot starts. The DB is the authority (validate_booking_calendar +
// get_immediate_slots apply the cutoff server-side in Europe/London);
// these helpers exist for UI gating and for filtering allocations
// against an already-server-filtered flag set.
// ============================================================

import { IMMEDIATE_CUTOFF_MINUTES } from "../constants/salon";
import { slotToMinutes } from "./utilisation";
import type { SlotAllocation } from "../types/index";

/**
 * True while a slot can still be opened/booked as last-minute on the
 * device's local clock (same precedent as the "Now" row's
 * currentSlotIndex — the salon's devices run on London time; the DB
 * re-checks with the server clock regardless). At exactly the cutoff
 * (e.g. 09:30 for a 10:00 slot) booking is still allowed.
 */
export function isBeforeImmediateCutoff(slot: string, now: Date): boolean {
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins <= slotToMinutes(slot) - IMMEDIATE_CUTOFF_MINUTES;
}

/**
 * True when EVERY per-dog assignment in the allocation lands on a flagged
 * last-minute slot. The calendar trigger validates each inserted row's own
 * slot, so a multi-dog group that spills into a neighbouring unflagged slot
 * would be rejected — filter it out up front. Mirrored in
 * supabase/functions/_shared/flowBooking.ts for the WhatsApp Flow.
 */
export function allocationIsImmediate(
  allocation: Pick<SlotAllocation, "assignments">,
  immediateSlots: ReadonlySet<string>,
): boolean {
  return allocation.assignments.every((a) => immediateSlots.has(a.slot));
}
