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
  buildSlotGrid,
  type DogSize,
  isServiceAllowedForSize,
  LARGE_DOG_CANDIDATE_SLOTS,
  priceLabel,
  priceString,
  type PricingMap,
  SALON_SLOTS,
  SERVICES,
  SLOT_SHAPE,
  slotLabel,
} from "./salonConstants.ts";
import { ADDONS } from "./salonConstants.ts";
import {
  type Booking as CapacityBooking,
  findGroupedSlots,
  type SlotAllocation,
  type SlotOverrides,
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
  // Populated by an atomic reschedule: the rows cancelled in the same
  // transaction that created `ids`.
  cancelledIds?: string[];
  replayed?: boolean;
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
  // Staff seat blocks for the date (day_settings.overrides, run through
  // sanitizeDayOverrides) so the allocator sees the same reduced capacity as
  // the portal's slot picker. {} when the day has no row.
  getDayOverrides(dateStr: string): Promise<Record<string, SlotOverrides>>;
  // Today's staff-flagged "last minute" slots (get_immediate_slots RPC). The
  // server applies the London today + 30-minute cutoff on every call, so a
  // slot drops off this list the moment its cutoff passes.
  getImmediateSlots(): Promise<Array<{ setting_date: string; slot: string }>>;
  insertBookingGroup(
    items: GroupBookingItem[],
    dateStr: string,
    humanId: string,
  ): Promise<GroupInsertResult>;
  // Atomic reschedule: cancels the old visit and creates the replacement in
  // one transaction. Optional because only the Flow endpoint implements it.
  rescheduleBookingGroup?(
    items: GroupBookingItem[],
    dateStr: string,
    humanId: string,
    old: RescheduleSelector,
  ): Promise<GroupInsertResult>;
}

/**
 * Identifies the visit a reschedule is replacing.
 *
 * `expectedOldIds` is the set of booking rows the customer actually reviewed
 * when the Flow opened. The database refuses the move if the visit no longer
 * matches, so a staff edit made mid-Flow cannot cancel dogs the customer never
 * saw.
 */
export interface RescheduleSelector {
  groupId?: string | null;
  bookingId?: string | null;
  expectedOldIds?: string[];
  // The Flow's durable token. The database uses it to serialise concurrent
  // completions and to replay a committed result instead of creating a second
  // replacement.
  flowToken?: string | null;
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

/** Order a set of slot strings chronologically and label them. Not limited
 *  to the canonical grid — a flagged extra slot (e.g. "14:00") must survive
 *  into the Flow's time screen. Zero-padded HH:MM sorts chronologically. */
export function slotOptions(slots: string[]): FlowOption[] {
  return [...new Set(slots)]
    .filter((s) => SLOT_SHAPE.test(s))
    .sort()
    .map((s) => ({ id: s, title: slotLabel(s) }));
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

  // Today only ever appears when staff flagged a last-minute slot (the
  // availability RPCs enforce that server-side) — label it so the customer
  // knows it's a grab-it-now opening. Meta caps data-source titles ~30 chars.
  const todayStr = toDateStr(today);
  return [...new Set(dates)]
    .sort()
    .map((d) => ({
      id: d,
      title: d === todayStr ? "Today — last minute" : formatDateLong(d),
    }));
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
  now: Date = new Date(),
): Promise<FlowOption[]> {
  if (size === "large") {
    // Same-day: only staff-flagged last-minute slots qualify (the
    // small/medium branch below inherits this from the availability RPC).
    let candidates = [...LARGE_DOG_CANDIDATE_SLOTS];
    if (dateStr === toDateStr(now)) {
      const flagged = await immediateSlotSet(db, dateStr);
      candidates = candidates.filter((s) => flagged.has(s));
    }
    return slotOptions(candidates);
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

/**
 * day_settings.overrides straight off the row → the per-slot seat map the
 * capacity engine expects. Prod has known malformed legacy rows (date-keyed
 * slots, numeric seat values) — mirror the get_blocked_seats SQL guards:
 * slot keys HH:MM, seat keys numeric, values "blocked" | "open"; drop the rest.
 */
export function sanitizeDayOverrides(raw: unknown): Record<string, SlotOverrides> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, SlotOverrides> = {};
  for (const [slot, seats] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{2}:\d{2}$/.test(slot)) continue;
    if (!seats || typeof seats !== "object" || Array.isArray(seats)) continue;
    const seatMap: SlotOverrides = {};
    for (const [seatKey, action] of Object.entries(seats as Record<string, unknown>)) {
      if (!/^\d+$/.test(seatKey)) continue;
      if (action !== "blocked" && action !== "open") continue;
      seatMap[Number(seatKey)] = action;
    }
    if (Object.keys(seatMap).length > 0) clean[slot] = seatMap;
  }
  return clean;
}

/** True when EVERY per-dog assignment lands on a flagged last-minute slot —
 *  the calendar trigger validates each inserted row's own slot, so a group
 *  that spills into an unflagged neighbour would be rejected. MIRRORS
 *  src/engine/immediateBooking.ts. */
export function allocationIsImmediate(
  allocation: Pick<SlotAllocation, "assignments">,
  immediateSlots: ReadonlySet<string>,
): boolean {
  return allocation.assignments.every((a) => immediateSlots.has(a.slot));
}

/** The flagged last-minute slots for `dateStr`, as a Set. The date filter
 *  guards a London midnight rollover between the RPC call and its use. */
async function immediateSlotSet(db: FlowDb, dateStr: string): Promise<Set<string>> {
  const rows = await db.getImmediateSlots();
  return new Set(rows.filter((r) => r.setting_date === dateStr).map((r) => r.slot));
}

/** All group allocations (drop-off + per-dog slots) for a date, honouring
 *  staff seat blocks exactly like the portal's slot picker. Same-day runs
 *  on the extended grid (canonical + flagged extra slots) and is filtered
 *  to staff-flagged last-minute slots; future dates stay on the canonical
 *  grid — extra slots reach customers only as same-day openings. Because
 *  confirmGroupBooking re-runs this at CONFIRM, a flag whose cutoff lapsed
 *  while the customer dawdled self-heals into the existing "slot taken"
 *  retry. */
export async function groupAllocations(
  db: FlowDb,
  dogs: Array<{ id: string; size: DogSize }>,
  dateStr: string,
  now: Date = new Date(),
): Promise<SlotAllocation[]> {
  const isToday = dateStr === toDateStr(now);
  const [existing, overrides, flagged] = await Promise.all([
    db.getBookingsForDate(dateStr),
    db.getDayOverrides(dateStr),
    isToday ? immediateSlotSet(db, dateStr) : Promise.resolve(null),
  ]);
  const grid = flagged ? buildSlotGrid([...flagged]) : [...SALON_SLOTS];
  let allocations = findGroupedSlots(dogs, existing as CapacityBooking[], grid, undefined, overrides);
  if (flagged) {
    allocations = allocations.filter((a) => allocationIsImmediate(a, flagged));
  }
  return allocations;
}

/** Bookable drop-off times for a group on a date (one option per drop-off). */
export async function groupSlotOptions(
  db: FlowDb,
  dogs: Array<{ id: string; size: DogSize }>,
  dateStr: string,
  now: Date = new Date(),
): Promise<FlowOption[]> {
  const allocations = await groupAllocations(db, dogs, dateStr, now);
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
  // When present this confirm is a reschedule: the old visit is cancelled and
  // the replacement created in a single database transaction.
  replaces?: RescheduleSelector;
}

export type GroupConfirmResult =
  | {
      ok: true;
      bookingIds: string[];
      cancelledBookingIds?: string[];
      // True when this was a duplicate submission answered from the stored
      // receipt rather than a fresh reschedule.
      replayed?: boolean;
    }
  | {
      ok: false;
      kind: "slot_taken" | "ownership" | "error" | "old_visit_unavailable";
      message: string;
    };

/**
 * Create a 1-4 dog booking group. Re-resolves every dog server-side (pins
 * size, re-checks ownership against humanId), re-runs the allocator to map
 * each dog to a seat for the chosen drop-off, then inserts atomically. A
 * P0001 from the capacity/calendar trigger surfaces as a "slot taken" retry.
 */
export async function confirmGroupBooking(
  db: FlowDb,
  input: GroupConfirmInput,
  now: Date = new Date(),
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
  // seat since the time screen, or a same-day slot's last-minute flag /
  // cutoff lapsed), bounce to a retry.
  const allocations = await groupAllocations(db, resolvedDogs, input.dateStr, now);
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

  // A reschedule writes through the atomic RPC so a failure can never leave
  // the customer with both the old and the new appointment. Everything above
  // this line — ownership, authoritative size, allocation — is shared.
  const res = input.replaces
    ? await db.rescheduleBookingGroup!(items, input.dateStr, input.humanId, input.replaces)
    : await db.insertBookingGroup(items, input.dateStr, input.humanId);
  if (res.ids?.length) {
    return {
      ok: true,
      bookingIds: res.ids,
      cancelledBookingIds: res.cancelledIds,
      replayed: res.replayed ?? false,
    };
  }

  // The old visit is gone or no longer matches what the customer reviewed.
  // Nothing was created and nothing was cancelled.
  if (res.errorCode === RESCHEDULE_UNAVAILABLE_SQLSTATE) {
    return {
      ok: false,
      kind: "old_visit_unavailable",
      message: "That booking has changed since you opened this. Please start again.",
    };
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
// reschedule_whatsapp_booking_group raises P0002 when the old visit is
// unavailable or no longer matches the reviewed snapshot.
const RESCHEDULE_UNAVAILABLE_SQLSTATE = "P0002";

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
