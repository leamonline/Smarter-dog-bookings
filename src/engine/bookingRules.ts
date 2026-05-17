import { PRICING, SERVICES } from "../constants/index.js";
import { getAddonsTotal } from "../constants/salon.js";
import type { Service, Human, Dog, Booking } from "../types/index.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True if `value` is shaped like a UUID. Used by display helpers to
 * refuse rendering raw IDs as customer-visible text.
 */
export function looksLikeUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

// Legacy booking rows (and a previous version of dbBookingsToArray) baked
// the literal string "Unknown" into bookings.dogName / bookings.owner
// whenever the dogs/humans join missed. Treat those as "no value" so
// downstream consumers can rely on the Unknown / Unknown owner sentinels
// rather than rendering the placeholder verbatim.
function isMissingNameToken(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "" || trimmed === "unknown" || trimmed === "unknown owner";
}

export const DEFAULT_DEPOSIT_AMOUNT = 10;

export interface BookingPricingInput {
  service: string;
  size: string;
  addons?: string[] | null;
  payment?: string | null;
  depositAmount?: number | null;
  customPrice?: number | null;
}

export interface BookingPricing {
  basePrice: number;
  addonsTotal: number;
  subtotal: number;
  depositPaid: number;
  amountDue: number;
  isPaidInFull: boolean;
  isDepositPaid: boolean;
}

export function computeBookingPricing(input: BookingPricingInput): BookingPricing {
  let basePrice: number;
  const customPrice = input.customPrice;
  if (customPrice != null && !isNaN(Number(customPrice))) {
    basePrice = Number(customPrice);
  } else {
    const normalizedService = normalizeServiceForSize(input.service, input.size);
    basePrice = getNumericPrice(getServicePriceLabel(normalizedService, input.size));
  }

  const addonsTotal = getAddonsTotal(input.addons ?? null);
  const subtotal = basePrice + addonsTotal;

  const payment = input.payment || "Due at Pick-up";
  const depositAmount = input.depositAmount ?? DEFAULT_DEPOSIT_AMOUNT;

  const isPaidInFull = payment === "Paid in Full";
  const isDepositPaid = payment === "Deposit Paid";

  let amountDue: number;
  if (isPaidInFull) amountDue = 0;
  else if (isDepositPaid) amountDue = Math.max(0, subtotal - depositAmount);
  else amountDue = subtotal;

  return {
    basePrice,
    addonsTotal,
    subtotal,
    depositPaid: isDepositPaid ? depositAmount : 0,
    amountDue,
    isPaidInFull,
    isDepositPaid,
  };
}

export function isServiceSupportedForSize(serviceId: string, size: string): boolean {
  const pricing = PRICING as Record<string, Record<string, string>>;
  const value = pricing?.[serviceId]?.[size];
  return typeof value === "string" && value !== "N/A";
}

export function getAllowedServicesForSize(size: string): Service[] {
  return (SERVICES as Service[]).filter((service) => isServiceSupportedForSize(service.id, size));
}

export function normalizeServiceForSize(serviceId: string, size: string): string {
  if (isServiceSupportedForSize(serviceId, size)) return serviceId;
  const services = SERVICES as Service[];
  return getAllowedServicesForSize(size)[0]?.id || services[0]?.id || "";
}

export function getServicePriceLabel(serviceId: string, size: string): string {
  const pricing = PRICING as Record<string, Record<string, string>>;
  return pricing?.[serviceId]?.[size] || "N/A";
}

export function getNumericPrice(value: string | number): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const digits = value.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

export function toLocalDateStr(date: Date | string): string {
  if (typeof date === "string") return date;
  if (!(date instanceof Date)) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getHumanByIdOrName(humans: Record<string, Human>, idOrName: string): Human | null {
  if (!humans || !idOrName) return null;

  if (humans[idOrName]) return humans[idOrName];

  return Object.values(humans).find((human) => {
    const fullName = human.fullName || `${human.name || ""} ${human.surname || ""}`.trim();
    return human.id === idOrName || fullName === idOrName;
  }) || null;
}

export function getDogByIdOrName(dogs: Record<string, Dog>, idOrName: string): Dog | null {
  if (!dogs || !idOrName) return null;

  return Object.values(dogs).find((dog) => dog.id === idOrName || dog.name === idOrName) || null;
}

export interface BookingDisplay {
  dogName: string;
  breed: string;
  owner: string;
  ownerPhone: string;
  dogMissing: boolean;
  ownerMissing: boolean;
}

/**
 * The single selector for booking display text. Every surface that
 * renders a booking (Grid card, List card, Booking detail modal,
 * Reports) must go through this so they never disagree.
 *
 * Policy (also enforced server-side via trg_bookings_set_snapshots):
 *   1. Prefer the live joined value from `dogs` / `humans`.
 *   2. Fall back to `booking.breedSnapshot` / `booking.ownerNameSnapshot`
 *      only when the dog or human row is missing or has been deleted.
 *   3. Never render a UUID as customer-visible text. If the input
 *      somehow resolves to a UUID-shape, the helper substitutes the
 *      "Unknown" sentinel and (in dev) emits a warning so the leak is
 *      caught in code review rather than in production.
 */
export function resolveBookingDisplay(
  booking: Booking | null | undefined,
  dogs: Record<string, Dog> | null | undefined,
  humans: Record<string, Human> | null | undefined,
): BookingDisplay {
  if (!booking) {
    return {
      dogName: "Unknown",
      breed: "",
      owner: "Unknown owner",
      ownerPhone: "",
      dogMissing: true,
      ownerMissing: true,
    };
  }

  // Only seed the dog lookup with booking.dogName when it's a real value;
  // legacy rows store the literal "Unknown" placeholder which would
  // accidentally match a dog literally named "Unknown".
  const dogLookupKey =
    booking._dogId ||
    (isMissingNameToken(booking.dogName) ? "" : booking.dogName) ||
    "";
  const dog = getDogByIdOrName(dogs ?? {}, dogLookupKey);
  const owner = dog
    ? getHumanByIdOrName(humans ?? {}, dog._humanId || dog.humanId || "")
    : booking._ownerId
      ? getHumanByIdOrName(humans ?? {}, booking._ownerId)
      : null;

  const fallbackDogName = isMissingNameToken(booking.dogName) ? "" : booking.dogName;
  const fallbackOwnerName = isMissingNameToken(booking.owner) ? "" : booking.owner;

  const rawDogName = dog?.name || fallbackDogName || "";
  const rawBreed = dog?.breed || booking.breedSnapshot || booking.breed || "";
  const rawOwnerName = owner?.fullName || booking.ownerNameSnapshot || fallbackOwnerName || "";

  const dogName = looksLikeUuid(rawDogName) || !rawDogName ? "Unknown" : rawDogName;
  const breed = looksLikeUuid(rawBreed) ? "" : rawBreed;
  const owner_label = looksLikeUuid(rawOwnerName) || !rawOwnerName ? "Unknown owner" : rawOwnerName;

  if (import.meta.env?.DEV) {
    if (looksLikeUuid(rawDogName)) console.warn("resolveBookingDisplay: dog name looked like a UUID", booking.id);
    if (looksLikeUuid(rawOwnerName)) console.warn("resolveBookingDisplay: owner name looked like a UUID", booking.id);
  }

  return {
    dogName,
    breed,
    owner: owner_label,
    ownerPhone: owner?.phone || "",
    dogMissing: !dog,
    ownerMissing: !owner,
  };
}
