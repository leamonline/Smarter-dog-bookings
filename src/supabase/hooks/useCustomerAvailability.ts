// Data hook for the booking wizard's date and slot steps (Debt #12): binds
// the customer Supabase client to the availability repositories so
// DateSelection.tsx and SlotSelection.tsx never import the client themselves.
// It returns raw repository results on purpose — the two screens keep their
// own error handling and capacity-engine composition, which is where the
// domain reasoning (and its tests) already live.
import { customerSupabase } from "../customerClient";
import {
  listBlockedSeats,
  listImmediateSlots,
  listOnDateForCapacity,
  listRangeForCapacity,
} from "../repositories/bookingsRepo";
import { getBookingRules, type HumanBookingRules } from "../repositories/humansRepo";
import { getOpenDays } from "../rpc";

// get_blocked_seats is read in two-week windows so a 28-day page never asks
// the RPC for more than it is tuned to return in one call.
const BLOCKED_SEAT_CHUNK_DAYS = 14;

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function blockedSeatChunks(
  startDate: string,
  endDate: string,
): Array<{ startDate: string; endDate: string }> {
  const chunks: Array<{ startDate: string; endDate: string }> = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const finalDate = new Date(`${endDate}T00:00:00`);
  while (cursor <= finalDate) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + BLOCKED_SEAT_CHUNK_DAYS - 1);
    if (chunkEnd > finalDate) chunkEnd.setTime(finalDate.getTime());
    chunks.push({
      startDate: toLocalDateStr(chunkStart),
      endDate: toLocalDateStr(chunkEnd),
    });
    cursor.setTime(chunkEnd.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
}

type Client = NonNullable<typeof customerSupabase>;

function requireClient(): Client {
  if (!customerSupabase) throw new Error("Not connected");
  return customerSupabase;
}

/** Everything the slot step reads for one date, fetched in parallel. */
export async function loadDayAvailability(date: string, humanId?: string) {
  const client = requireClient();
  return Promise.all([
    // Full occupancy via the get_slot_occupancy SECURITY DEFINER RPC — the
    // per-customer bookings RLS would otherwise hide other customers'
    // bookings and let full slots show as available.
    listOnDateForCapacity(client, date),
    // Blocked seats (staff overrides): day_settings is staff-only, so without
    // this the engine can't see a blocked seat and would offer it. Degrades
    // to {} on error.
    listBlockedSeats(client, date, date),
    listImmediateSlots(client),
    // Per-human rules (null = none / fetch failed — fail open, the DB trigger
    // is the authority on blocked slots).
    humanId ? getBookingRules(client, humanId) : Promise.resolve<HumanBookingRules | null>(null),
  ] as const);
}

/** Today's staff-flagged "last minute" slots. */
export async function loadImmediateSlots() {
  return listImmediateSlots(requireClient());
}

/** Everything the date step reads for one calendar page, fetched in parallel. */
export async function loadPageAvailability(rangeStart: string, rangeEnd: string) {
  const client = requireClient();
  return Promise.all([
    getOpenDays(client, { startDate: rangeStart, endDate: rangeEnd }),
    listRangeForCapacity(client, rangeStart, rangeEnd),
    Promise.all(
      blockedSeatChunks(rangeStart, rangeEnd).map((chunk) =>
        listBlockedSeats(client, chunk.startDate, chunk.endDate),
      ),
    ),
  ] as const);
}

const availability = {
  /** False in sample-data mode or before credentials exist; the loaders throw. */
  get connected(): boolean {
    return Boolean(customerSupabase);
  },
  loadDayAvailability,
  loadImmediateSlots,
  loadPageAvailability,
};

export type CustomerAvailability = typeof availability;

/**
 * The client is a module constant, so the returned object is a stable
 * singleton — safe to list in effect dependency arrays.
 */
export function useCustomerAvailability(): CustomerAvailability {
  return availability;
}
