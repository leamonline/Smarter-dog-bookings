import { PRICING, SERVICES, isActiveBooking } from "../constants/index";
import { getAddonsTotal, FROM_PRICED_SERVICES } from "../constants/salon";
import { formatGBP, penceToPounds, pricePenceFromTableValue } from "../utils/money";
import type { Service, Human, Dog, Booking } from "../types/index";

/** salon_config.pricing shape: service → size → price. Values are integer
 *  pence going forward; legacy "£42" strings are tolerated during the
 *  transition (pricePenceFromTableValue normalises both). */
export type PricingConfig = Record<string, Record<string, number | string | null>> | null | undefined;

/**
 * The single "does this booking count?" rule, shared by the cash-up engine and
 * the reports analytics so they can never diverge. Cancelled appointments free
 * their capacity and bring in no money, so they're excluded from every count,
 * total and rate. (A null/absent status is treated as countable — legacy rows
 * and freshly-built sample rows default to "Booked", never "Cancelled".)
 */
export function isCountableBooking(b: { status?: string | null }): boolean {
  // Both terminal statuses, not just Cancelled.
  //
  // This is THE predicate that decides whether a booking occupies a seat and
  // earns money, and before No-show became a status of its own a no-show was
  // a Cancelled row, so it already fell out here. Testing only for Cancelled
  // after the split would quietly make every no-show countable again: it
  // would consume capacity and block real bookings, and it would reappear in
  // revenue. `isActiveBooking` covers both exits and is the only correct test.
  return isActiveBooking(b.status);
}

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
  /** This booking's one-off agreed price (pounds) — bookings.price_override.
   *  Highest precedence; never touches the dog's usual price. */
  priceOverride?: number | null;
  /** The dog's deliberately saved usual price (pounds) — dogs.custom_price.
   *  Only a value > 0 counts (0/null = "no usual price", use the guide). */
  customPrice?: number | null;
  /** salon_config.pricing (Settings guide prices). Optional — callers
   *  without salon config (customer portal) fall back to the constant. */
  configPricing?: PricingConfig;
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
  // Price precedence (confirmed with the owner, 2026-07-10):
  //   1. this booking's one-off agreed price (price_override)
  //   2. the dog's deliberately saved usual price (custom_price, > 0 only)
  //   3. the Settings guide price (salon_config.pricing)
  //   4. the hard-coded constant as final fallback
  // The previous paid_amount is NEVER reused — it may include one-off
  // charges (matting, extra work) that don't carry to the next visit.
  let basePrice: number;
  const override = input.priceOverride;
  const customPrice = input.customPrice;
  if (override != null && Number(override) > 0) {
    basePrice = Number(override);
  } else if (customPrice != null && Number(customPrice) > 0) {
    basePrice = Number(customPrice);
  } else {
    const normalizedService = normalizeServiceForSize(input.service, input.size);
    const pence = resolveServicePricePence(normalizedService, input.size, input.configPricing);
    basePrice = pence != null ? penceToPounds(pence) : 0;
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

/**
 * Deposit Paid represents a genuine part-payment. Keep one validation rule
 * and one set of staff-facing copy across edit hints, autosave and manual save.
 */
export function validateDepositAmount(
  payment: string | null | undefined,
  depositAmount: number | null | undefined,
  subtotal: number,
): string | null {
  if (payment !== "Deposit Paid") return null;
  const amount = Number(depositAmount);
  if (!Number.isFinite(amount) || amount <= 0) return "Enter a deposit above £0";
  if (amount >= Number(subtotal)) return "Deposit must be less than the booking total";
  return null;
}

export interface MarkPaidPatch {
  payment: "Paid in Full";
  paymentMethod: string | null;
  paidAmount: number;
}

/**
 * The one shape every "Mark paid" surface (Today feed, calendar card, booking
 * detail modal) writes: payment flips to Paid in Full, the method is recorded,
 * and the amount defaults to the appointment's full value — where the dog's
 * customPrice beats the pricing table (computeBookingPricing). paid_at is
 * stamped by the DB trigger, never client-set. An explicit amountOverride
 * (staff correcting the figure) wins over the computed subtotal.
 */
export function buildMarkPaidPatch(
  input: BookingPricingInput,
  method: string | null,
  amountOverride?: number | null,
): MarkPaidPatch {
  const amount =
    amountOverride != null && !isNaN(Number(amountOverride))
      ? Number(amountOverride)
      : computeBookingPricing(input).subtotal;
  return {
    payment: "Paid in Full",
    paymentMethod: method ?? null,
    paidAmount: amount,
  };
}

/**
 * Guide price for a service+size in integer pence: the Settings price
 * (salon_config.pricing) when present, else the hard-coded constant.
 * Returns null when the service isn't offered for that size.
 * Tolerant of legacy "£42" string values during the pence migration.
 */
export function resolveServicePricePence(
  serviceId: string,
  size: string,
  configPricing?: PricingConfig,
): number | null {
  const fromConfig = pricePenceFromTableValue(configPricing?.[serviceId]?.[size]);
  if (fromConfig != null) return fromConfig;
  const constant = (PRICING as Record<string, Record<string, number | null>>)?.[serviceId]?.[size];
  return pricePenceFromTableValue(constant);
}

export function isServiceSupportedForSize(serviceId: string, size: string): boolean {
  return resolveServicePricePence(serviceId, size) != null;
}

export function getAllowedServicesForSize(size: string): Service[] {
  return (SERVICES as Service[]).filter((service) => isServiceSupportedForSize(service.id, size));
}

export function normalizeServiceForSize(serviceId: string, size: string): string {
  if (isServiceSupportedForSize(serviceId, size)) return serviceId;
  const services = SERVICES as Service[];
  return getAllowedServicesForSize(size)[0]?.id || services[0]?.id || "";
}

/**
 * Display label for a service+size guide price: "£42+" for from-priced
 * services, "£38" for fixed ones, "N/A" when not offered. Renders exactly
 * what the old string constants held, now derived from pence.
 */
export function getServicePriceLabel(
  serviceId: string,
  size: string,
  configPricing?: PricingConfig,
): string {
  const pence = resolveServicePricePence(serviceId, size, configPricing);
  if (pence == null) return "N/A";
  const suffix = FROM_PRICED_SERVICES.has(serviceId) ? "+" : "";
  return `${formatGBP(pence)}${suffix}`;
}

/** Guide price in pounds (numeric) for a service+size, 0 when not offered. */
export function getServicePriceAmount(
  serviceId: string,
  size: string,
  configPricing?: PricingConfig,
): number {
  const pence = resolveServicePricePence(serviceId, size, configPricing);
  return pence != null ? penceToPounds(pence) : 0;
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
 *   2. Fall back to `booking.dogNameSnapshot` / `breedSnapshot` /
 *      `ownerNameSnapshot` when the dog or human row is missing, has
 *      been deleted, or simply hasn't been hydrated into the cache
 *      yet (the dogs/humans maps paginate, so this is the common
 *      case on first paint).
 *   3. Never render a UUID as customer-visible text. If the input
 *      somehow resolves to a UUID-shape, the helper substitutes the
 *      "Unknown" sentinel and (in dev) emits a warning so the leak is
 *      caught in code review rather than in production.
 *
 * `dogMissing` means "we have nothing usable to render" — surfaces
 * use it as the gate for the "Unnamed booking" fallback copy. A
 * booking whose dog row is past the paginated cache but whose
 * snapshot is populated still has a usable name, so dogMissing is
 * false. Same shape for `ownerMissing`.
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
  const fallbackDogNameSnapshot = isMissingNameToken(booking.dogNameSnapshot) ? "" : booking.dogNameSnapshot;
  const fallbackOwnerName = isMissingNameToken(booking.owner) ? "" : booking.owner;
  const fallbackOwnerSnapshot = isMissingNameToken(booking.ownerNameSnapshot) ? "" : booking.ownerNameSnapshot;
  // Same legacy-row policy for breed: rows from before the
  // trg_bookings_set_snapshots trigger landed sometimes stored "Unknown"
  // literally, which then rendered on the booking card next to the owner.
  // Use the same filter so the placeholder never reaches the UI.
  const fallbackBreed = isMissingNameToken(dog?.breed) ? "" : dog?.breed;
  const fallbackBreedSnapshot = isMissingNameToken(booking.breedSnapshot) ? "" : booking.breedSnapshot;
  const fallbackBreedField = isMissingNameToken(booking.breed) ? "" : booking.breed;

  const rawDogName = dog?.name || fallbackDogNameSnapshot || fallbackDogName || "";
  const rawBreed = fallbackBreed || fallbackBreedSnapshot || fallbackBreedField || "";
  const rawOwnerName = owner?.fullName || fallbackOwnerSnapshot || fallbackOwnerName || "";

  const dogName = looksLikeUuid(rawDogName) || !rawDogName ? "Unknown" : rawDogName;
  const breed = looksLikeUuid(rawBreed) ? "" : rawBreed;
  const owner_label = looksLikeUuid(rawOwnerName) || !rawOwnerName ? "Unknown owner" : rawOwnerName;

  if (import.meta.env?.DEV) {
    // The engine is deliberately React/Sentry-free (see CLAUDE.md), so it can't
    // import the shared logger (which pulls in @sentry/react). These are
    // dev-only diagnostics, so a narrow line-scoped exception is correct here.
    // eslint-disable-next-line no-console -- engine stays dependency-free; dev-only diagnostic
    if (looksLikeUuid(rawDogName)) console.warn("resolveBookingDisplay: dog name looked like a UUID", booking.id);
    // eslint-disable-next-line no-console -- engine stays dependency-free; dev-only diagnostic
    if (looksLikeUuid(rawOwnerName)) console.warn("resolveBookingDisplay: owner name looked like a UUID", booking.id);
  }

  return {
    dogName,
    breed,
    owner: owner_label,
    ownerPhone: owner?.phone || "",
    dogMissing: !dog && !fallbackDogNameSnapshot && !fallbackDogName,
    ownerMissing: !owner && !fallbackOwnerSnapshot && !fallbackOwnerName,
  };
}
