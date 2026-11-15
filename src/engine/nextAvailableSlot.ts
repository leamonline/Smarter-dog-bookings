// The dashboard's "next free slot" — the earliest future drop-off the booking
// wizard would offer this customer's dog. Pure: no React, no Supabase.
//
// It composes exactly the rules the wizard's date and slot steps apply, in the
// same order, so the dashboard never advertises a time the wizard would hide:
//   1. the day is open (holiday notice > day_settings row > weekday default);
//   2. findGroupedSlots finds a seat on the canonical grid, under the daily cap,
//      around staff-blocked seats;
//   3. the owner's blocked slots are removed (partitionSlotsForHuman).
// Same-day "last minute" openings are deliberately excluded: they are a
// staff-flagged exception with a 30-minute cutoff, not a slot to promise from
// a page that may sit open for an hour. PostgreSQL stays the authority — this
// is a preview, and the wizard re-checks everything before anything is written.
import { findGroupedSlots } from "./capacity";
import { partitionSlotsForHuman, type HumanSlotRules } from "./deposits";
import { DAY_CAPACITY } from "./utilisation";
import { SALON_SLOTS } from "../constants/salon";
import type { Booking, DogSize, SlotOverrides } from "../types/index";

export interface NextAvailableDog {
  id: string;
  size: DogSize | null;
  isPregnant?: boolean;
}

export interface NextAvailableSlot {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM drop-off time */
  dropOffTime: string;
}

export interface FindNextAvailableSlotArgs {
  /** Candidate dates (YYYY-MM-DD), earliest first. */
  dates: string[];
  dog: NextAvailableDog;
  isOpen: (date: string) => boolean;
  occupancyByDate: Record<string, Booking[]>;
  blockedByDate: Record<string, Record<string, SlotOverrides>>;
  rules?: HumanSlotRules | null;
}

/**
 * Whether the wizard would let this dog be booked online at all. A dog with
 * no staff-confirmed size, or one staff have marked pregnant, is greyed out
 * in the wizard — so the dashboard must not offer it a time either.
 */
export function isOnlineBookableDog(dog: NextAvailableDog | null | undefined): dog is NextAvailableDog & { size: DogSize } {
  return Boolean(dog && dog.size && dog.isPregnant !== true);
}

export function findNextAvailableSlot({
  dates,
  dog,
  isOpen,
  occupancyByDate,
  blockedByDate,
  rules,
}: FindNextAvailableSlotArgs): NextAvailableSlot | null {
  if (!isOnlineBookableDog(dog)) return null;
  const dogs = [{ id: dog.id, size: dog.size }];

  for (const date of dates) {
    if (!isOpen(date)) continue;
    const allocations = findGroupedSlots(
      dogs,
      occupancyByDate[date] ?? [],
      SALON_SLOTS,
      DAY_CAPACITY,
      blockedByDate[date] ?? {},
    );
    const { preferred, rest } = partitionSlotsForHuman(allocations, rules ?? {});
    const earliest = [...preferred, ...rest]
      .map((allocation) => allocation.dropOffTime)
      .sort()[0];
    if (earliest) return { date, dropOffTime: earliest };
  }
  return null;
}
