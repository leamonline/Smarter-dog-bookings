// ============================================================
// supabase/functions/_shared/manageBooking.ts
//
// Pure logic for WhatsApp manage-booking (Flow C: cancel & reschedule).
// All IO (DB queries, sends) stays in the agent / endpoint; this module is
// pure so it unit-tests in plain Node (Vitest):
//   - group a customer's upcoming bookings into "visits" (whole-group unit)
//   - salon-local 24h cut-off arithmetic (the one place timezones bite)
//   - list-row id encode/parse (manage:<nonce>:<visit_key>)
//   - visit summaries + the reschedule Flow pre-seed
//
// Granularity is the whole VISIT: every booking row sharing a group_id is one
// visit; a single-dog booking is a visit of one. Cancel/reschedule never act
// on an individual dog within a group.
// ============================================================

import { type DogSize, SERVICES, slotLabel } from "./salonConstants.ts";

const LONDON = "Europe/London";

// ── Row + visit shapes ─────────────────────────────────────────

/** A booking row as fetched by the agent (bookings JOIN dogs). */
export interface ManageBookingRow {
  id: string;
  group_id: string | null;
  booking_date: string; // YYYY-MM-DD
  slot: string; // HH:MM
  service: string | null;
  dog_id: string;
  dog_name: string;
  size?: DogSize | null;
}

export interface VisitDog {
  id: string;
  name: string;
}

export interface VisitService {
  dogId: string;
  serviceId?: string;
  serviceName?: string;
}

/** One upcoming visit (the whole group / single booking). `key` is the stable
 *  routing token; execution always anchors on a real bookingId. */
export interface UpcomingVisit {
  key: string;
  groupId: string | null;
  bookingIds: string[];
  date: string; // YYYY-MM-DD
  slot: string; // HH:MM (drop-off — earliest in the group)
  startAt: string; // absolute ISO instant of the salon-local drop-off
  dogs: VisitDog[];
  services: VisitService[];
  label: string; // "Alfie & Tipi's groom on Wed 24 Jun at 9:30"
}

// ── Service name lookup ────────────────────────────────────────

export function serviceName(serviceId: string | null | undefined): string {
  if (!serviceId) return "groom";
  return SERVICES.find((s) => s.id === serviceId)?.name ?? serviceId;
}

// ── Salon-local time ───────────────────────────────────────────

/** Europe/London UTC offset (minutes ahead of UTC) at instant `d`: 0 in
 *  winter (GMT), 60 in summer (BST). */
function londonOffsetMinutes(d: Date): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(d)) p[part.type] = part.value;
  // Some runtimes format midnight as "24"; normalise to "00".
  const hour = p.hour === "24" ? "00" : p.hour;
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +hour, +p.minute, +p.second);
  return (asIfUtc - d.getTime()) / 60000;
}

/** The absolute instant of a salon-local (London) date+slot wall-clock time.
 *  Handles GMT/BST; refines once across a DST boundary. */
export function visitStartInstant(dateStr: string, slot: string): Date {
  const slotHHMM = /^\d{1,2}:\d{2}$/.test(slot) ? slot : "00:00";
  const guess = new Date(`${dateStr}T${slotHHMM.padStart(5, "0")}:00Z`); // wall time as if UTC
  const off1 = londonOffsetMinutes(guess);
  let inst = new Date(guess.getTime() - off1 * 60000);
  const off2 = londonOffsetMinutes(inst);
  if (off2 !== off1) inst = new Date(guess.getTime() - off2 * 60000);
  return inst;
}

/** Today's date (YYYY-MM-DD) in the salon timezone. */
export function salonToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LONDON }).format(now);
}

/**
 * True when the visit is inside the 24h self-service cut-off (i.e. BLOCKED).
 *   - 24h + 1 min away → false (allowed)
 *   - exactly 24h away → false (allowed)
 *   - 23h 59m away     → true  (blocked)
 */
export function isInsideManageCutoff(visitStart: Date, now: Date): boolean {
  return visitStart.getTime() < now.getTime() + 24 * 60 * 60 * 1000;
}

// ── Pretty formatting ──────────────────────────────────────────

/** "Wed 24 Jun at 9:30" (salon-local). */
export function formatVisitWhen(dateStr: string, slot: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: LONDON,
  }).format(d);
  return `${day} at ${slotLabel(slot).replace(/ (am|pm)$/, "")}`;
}

/** "Alfie", "Alfie & Tipi", "Alfie, Tipi & Bella". */
export function joinNames(names: string[]): string {
  const clean = names.filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "your dog";
  if (clean.length === 2) return `${clean[0]} & ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} & ${clean[clean.length - 1]}`;
}

/** "Alfie & Tipi's groom on Wed 24 Jun at 9:30" */
export function summariseVisit(dogs: VisitDog[], dateStr: string, slot: string): string {
  return `${joinNames(dogs.map((d) => d.name))}'s groom on ${formatVisitWhen(dateStr, slot)}`;
}

// ── Grouping ───────────────────────────────────────────────────

/**
 * Group raw upcoming booking rows into visits. Rows are expected to already be
 * filtered server-side to status='Booked' and future dates and owned by the
 * customer; this is pure shaping. A single booking with no group_id becomes a
 * visit of one. Visits are ordered soonest-first.
 */
export function groupUpcomingBookings(rows: ManageBookingRow[]): UpcomingVisit[] {
  const byKey = new Map<string, ManageBookingRow[]>();
  for (const r of rows) {
    // Whole-visit key: the real group_id, or a per-booking solo key.
    const key = r.group_id ?? `solo:${r.id}`;
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }

  const visits: UpcomingVisit[] = [];
  for (const [key, group] of byKey) {
    // Drop-off = the earliest slot in the group.
    const sorted = [...group].sort((a, b) => a.slot.localeCompare(b.slot));
    const date = sorted[0].booking_date;
    const slot = sorted[0].slot;
    const dogs: VisitDog[] = sorted.map((r) => ({ id: r.dog_id, name: r.dog_name }));
    const services: VisitService[] = sorted.map((r) => ({
      dogId: r.dog_id,
      serviceId: r.service ?? undefined,
      serviceName: serviceName(r.service),
    }));
    visits.push({
      key,
      groupId: sorted[0].group_id,
      bookingIds: sorted.map((r) => r.id),
      date,
      slot,
      startAt: visitStartInstant(date, slot).toISOString(),
      dogs,
      services,
      label: summariseVisit(dogs, date, slot),
    });
  }

  return visits.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

// ── List-row id (nonce-backed) ─────────────────────────────────

/** Build a manage list-row id: `manage:<nonce>:<visit_key>`. The nonce maps to
 *  a server-side whatsapp_manage_sessions row; the visit_key picks the visit. */
export function manageRowId(nonce: string, visitKey: string): string {
  return `manage:${nonce}:${visitKey}`;
}

export function parseManageRowId(id: string | null | undefined): { nonce: string; visitKey: string } | null {
  if (!id) return null;
  const m = id.match(/^manage:([^:]+):(.+)$/);
  if (!m) return null;
  return { nonce: m[1], visitKey: m[2] };
}

// ── Reschedule Flow pre-seed ───────────────────────────────────

/** The flow session `initial_state` for a reschedule: the same dogs + services
 *  locked in, the old visit captured as a snapshot to cancel after the new
 *  booking is created. The Flow opens on SELECT_DATE. */
export interface RescheduleInitialState {
  dog_ids: string[];
  dog_meta: Record<string, { name: string; size: DogSize }>;
  services: Record<string, string>;
  flow_mode: "reschedule";
  reschedule_group_id: string | null;
  reschedule_booking_id: string;
  old_booking_ids: string[];
  old_date: string;
  old_slot: string;
  old_start_at: string;
  // Frozen snapshot for strict re-validation at CONFIRM.
  service_snapshot: Record<string, string>;
  dog_snapshot: string[];
}

export function buildRescheduleInitialState(
  visit: UpcomingVisit,
  dogSizes: Record<string, DogSize>,
): RescheduleInitialState {
  const dog_meta: Record<string, { name: string; size: DogSize }> = {};
  const services: Record<string, string> = {};
  for (const dog of visit.dogs) {
    dog_meta[dog.id] = { name: dog.name, size: dogSizes[dog.id] ?? "small" };
  }
  for (const s of visit.services) {
    if (s.serviceId) services[s.dogId] = s.serviceId;
  }
  return {
    dog_ids: visit.dogs.map((d) => d.id),
    dog_meta,
    services,
    flow_mode: "reschedule",
    reschedule_group_id: visit.groupId,
    reschedule_booking_id: visit.bookingIds[0],
    old_booking_ids: visit.bookingIds,
    old_date: visit.date,
    old_slot: visit.slot,
    old_start_at: visit.startAt,
    service_snapshot: { ...services },
    dog_snapshot: [...visit.dogs.map((d) => d.id)].sort(),
  };
}
