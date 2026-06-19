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

/** "£46+" → "from £46"; "£38" → "£38"; "" / "N/A" → "". */
export function priceLabel(price: string): string {
  if (!price || price.toUpperCase() === "N/A") return "";
  return price.endsWith("+") ? `from ${price.slice(0, -1)}` : price;
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
