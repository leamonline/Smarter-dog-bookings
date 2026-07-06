// ============================================================
// supabase/functions/_shared/salonConstants.ts
//
// Salon services, add-ons, slot grid and fallback pricing — the
// subset the WhatsApp Flow backend needs. The Supabase Edge (Deno)
// runtime can't import the Vite frontend's src/constants/salon.ts,
// so these MIRROR it and MUST stay in sync. (The repo already
// duplicates this between TS constants and the SQL trigger; this is
// the third copy, for the Deno boundary. Source of truth for PRICES
// at runtime is salon_config.pricing — DEFAULT_PRICING is only the
// fallback when no DB row exists, matching useSalonConfig.js.)
//
// Pure module: no imports, so it runs in Deno and Vitest/Node alike.
// ============================================================

export type DogSize = "small" | "medium" | "large";

export const SALON_SLOTS: readonly string[] = [
  "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00",
];

// Maximum dogs the salon will groom in one day — MIRRORS DAILY_DOG_CAP in
// src/constants/salon.ts and salon_config.daily_dog_cap (DB, authoritative).
// The capacityParity test asserts this Deno mirror and the frontend engine
// agree on a near-full day.
export const DAILY_DOG_CAP = 14;

// How close to a slot's start a customer can still make a same-day ("last
// minute") booking, in minutes — MIRRORS IMMEDIATE_CUTOFF_MINUTES in
// src/constants/salon.ts; the DB (validate_booking_calendar + availability
// RPCs) is the authority. The capacityParity test guards the TS pair.
export const IMMEDIATE_CUTOFF_MINUTES = 30;

// Strict HH:MM (00-23 hours) — MIRRORS SLOT_SHAPE in src/engine/slotGrid.ts
// and the DB sanitiser in active_slots_for().
export const SLOT_SHAPE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Canonical slots plus sanitised extras, deduped and sorted
 *  chronologically — MIRRORS buildSlotGrid in src/engine/slotGrid.ts and
 *  active_slots_for() in the DB. */
export function buildSlotGrid(extraSlots: readonly string[] = []): string[] {
  return [
    ...new Set([...SALON_SLOTS, ...extraSlots.filter((s) => SLOT_SHAPE.test(s))]),
  ].sort();
}

// Large dogs can only ever occupy these drop-off times (mirrors
// LARGE_DOG_SLOTS in src/constants/salon.ts). Per-slot eligibility is
// still enforced by the DB capacity trigger; this is the candidate set.
export const LARGE_DOG_CANDIDATE_SLOTS: readonly string[] = [
  "08:30", "09:00", "12:00", "12:30", "13:00",
];

// Full large-dog slot rules — MIRRORS src/constants/salon.ts LARGE_DOG_SLOTS.
// Consumed by _shared/capacity.ts (the 2-2-1 engine mirror) to offer
// group-fitting slots; the DB capacity trigger remains the hard guard.
export interface LargeDogSlotRule {
  seats: number;
  canShare: boolean;
  needsApproval: boolean;
  conditional?: boolean;
}

export const LARGE_DOG_SLOTS: Record<string, LargeDogSlotRule> = {
  "08:30": { seats: 1, canShare: true, needsApproval: false },
  "09:00": { seats: 1, canShare: true, needsApproval: false, conditional: true },
  "12:00": { seats: 1, canShare: true, needsApproval: false },
  "12:30": { seats: 2, canShare: false, needsApproval: false },
  "13:00": { seats: 2, canShare: false, needsApproval: false },
};

// Named size accessors — mirrors src/constants/salon.ts DOG_SIZE so the
// literal "large" doesn't leak into the engine mirror.
export const DOG_SIZE = {
  SMALL: "small",
  MEDIUM: "medium",
  LARGE: "large",
} as const satisfies Record<string, DogSize>;

// Canonical booking-status IDs — mirrors src/constants/salon.ts BOOKING_STATUS.
export const BOOKING_STATUS = {
  BOOKED: "Booked",
  CHECKED_IN: "Checked in",
  IN_BATH: "In bath",
  READY_FOR_PICKUP: "Ready for pick-up",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
} as const;

// Customer self-service portal sign-in/sign-up URL (prod default). This
// module stays pure (no Deno/env access); callers in the Edge functions
// override per-environment via `Deno.env.get("CUSTOMER_PORTAL_URL")`.
export const CUSTOMER_PORTAL_URL = "https://smarterdog.vercel.app/customer/login";

// The salon's physical location, sent as the LOCATION header of any template
// whose Meta definition carries one (see TEMPLATES_WITH_LOCATION_HEADER).
// WhatsApp location headers have NO static option — the pin (lat/long/name/
// address) MUST be supplied at SEND time, or Meta rejects the message with a
// missing-header-parameter error. Coordinates are the salon's exact Google
// Maps place pin. Mirrors the salon facts (183 Kings Road, Ashton-under-Lyne,
// OL6 8HD).
export const SALON_LOCATION = {
  latitude: 53.5004583,
  longitude: -2.0793345,
  name: "Smarter Dog Grooming Salon",
  address: "183 Kings Road, Ashton-under-Lyne, OL6 8HD",
} as const;

// Approved templates whose Meta definition includes a LOCATION header. The send
// path attaches a header component with SALON_LOCATION for these; other
// templates are unaffected.
export const TEMPLATES_WITH_LOCATION_HEADER: ReadonlySet<string> = new Set([
  "appointment_reminder_v1",
]);

export interface ServiceDef {
  id: string;
  name: string;
}

export const SERVICES: readonly ServiceDef[] = [
  { id: "full-groom", name: "Full Groom" },
  { id: "bath-and-brush", name: "Bath & Brush" },
  { id: "bath-and-deshed", name: "Bath & De-shed" },
  { id: "puppy-groom", name: "Puppy Groom" },
];

export type PricingMap = Record<string, Record<string, string>>;

export const DEFAULT_PRICING: PricingMap = {
  "full-groom": { small: "£42+", medium: "£46+", large: "£60+" },
  "bath-and-brush": { small: "£38+", medium: "£42+", large: "£55+" },
  "bath-and-deshed": { small: "£38+", medium: "£42+", large: "£55+" },
  "puppy-groom": { small: "£38", medium: "£38", large: "N/A" },
};

export interface AddonDef {
  id: string;
  price: number;
}

// Add-on ids match the strings stored in bookings.addons (text[]).
export const ADDONS: readonly AddonDef[] = [
  { id: "Flea Bath", price: 10 },
  { id: "Sensitive Shampoo", price: 0 },
  { id: "Anal Glands", price: 0 },
];

/** Look up the display price string for a service+size, DB pricing first. */
export function priceString(
  serviceId: string,
  size: DogSize,
  pricing?: PricingMap | null,
): string {
  const fromDb = pricing?.[serviceId]?.[size];
  if (typeof fromDb === "string" && fromDb.length > 0) return fromDb;
  return DEFAULT_PRICING[serviceId]?.[size] ?? "";
}

/** True when a service is offered for the given dog size (price ≠ "N/A"). */
export function isServiceAllowedForSize(
  serviceId: string,
  size: DogSize,
  pricing?: PricingMap | null,
): boolean {
  const price = priceString(serviceId, size, pricing);
  return price.length > 0 && price.toUpperCase() !== "N/A";
}

/** "£46+" → "from £46"; "£38" → "from £38"; "" / "N/A" → "". Guide prices are
 *  always shown as "from £X" (the salon never quotes a fixed price up front),
 *  regardless of whether the stored value carries a trailing "+". */
export function priceLabel(price: string): string {
  if (!price || price.toUpperCase() === "N/A") return "";
  const base = price.endsWith("+") ? price.slice(0, -1) : price;
  return `from ${base}`;
}

/** "09:30" → "9:30 am", "13:00" → "1:00 pm". */
export function slotLabel(slot: string): string {
  const [hStr, mStr] = slot.split(":");
  const h = Number(hStr);
  const m = mStr ?? "00";
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}
