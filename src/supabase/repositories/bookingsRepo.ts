// Bookings repository for the customer surface. Each method maps DB
// rows ("snake_case", joined columns) into app-shaped values
// (camelCase, ready for the engine / UI) so React components don't
// have to know the underlying table schema.
//
// Server-side: bookings live in public.bookings, with RLS that lets
// authenticated customers read/insert/update only their own rows
// (linked via humans.customer_user_id).
import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_STATUS } from "../../constants/salon.js";
import type { Booking } from "../../types/index.js";

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

interface DbBookingRow {
  id: string;
  slot: string;
  size: string;
  service: string;
  status: string;
  addons: string[] | null;
  payment: string | null;
  confirmed: boolean | null;
  dog_id: string;
  pickup_by_id: string | null;
  booking_date: string;
  group_id?: string | null;
}

function dbRowToCapacityBooking(row: DbBookingRow): Booking {
  return {
    id: row.id,
    slot: row.slot,
    size: row.size as Booking["size"],
    dogName: "",
    breed: "",
    service: row.service as Booking["service"],
    owner: "",
    status: row.status as Booking["status"],
    addons: row.addons ?? [],
    pickupBy: "",
    payment: row.payment ?? "",
    confirmed: row.confirmed ?? false,
    dogNameSnapshot: null,
    breedSnapshot: null,
    ownerNameSnapshot: null,
    whatsappConversationId: null,
    whatsappMessageId: null,
    staffCapacityOverride: false,
    staffCapacityOverrideBy: null,
    staffCapacityOverrideAt: null,
    _dogId: row.dog_id,
    _ownerId: null,
    _pickupById: row.pickup_by_id ?? null,
    _bookingDate: row.booking_date,
    _groupId: row.group_id ?? null,
  };
}

// Read bookings for a single date in the engine's expected Booking[]
// shape. The customer wizard uses this for a last-second capacity
// recheck before insert.
export async function listOnDateForCapacity(
  client: SupabaseClient,
  dateStr: string,
): Promise<{ bookings: Booking[]; error: Error | null }> {
  const { data, error } = await client
    .from("bookings")
    .select(
      "id, slot, size, service, status, addons, payment, confirmed, dog_id, pickup_by_id, booking_date, group_id",
    )
    .eq("booking_date", dateStr);
  if (error) return { bookings: [], error: new Error(error.message) };
  const rows = (data ?? []) as DbBookingRow[];
  return { bookings: rows.map(dbRowToCapacityBooking), error: null };
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

// Insert a batch of bookings; returns the inserted IDs in insert order.
export async function createMany(
  client: SupabaseClient,
  inputs: CreateBookingInput[],
): Promise<{ ids: string[]; error: { code?: string; message: string } | null }> {
  const records = inputs.map((input) => ({
    booking_date: input.bookingDate,
    slot: input.slot,
    dog_id: input.dogId,
    size: input.size,
    service: input.service,
    status: input.status ?? BOOKING_STATUS.BOOKED,
    confirmed: input.confirmed ?? false,
    addons: input.addons ?? [],
    payment: input.payment ?? "Due at Pick-up",
    group_id: input.groupId ?? null,
  }));
  const { data, error } = await client.from("bookings").insert(records).select("id");
  if (error) {
    return {
      ids: [],
      error: { code: (error as { code?: string }).code, message: error.message },
    };
  }
  return {
    ids: (data ?? []).map((row: { id: string }) => row.id),
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
