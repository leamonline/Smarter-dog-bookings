// ============================================================
// Per-date slot grid — pure logic, zero React.
//
// The bookable grid for a date is the canonical SALON_SLOTS plus that
// date's staff-added extra slots (day_settings.extra_slots), sanitised
// and sorted. MIRRORS active_slots_for() in the DB (migration
// 20260702170000) and buildSlotGrid in _shared/salonConstants.ts (Deno).
// ============================================================

import { SALON_SLOTS } from "../constants/salon";

/** Strict HH:MM (00-23 hours). Matches the DB sanitiser — anything else
 *  (e.g. a legacy "25:00" the old add-slot button could generate) is not
 *  a real slot and never enters a grid. */
export const SLOT_SHAPE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * Canonical slots plus sanitised extras, deduped and sorted. Zero-padded
 * HH:MM sorts chronologically as text, which the capacity engines rely on
 * (2-2-1 neighbour lookups and drop-off ordering are index-based).
 */
export function buildSlotGrid(extraSlots: readonly string[] = []): string[] {
  return [
    ...new Set([...SALON_SLOTS, ...extraSlots.filter((s) => SLOT_SHAPE.test(s))]),
  ].sort();
}
