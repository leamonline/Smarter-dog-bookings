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
import {
  type Booking as CapacityBooking,
  findGroupedSlots,
  type SlotAllocation,
} from "./capacity.ts";

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

/** Existing booking on a date — the slim shape the 2-2-1 engine reads. */
export interface ExistingBooking {
  slot: string;
  size: DogSize;
}

/** One dog's row in a multi-dog group insert (per-dog slot from the allocator). */
export interface GroupBookingItem {
  dog_id: string;
  size: DogSize;
  service: string;
  slot: string;
  addons: string[];
}

export interface GroupInsertResult {
  ids?: string[];
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
  // Multi-dog path: all active bookings on a date (service role bypasses RLS)
  // feed the 2-2-1 group allocator; the group insert goes through the
  // create_whatsapp_booking_group RPC (atomic, shared group_id).
  getBookingsForDate(dateStr: string): Promise<ExistingBooking[]>;
  insertBookingGroup(
    items: GroupBookingItem[],
    dateStr: string,
    humanId: string,
  ): Promise<GroupInsertResult>;
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

/** Multi-dog CONFIRM summary: the day/time once, then a line per dog. */
export function bookingGroupSummary(args: {
  dogs: Array<{ dogName: string; serviceId: string; size: DogSize; addons: string[] }>;
  pricing: PricingMap | null;
  dateStr: string;
  dropOff: string;
}): string {
  const lines = [`${formatDateLong(args.dateStr)} at ${slotLabel(args.dropOff)}`, ""];
  for (const d of args.dogs) {
    const price = priceLabel(priceString(d.serviceId, d.size, args.pricing));
    let line = `${d.dogName} — ${serviceName(d.serviceId)}`;
    if (price) line += ` (${price})`;
    lines.push(line);
    if (d.addons.length) lines.push(`  Add-ons: ${d.addons.join(", ")}`);
  }
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

// ── Multi-dog orchestration (mirrors the portal wizard) ────────
//
// A group is 1-4 of the customer's dogs booked in one visit. Drop-off
// times and per-dog slot assignments come from the SAME 2-2-1 engine the
// portal uses (findGroupedSlots over all active bookings on the date — the
// service role bypasses RLS, so a plain select sees every customer's row).
// The write goes through create_whatsapp_booking_group (atomic, one shared
// group_id); the capacity + calendar triggers remain the hard guard.

/** A "size for the day-availability filter" for a mixed-size group. */
function groupDaySize(sizes: DogSize[]): DogSize {
  return sizes.some((s) => s === "large") ? "large" : "small";
}

/**
 * Days a group can be dropped off, from `today` for `windowDays`. Day-level
 * only — uses the existing availability RPCs with the group's most-constrained
 * size; the exact per-slot group fit is resolved on the time screen
 * (groupSlotOptions) and finally by the insert trigger.
 */
export async function availableGroupDateOptions(
  db: FlowDb,
  dogs: Array<{ id: string; size: DogSize }>,
  today: Date,
  windowDays = 60,
): Promise<FlowOption[]> {
  return availableDateOptions(db, groupDaySize(dogs.map((d) => d.size)), today, windowDays);
}

/** All group allocations (drop-off + per-dog slots) for a date. */
export async function groupAllocations(
  db: FlowDb,
  dogs: Array<{ id: string; size: DogSize }>,
  dateStr: string,
): Promise<SlotAllocation[]> {
  const existing = await db.getBookingsForDate(dateStr);
  return findGroupedSlots(dogs, existing as CapacityBooking[], [...SALON_SLOTS]);
}

/** Bookable drop-off times for a group on a date (one option per drop-off). */
export async function groupSlotOptions(
  db: FlowDb,
  dogs: Array<{ id: string; size: DogSize }>,
  dateStr: string,
): Promise<FlowOption[]> {
  const allocations = await groupAllocations(db, dogs, dateStr);
  return slotOptions(allocations.map((a) => a.dropOffTime));
}

export interface GroupConfirmDog {
  dogId: string;
  serviceId: string;
  addons: string[];
}

export interface GroupConfirmInput {
  humanId: string;
  dogs: GroupConfirmDog[]; // in the order the customer selected them
  dateStr: string;
  dropOff: string; // the chosen drop-off time
}

export type GroupConfirmResult =
  | { ok: true; bookingIds: string[] }
  | { ok: false; kind: "slot_taken" | "ownership" | "error"; message: string };

/**
 * Create a 1-4 dog booking group. Re-resolves every dog server-side (pins
 * size, re-checks ownership against humanId), re-runs the allocator to map
 * each dog to a seat for the chosen drop-off, then inserts atomically. A
 * P0001 from the capacity/calendar trigger surfaces as a "slot taken" retry.
 */
export async function confirmGroupBooking(
  db: FlowDb,
  input: GroupConfirmInput,
): Promise<GroupConfirmResult> {
  if (!input.dogs.length || input.dogs.length > 4) {
    return { ok: false, kind: "error", message: "Pick between 1 and 4 dogs." };
  }

  // Re-resolve every dog under the service role (RLS-bypassing): pins the
  // authoritative size and re-checks ownership. Never trust the session's
  // claimed size.
  const sizeByDog = new Map<string, DogSize>();
  for (const d of input.dogs) {
    const dog = await db.getDogById(d.dogId);
    if (!dog || dog.human_id !== input.humanId) {
      return { ok: false, kind: "ownership", message: "One of those dogs isn't on your file." };
    }
    sizeByDog.set(d.dogId, dog.size);
  }

  const resolvedDogs = input.dogs.map((d) => ({ id: d.dogId, size: sizeByDog.get(d.dogId)! }));

  // Find the allocation for the chosen drop-off. If it's gone (someone took a
  // seat since the time screen), bounce to a retry.
  const allocations = await groupAllocations(db, resolvedDogs, input.dateStr);
  const allocation = allocations.find((a) => a.dropOffTime === input.dropOff);
  if (!allocation) {
    return {
      ok: false,
      kind: "slot_taken",
      message: "That time was just taken — please pick another.",
    };
  }

  const serviceByDog = new Map(input.dogs.map((d) => [d.dogId, d]));
  const items: GroupBookingItem[] = allocation.assignments.map((a) => {
    const dog = serviceByDog.get(a.dogId)!;
    return {
      dog_id: a.dogId,
      size: sizeByDog.get(a.dogId)!,
      service: dog.serviceId,
      slot: a.slot,
      addons: dog.addons,
    };
  });

  const res = await db.insertBookingGroup(items, input.dateStr, input.humanId);
  if (res.ids?.length) {
    return { ok: true, bookingIds: res.ids };
  }

  if (res.errorCode === CAPACITY_TRIGGER_SQLSTATE) {
    return {
      ok: false,
      kind: "slot_taken",
      message: res.errorMessage || "That slot was just taken — please pick another time.",
    };
  }
  return {
    ok: false,
    kind: "error",
    message: res.errorMessage || "Couldn't save the booking.",
  };
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
