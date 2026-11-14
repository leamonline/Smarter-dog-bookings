/**
 * slotFit — how the inbox diary describes a slot for the dogs staff have
 * selected.
 *
 * Capacity stays a preflight. `findGroupedSlots` is the same engine the
 * booking wizard uses: a drop-off can place dogs in that slot or in the
 * following one when they cannot share it. Service length is not an input
 * the engine accepts, so a longer service does not, on its own, take a
 * second slot. Postgres remains the authority when a booking is actually
 * written.
 */
import type { Booking, DogSize, SlotOverrides } from "../../../types/index";
import { findGroupedSlots } from "../../../engine/capacity";
import { excludeCancelled } from "../../../engine/occupancy";
import { buildSlotGrid } from "../../../engine/slotGrid";
import { isDateOpen } from "../../../engine/utils";

export interface AvailabilityDog {
  id: string;
  name?: string | null;
  size: DogSize;
  /** Recorded for callers. The capacity engine does not read it. */
  service?: string | null;
}

export type SlotFitKind = "unselected" | "available" | "partial" | "full";

export interface SlotFit {
  kind: SlotFitKind;
  label: string;
  /** Set when the group is placed across more than one slot. */
  assignment: string | null;
  choosable: boolean;
}

interface DiaryDay {
  isOpen?: boolean | null;
  extraSlots?: string[];
  overrides?: Record<string, SlotOverrides>;
}

interface SeatBooking {
  id?: string;
  slot: string;
  size?: string;
  status?: string;
  dogName?: string;
  breed?: string;
}

function dogLabel(dog: AvailabilityDog): string {
  const name = String(dog.name || "").trim();
  return name || "Unnamed dog";
}

function joinPlus(dogs: AvailabilityDog[]): string {
  return dogs.map(dogLabel).join(" + ");
}

function addDays(dateStr: string, delta: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + delta);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function subsets(dogs: AvailabilityDog[]): AvailabilityDog[][] {
  const groups: AvailabilityDog[][] = [];
  const count = dogs.length;
  for (let mask = 1; mask < (1 << count); mask += 1) {
    const group: AvailabilityDog[] = [];
    for (let index = 0; index < count; index += 1) {
      if (mask & (1 << index)) group.push(dogs[index]);
    }
    groups.push(group);
  }
  groups.sort((a, b) => b.length - a.length);
  return groups;
}

export function describeDayAvailability({
  dogs,
  dayBookings,
  activeSlots,
  dailyDogCap,
  overrides = {},
}: {
  dogs: AvailabilityDog[];
  dayBookings: SeatBooking[];
  activeSlots: string[];
  dailyDogCap: number;
  overrides?: Record<string, SlotOverrides>;
}): Record<string, SlotFit> {
  const selectable = (dogs || []).filter((dog) => dog?.id && dog.size);
  const result: Record<string, SlotFit> = {};

  if (selectable.length === 0) {
    for (const slot of activeSlots) {
      result[slot] = {
        kind: "unselected",
        label: "Choose dogs to check",
        assignment: null,
        choosable: false,
      };
    }
    return result;
  }

  // The engine refuses a group larger than four. Checking a silent subset
  // would mark a time available while the reply still names every dog.
  if (selectable.length > 4) {
    for (const slot of activeSlots) {
      result[slot] = {
        kind: "partial",
        label: "Choose up to 4 dogs",
        assignment: null,
        choosable: false,
      };
    }
    return result;
  }

  const bookings = dayBookings as Parameters<typeof findGroupedSlots>[1];
  const byGroup = new Map<string, Map<string, { assignments: Array<{ dogId: string; slot: string }> }>>();
  for (const group of subsets(selectable)) {
    const key = group.map((dog) => dog.id).join("\0");
    const allocations = findGroupedSlots(
      group.map((dog) => ({ id: dog.id, size: dog.size })),
      bookings,
      activeSlots,
      dailyDogCap,
      overrides,
    );
    const byDrop = new Map<string, { assignments: Array<{ dogId: string; slot: string }> }>();
    for (const allocation of allocations) {
      if (!byDrop.has(allocation.dropOffTime)) byDrop.set(allocation.dropOffTime, allocation);
    }
    byGroup.set(key, byDrop);
  }

  const names = new Map(selectable.map((dog) => [dog.id, dogLabel(dog)]));

  for (const slot of activeSlots) {
    let chosen: AvailabilityDog[] | null = null;
    let allocation: { assignments: Array<{ dogId: string; slot: string }> } | null = null;
    for (const group of subsets(selectable)) {
      const found = byGroup.get(group.map((dog) => dog.id).join("\0"))?.get(slot);
      if (!found) continue;
      chosen = group;
      allocation = found;
      break;
    }

    if (!chosen || !allocation) {
      result[slot] = { kind: "full", label: "Full", assignment: null, choosable: false };
      continue;
    }

    if (chosen.length === selectable.length) {
      const slots = new Set(allocation.assignments.map((item) => item.slot));
      const assignment = slots.size > 1
        ? allocation.assignments
          .map((item) => `${names.get(item.dogId) || "Unnamed dog"} ${item.slot}`)
          .join(", ")
        : null;
      result[slot] = {
        kind: "available",
        label: `Available for ${joinPlus(chosen)}`,
        assignment,
        choosable: true,
      };
      continue;
    }

    result[slot] = {
      kind: "partial",
      label: `Only fits ${chosen.length} of ${selectable.length} dogs`,
      assignment: null,
      choosable: false,
    };
  }

  return result;
}

/** The next open date, after `fromDate`, where the selected dogs can start. */
export function findNextAvailableDate({
  fromDate,
  daySettings,
  bookingsByDate,
  dogs,
  dailyDogCap,
  horizon = 21,
}: {
  fromDate: string;
  daySettings: Record<string, DiaryDay>;
  bookingsByDate: Record<string, SeatBooking[]>;
  dogs: AvailabilityDog[];
  dailyDogCap: number;
  horizon?: number;
}): string | null {
  if (!dogs.length || !fromDate) return null;
  let cursor = addDays(fromDate, 1);
  for (let step = 0; step < horizon; step += 1) {
    // Only dates present in the loaded diary. A missing key is not an empty
    // open day — the window simply has not been fetched yet.
    const settings = daySettings[cursor];
    if (settings && isDateOpen(cursor, null, daySettings as Record<string, { isOpen?: boolean }>)) {
      const activeSlots = buildSlotGrid(settings.extraSlots || []);
      const fits = describeDayAvailability({
        dogs,
        dayBookings: excludeCancelled((bookingsByDate[cursor] || []) as Booking[]) as SeatBooking[],
        activeSlots,
        dailyDogCap,
        overrides: settings.overrides || {},
      });
      if (Object.values(fits).some((fit) => fit.choosable)) return cursor;
    }
    cursor = addDays(cursor, 1);
  }
  return null;
}
