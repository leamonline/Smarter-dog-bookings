import { isServiceSupportedForSize } from "./bookingRules";
import { DOG_SIZES } from "../constants/salon";
import type { DogSize } from "../constants/salon";
import type { ServiceId, WizardDog } from "../types/index";

/**
 * "Book the same groom again" (#1073, slice 6).
 *
 * Two steps, deliberately split. `lastVisitEntries` runs on the dashboard,
 * from history that may be stale, and only names dogs and services. The wizard
 * then runs `resolveRepeatSeed` against the dog list it has just fetched, so
 * size, pregnancy and the services on offer are always judged on fresh data.
 * The server stays the authority at confirm time either way.
 */

export interface RepeatEntry {
  dogId: string;
  service: string;
}

export interface RepeatSeed {
  selectedDogs: WizardDog[];
  /** Only dogs whose previous service is still safe to carry over. */
  services: Record<string, ServiceId>;
}

export interface RepeatSourceBooking {
  dogId?: string | null;
  service?: string | null;
  bookingDate: string;
}

export interface RepeatFreshDog {
  id: string;
  name: string;
  size?: string | null;
  isPregnant?: boolean;
}

/** Same ceiling as the dog step: one visit holds at most four dogs. */
export const MAX_REPEAT_DOGS = 4;

/** No age check exists, so a puppy service is never assumed to still apply. */
const NEVER_CARRIED_OVER = new Set(["puppy-groom"]);

/**
 * The dogs and services of the most recent visit. `pastBookings` must be
 * newest first with cancelled rows already removed, as the dashboard has them.
 * A visit is every booking on the newest date.
 */
export function lastVisitEntries(pastBookings: readonly RepeatSourceBooking[]): RepeatEntry[] {
  const newest = pastBookings[0]?.bookingDate;
  if (!newest) return [];
  const seen = new Set<string>();
  const entries: RepeatEntry[] = [];
  for (const booking of pastBookings) {
    if (booking.bookingDate !== newest) break;
    if (!booking.dogId || !booking.service || seen.has(booking.dogId)) continue;
    seen.add(booking.dogId);
    entries.push({ dogId: booking.dogId, service: booking.service });
  }
  return entries.slice(0, MAX_REPEAT_DOGS);
}

/**
 * Route state is plain data that survives a refresh, so it is untrusted: keep
 * only well-formed entries, and never more than a visit can hold.
 */
export function readRepeatEntries(raw: unknown): RepeatEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: RepeatEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { dogId, service } = item as Record<string, unknown>;
    if (typeof dogId !== "string" || !dogId || typeof service !== "string" || !service) continue;
    if (entries.some((e) => e.dogId === dogId)) continue;
    entries.push({ dogId, service });
  }
  return entries.slice(0, MAX_REPEAT_DOGS);
}

const isConfirmedSize = (size: unknown): size is DogSize =>
  (DOG_SIZES as readonly string[]).includes(size as string);

export function resolveRepeatSeed(
  entries: readonly RepeatEntry[],
  freshDogs: readonly RepeatFreshDog[],
): RepeatSeed {
  const selectedDogs: WizardDog[] = [];
  const services: Record<string, ServiceId> = {};
  for (const entry of entries) {
    if (selectedDogs.length >= MAX_REPEAT_DOGS) break;
    const dog = freshDogs.find((d) => d.id === entry.dogId);
    if (!dog || dog.isPregnant || !isConfirmedSize(dog.size)) continue;
    selectedDogs.push({ dogId: dog.id, name: dog.name, size: dog.size });
    if (
      !NEVER_CARRIED_OVER.has(entry.service) &&
      isServiceSupportedForSize(entry.service, dog.size)
    ) {
      services[dog.id] = entry.service as ServiceId;
    }
  }
  return { selectedDogs, services };
}

/** Where the wizard should land: the date step only when every dog has a service. */
export function repeatLandingStep(seed: RepeatSeed): 2 | 3 {
  return seed.selectedDogs.every((dog) => seed.services[dog.dogId]) ? 3 : 2;
}
