// ============================================================
// supabase/functions/_shared/flowBooking.ts
//
// The booking "adapter" for the WhatsApp Flow endpoint, expressed as
// pure logic behind a small injected FlowDb interface — same pattern
// as _shared/confirmButtons.ts. All IO (Supabase queries, RPCs,
// inserts) is hidden behind FlowDb so this module runs and unit-tests
// in plain Node (Vitest) with a fake, while the Deno endpoint supplies
// a Supabase-backed implementation.
//
// Maps onto the existing schema (no new domain tables):
//   - customers  → humans            (owner reached via dogs.human_id)
//   - pets       → dogs
//   - services   → code constants + salon_config.pricing (priced BY SIZE)
//   - slots      → bookings.slot (HH:MM) on the 08:30–13:00 grid
//   - groomers   → none (2-2-1 seat model)
//   - capacity   → enforced by the DB BEFORE INSERT trigger
// ============================================================

import {
  type DogSize,
  isServiceAllowedForSize,
  LARGE_DOG_CANDIDATE_SLOTS,
  priceLabel,
  priceString,
  type PricingMap,
  SALON_SLOTS,
  SERVICES,
  slotLabel,
} from "./salonConstants.ts";
import { ADDONS } from "./salonConstants.ts";

// ── Row shapes (the subset of columns we read/write) ───────────

export interface HumanRow {
  id: string;
  name: string | null;
  surname: string | null;
  phone: string | null;
}

export interface DogRow {
  id: string;
  name: string;
  breed: string | null;
  size: DogSize;
  human_id: string;
}

export interface AvailabilitySlot {
  booking_date: string; // YYYY-MM-DD
  slot: string; // HH:MM
}

export interface LargeDogDay {
  booking_date: string;
  has_capacity: boolean;
}

export interface BookingInsert {
  booking_date: string;
  slot: string;
  dog_id: string;
  size: DogSize;
  service: string;
  status: string;
  confirmed: boolean;
  addons: string[];
  source: string;
}

export interface InsertResult {
  id?: string;
  errorCode?: string;
  errorMessage?: string;
}

// ── Injected IO surface ────────────────────────────────────────

export interface FlowDb {
  getHumanByPhone(phoneE164: string): Promise<HumanRow | null>;
  getDogsByHuman(humanId: string): Promise<DogRow[]>;
  getDogById(dogId: string): Promise<DogRow | null>;
  getPricing(): Promise<PricingMap | null>;
  getSmallMediumAvailability(fromDate: string, toDate: string): Promise<AvailabilitySlot[]>;
  getLargeDogDays(fromDate: string, toDate: string): Promise<LargeDogDay[]>;
  insertBooking(row: BookingInsert): Promise<InsertResult>;
}

// ── Flow option shape (RadioButtons/Checkbox data-source) ───────

export interface FlowOption {
  id: string;
  title: string;
  description?: string;
}

// ── Pure formatting helpers ────────────────────────────────────

const LONDON = "Europe/London";

/** "2026-06-02" → "Tuesday 2 June" (salon-local, no TZ rollover). */
export function formatDateLong(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: LONDON,
  }).format(d);
}

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function petOptions(dogs: DogRow[]): FlowOption[] {
  return dogs.map((d) => ({
    id: d.id,
    title: d.name,
    description: [d.breed, titleCase(d.size)].filter(Boolean).join(" · "),
  }));
}

export function serviceOptions(size: DogSize, pricing: PricingMap | null): FlowOption[] {
  return SERVICES.filter((s) => isServiceAllowedForSize(s.id, size, pricing)).map((s) => ({
    id: s.id,
    title: s.name,
    description: priceLabel(priceString(s.id, size, pricing)),
  }));
}

export function addonOptions(): FlowOption[] {
  return ADDONS.map((a) => ({
    id: a.id,
    title: a.id,
    description: a.price > 0 ? `+£${a.price}` : "",
  }));
}

export function serviceName(serviceId: string): string {
  return SERVICES.find((s) => s.id === serviceId)?.name ?? serviceId;
}

/** Order a set of slot strings by the canonical grid and label them. */
export function slotOptions(slots: string[]): FlowOption[] {
  const present = new Set(slots);
  return SALON_SLOTS.filter((s) => present.has(s)).map((s) => ({
    id: s,
    title: slotLabel(s),
  }));
}

export function bookingSummary(args: {
  dogName: string;
  serviceId: string;
  size: DogSize;
  pricing: PricingMap | null;
  addons: string[];
  dateStr: string;
  slot: string;
}): string {
  const price = priceLabel(priceString(args.serviceId, args.size, args.pricing));
  const lines = [
    `${args.dogName} — ${serviceName(args.serviceId)}`,
    `${formatDateLong(args.dateStr)} at ${slotLabel(args.slot)}`,
  ];
  if (args.addons.length) lines.push(`Add-ons: ${args.addons.join(", ")}`);
  if (price) lines.push(price.startsWith("from") ? price.replace(/^from /, "From ") : price);
  return lines.join("\n");
}

// ── Date math (salon-local) ────────────────────────────────────

/** YYYY-MM-DD for a Date in the salon timezone. */
export function toDateStr(d: Date): string {
  // en-CA yields ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: LONDON }).format(d);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Orchestration (FlowDb-driven) ──────────────────────────────

export async function listPetOptions(db: FlowDb, humanId: string): Promise<FlowOption[]> {
  const dogs = await db.getDogsByHuman(humanId);
  return petOptions(dogs);
}

/**
 * Available drop-off days for a dog of `size`, from `today` for `windowDays`.
 * Small/medium come from get_small_medium_availability (per-slot, so a day
 * with any free slot is offered). Large come from the per-day large RPC.
 */
export async function availableDateOptions(
  db: FlowDb,
  size: DogSize,
  today: Date,
  windowDays = 60,
): Promise<FlowOption[]> {
  const from = toDateStr(today);
  const to = addDays(from, windowDays);

  let dates: string[];
  if (size === "large") {
    const rows = await db.getLargeDogDays(from, to);
    dates = rows.filter((r) => r.has_capacity).map((r) => r.booking_date);
  } else {
    const rows = await db.getSmallMediumAvailability(from, to);
    dates = [...new Set(rows.map((r) => r.booking_date))];
  }

  return [...new Set(dates)]
    .sort()
    .map((d) => ({ id: d, title: formatDateLong(d) }));
}

/**
 * Bookable drop-off times for a date. Small/medium are exact (from the
 * availability RPC). Large returns the candidate large-dog slots — the
 * per-slot large rules are complex and remain enforced by the capacity
 * trigger, which surfaces as a "slot taken" retry if a candidate is in
 * fact unavailable. (Per-slot large precision is a documented follow-up.)
 */
export async function availableSlotOptions(
  db: FlowDb,
  size: DogSize,
  dateStr: string,
): Promise<FlowOption[]> {
  if (size === "large") {
    return slotOptions([...LARGE_DOG_CANDIDATE_SLOTS]);
  }
  const rows = await db.getSmallMediumAvailability(dateStr, dateStr);
  return slotOptions(rows.filter((r) => r.booking_date === dateStr).map((r) => r.slot));
}

export interface ConfirmInput {
  humanId: string;
  dogId: string;
  serviceId: string;
  dateStr: string;
  slot: string;
  addons: string[];
}

export type ConfirmResult =
  | { ok: true; bookingId: string; size: DogSize }
  | { ok: false; kind: "slot_taken" | "ownership" | "error"; message: string };

const CAPACITY_TRIGGER_SQLSTATE = "P0001";

export async function confirmBooking(db: FlowDb, input: ConfirmInput): Promise<ConfirmResult> {
  // Re-resolve the dog server-side: it pins the size (not client-supplied)
  // and re-checks ownership under the service role, where RLS won't.
  const dog = await db.getDogById(input.dogId);
  if (!dog || dog.human_id !== input.humanId) {
    return { ok: false, kind: "ownership", message: "That dog isn't on your file." };
  }

  const result = await db.insertBooking({
    booking_date: input.dateStr,
    slot: input.slot,
    dog_id: dog.id,
    size: dog.size,
    service: input.serviceId,
    status: "Booked",
    confirmed: false,
    addons: input.addons,
    source: "whatsapp_flow",
  });

  if (result.id) return { ok: true, bookingId: result.id, size: dog.size };

  if (result.errorCode === CAPACITY_TRIGGER_SQLSTATE) {
    return {
      ok: false,
      kind: "slot_taken",
      message: result.errorMessage || "That slot was just taken — please pick another time.",
    };
  }
  return {
    ok: false,
    kind: "error",
    message: result.errorMessage || "Couldn't save the booking.",
  };
}

/** Short, human-friendly booking reference derived from the row id. */
export function bookingRef(bookingId: string): string {
  return `SD-${bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
