// Bookings repository for the customer surface. Each method maps DB
// rows ("snake_case", joined columns) into app-shaped values
// (camelCase, ready for the engine / UI) so React components don't
// have to know the underlying table schema.
//
// Server-side: bookings live in public.bookings, with RLS that lets
// authenticated customers read/insert/update only their own rows
// (linked via humans.customer_user_id).
import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_STATUS } from "../../constants/salon";
import type { Booking } from "../../types/index";
import { createCustomerBookingGroup, getSlotOccupancy, getOccupancyRange } from "../rpc";

export interface CreateBookingInput {
  bookingDate: string;
  slot: string;
  dogId: string;
  size: string;
  service: string;
  status?: string;
  confirmed?: boolean;
  addons?: string[];
  payment?: string;
  groupId?: string | null;
}

// Build the minimal Booking the capacity engine reads. The engine only
// looks at `slot` and `size` (see src/engine/capacity.ts); every other
// field is inert filler so the object satisfies the Booking type. PII
// (names, owner, pickup) is intentionally absent — it never leaves the
// server for this path. Rows arrive already filtered to non-cancelled,
// so labelling them BOOKED keeps the object internally honest.
function occupancyRowToBooking(row: { slot: string; size: string }): Booking {
  return {
    id: "",
    slot: row.slot,
    size: row.size as Booking["size"],
    dogName: "",
    breed: "",
    service: "" as Booking["service"],
    owner: "",
    status: BOOKING_STATUS.BOOKED as Booking["status"],
    addons: [],
    pickupBy: "",
    payment: "",
    confirmed: false,
    dogNameSnapshot: null,
    breedSnapshot: null,
    ownerNameSnapshot: null,
    whatsappConversationId: null,
    whatsappMessageId: null,
    staffCapacityOverride: false,
    staffCapacityOverrideBy: null,
    staffCapacityOverrideAt: null,
    reminderConfirmedAt: null,
    _dogId: "",
    _ownerId: null,
    _pickupById: null,
    _bookingDate: "",
    _groupId: null,
  };
}

// Read (slot, size) for non-cancelled bookings on a date, mapped into
// the engine's Booking[] shape. Backed by the get_slot_occupancy
// SECURITY DEFINER RPC so the customer client sees the FULL occupancy —
// the per-customer bookings RLS would otherwise hide other customers'
// rows, making availability calculate from incomplete data. Used by
// both the slot picker (SlotSelection) and the wizard's pre-insert
// capacity recheck.
export async function listOnDateForCapacity(
  client: SupabaseClient,
  dateStr: string,
): Promise<{ bookings: Booking[]; error: Error | null }> {
  const { data, error } = await getSlotOccupancy(client, dateStr);
  if (error) return { bookings: [], error: new Error(error.message) };
  const rows = (data ?? []) as Array<{ slot: string; size: string }>;
  return { bookings: rows.map(occupancyRowToBooking), error: null };
}

// Range sibling of listOnDateForCapacity: full non-cancelled occupancy for a
// date range, grouped by date and mapped into the engine's Booking[] shape.
// Lets the date step run the capacity engine per day to dim days the selected
// dogs can't be booked into. Backed by the get_occupancy_range SECURITY
// DEFINER RPC (same no-PII contract as get_slot_occupancy).
export async function listRangeForCapacity(
  client: SupabaseClient,
  startDate: string,
  endDate: string,
): Promise<{ byDate: Record<string, Booking[]>; error: Error | null }> {
  const { data, error } = await getOccupancyRange(client, { startDate, endDate });
  if (error) return { byDate: {}, error: new Error(error.message) };
  const rows = (data ?? []) as Array<{ booking_date: string; slot: string; size: string }>;
  const byDate: Record<string, Booking[]> = {};
  for (const row of rows) {
    (byDate[row.booking_date] ??= []).push(occupancyRowToBooking(row));
  }
  return { byDate, error: null };
}

// Resolve a "cancel one or cancel the whole group" intent to an array
// of booking IDs. Returns at minimum the fallback ID so callers can
// stay branch-free.
export async function listIdsInGroup(
  client: SupabaseClient,
  { groupId, fallbackId }: { groupId: string | null | undefined; fallbackId: string },
): Promise<string[]> {
  if (!groupId) return [fallbackId];
  const { data } = await client
    .from("bookings")
    .select("id")
    .eq("group_id", groupId);
  const ids = (data ?? []).map((r: { id: string }) => r.id);
  return ids.length > 0 ? ids : [fallbackId];
}

// Insert a group of bookings (one row per dog) and return the inserted IDs.
// Routes through the create_customer_booking_group SECURITY DEFINER RPC
// rather than a raw INSERT: the RPC verifies the caller owns every dog,
// takes the authoritative size from the dog record, assigns the group_id
// server-side, and inserts atomically. Calendar safety (open/future/
// unblocked day) and seat capacity are enforced by the bookings triggers,
// which raise P0001 — preserved on `error.code` below so the wizard's
// capacity/calendar error matcher still fires. All rows share one date
// (a group is always a single day); status/confirmed are set by the RPC.
export async function createMany(
  client: SupabaseClient,
  inputs: CreateBookingInput[],
): Promise<{ ids: string[]; error: { code?: string; message: string } | null }> {
  if (inputs.length === 0) return { ids: [], error: null };

  const { data, error } = await createCustomerBookingGroup(client, {
    bookingDate: inputs[0].bookingDate,
    bookings: inputs.map((input) => ({
      dog_id: input.dogId,
      slot: input.slot,
      service: input.service,
      size: input.size,
      addons: input.addons ?? [],
      payment: input.payment ?? "Due at Pick-up",
    })),
  });
  if (error) {
    return {
      ids: [],
      error: { code: (error as { code?: string }).code, message: error.message },
    };
  }
  return {
    ids: ((data ?? []) as Array<{ id: string }>).map((row) => row.id),
    error: null,
  };
}

// Soft-cancel an array of booking IDs with a reason string. Used by
// the reschedule flow (cancel originals once the new booking is
// inserted) and the customer dashboard's cancel button.
export async function cancelMany(
  client: SupabaseClient,
  { ids, reason }: { ids: string[]; reason: string },
): Promise<{ error: Error | null }> {
  if (ids.length === 0) return { error: null };
  const { error } = await client
    .from("bookings")
    .update({ status: BOOKING_STATUS.CANCELLED, cancel_reason: reason })
    .in("id", ids);
  return { error: error ? new Error(error.message) : null };
}

// Customer asks to be told if a slot frees up on a given date.
export async function joinWaitlist(
  client: SupabaseClient,
  { humanId, targetDate }: { humanId: string; targetDate: string },
): Promise<{ error: Error | null }> {
  const { error } = await client.from("waitlist_entries").insert({
    human_id: humanId,
    target_date: targetDate,
  });
  return { error: error ? new Error(error.message) : null };
}
