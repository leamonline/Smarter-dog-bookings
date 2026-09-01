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
import type { Booking, SlotOverrides } from "../../types/index";
import {
  cancelCustomerBooking as cancelCustomerBookingRpc,
  createCustomerBookingGroup,
  getBlockedSeats,
  getImmediateSlots,
  getOccupancyRange,
  getSlotOccupancy,
  requestCustomerOverrideReschedule as requestCustomerOverrideRescheduleRpc,
  rescheduleCustomerBooking as rescheduleCustomerBookingRpc,
  type CustomerCancellationRpcRow,
} from "../rpc";

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

// Staff-blocked seats for a date range, folded into the capacity engine's
// whole-day overrides shape keyed by date:
//   { "<date>": { "<slot>": { <seatIndex>: "blocked" } } }
// Backed by the get_blocked_seats SECURITY DEFINER RPC (day_settings is
// staff-only via RLS). Degrades gracefully: on any error — including the RPC
// not yet existing in an environment where the migration hasn't been applied —
// it returns an empty map so the wizard behaves exactly as before rather than
// breaking. The accompanying error lets range callers label the degradation
// honestly and avoid caching an incomplete result. Pass startDate === endDate
// for a single day.
export async function listBlockedSeats(
  client: SupabaseClient,
  startDate: string,
  endDate: string,
): Promise<{
  byDate: Record<string, Record<string, SlotOverrides>>;
  error: Error | null;
}> {
  const { data, error } = await getBlockedSeats(client, { startDate, endDate });
  if (error) return { byDate: {}, error: new Error(error.message) };
  const rows = (data ?? []) as Array<{
    setting_date: string;
    slot: string;
    seat_index: number;
  }>;
  const byDate: Record<string, Record<string, SlotOverrides>> = {};
  for (const row of rows) {
    const day = (byDate[row.setting_date] ??= {});
    const slot = (day[row.slot] ??= {});
    slot[row.seat_index] = "blocked";
  }
  return { byDate, error: null };
}

// Today's last-minute ("immediate") slots, from get_immediate_slots. The RPC
// is the authority — it applies the London "today", the 30-minute cutoff, the
// open-day check and the fully-blocked check server-side; this just reshapes
// the rows to { date, slots }. Degrades to { date: null, slots: [] } on any
// error — including the RPC not yet existing where the migration hasn't been
// applied — so the wizard simply shows no Today option.
export async function listImmediateSlots(
  client: SupabaseClient,
): Promise<{ date: string | null; slots: string[] }> {
  const { data, error } = await getImmediateSlots(client);
  if (error) return { date: null, slots: [] };
  const rows = (data ?? []) as Array<{ setting_date: string; slot: string }>;
  if (rows.length === 0) return { date: null, slots: [] };
  return { date: rows[0].setting_date, slots: rows.map((r) => r.slot) };
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
): Promise<{
  ids: string[];
  // `details` carries the reason code the gate EMITTED (#665). Narrowing the
  // error to {code, message} here is what made the emitted code unreachable
  // from the portal wizard, leaving it on prose inference alone.
  error: { code?: string; message: string; details?: string | null } | null;
}> {
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
      error: {
        code: (error as { code?: string }).code,
        message: error.message,
        details: (error as { details?: string | null }).details ?? null,
      },
    };
  }
  return {
    ids: ((data ?? []) as Array<{ id: string }>).map((row) => row.id),
    error: null,
  };
}

export async function rescheduleCustomerBooking(
  client: SupabaseClient,
  input: {
    bookingId: string;
    bookingDate: string;
    reason: string;
    bookings: Array<Omit<CreateBookingInput, "bookingDate">>;
  },
): Promise<{
  ids: string[];
  error: CustomerCancellationError | null;
}> {
  try {
    const { data, error } = await rescheduleCustomerBookingRpc(client, {
      bookingId: input.bookingId,
      bookingDate: input.bookingDate,
      reason: input.reason,
      bookings: input.bookings.map((booking) => ({
        dog_id: booking.dogId,
        slot: booking.slot,
        service: booking.service,
        size: booking.size,
        addons: booking.addons ?? [],
        payment: booking.payment ?? "Due at Pick-up",
      })),
    });
    if (error) {
      return {
        ids: [],
        error: error as CustomerCancellationError,
      };
    }

    const ids = Array.isArray(data)
      ? (data as Array<{ id?: unknown }>).map((row) => row.id)
      : [];
    if (
      ids.length !== input.bookings.length ||
      ids.some((id) => typeof id !== "string" || !UUID_RE.test(id)) ||
      new Set(ids).size !== ids.length
    ) {
      return {
        ids: [],
        error: {
          code: "INVALID_RESCHEDULE_RECEIPT",
          message: "The reschedule response could not be verified.",
          details: null,
          hint: null,
        },
      };
    }

    return { ids: ids as string[], error: null };
  } catch (cause) {
    return {
      ids: [],
      error: {
        code: "NETWORK_ERROR",
        message:
          cause instanceof Error ? cause.message : "The reschedule request failed.",
        details: null,
        hint: null,
      },
    };
  }
}

export interface CustomerOverrideRescheduleRequestReceipt {
  requestId: string;
  status: "pending_staff";
  replayed: boolean;
}

export async function requestCustomerOverrideReschedule(
  client: SupabaseClient,
  input: {
    bookingId: string;
    bookingDate: string;
    reason: string;
    bookings: Array<Omit<CreateBookingInput, "bookingDate">>;
  },
): Promise<{
  request: CustomerOverrideRescheduleRequestReceipt | null;
  error: CustomerCancellationError | null;
}> {
  try {
    const { data, error } = await requestCustomerOverrideRescheduleRpc(client, {
      bookingId: input.bookingId,
      bookingDate: input.bookingDate,
      reason: input.reason,
      bookings: input.bookings.map((booking) => ({
        dog_id: booking.dogId,
        slot: booking.slot,
        service: booking.service,
        size: booking.size,
        addons: booking.addons ?? [],
        payment: booking.payment ?? "Due at Pick-up",
      })),
    });
    if (error) {
      return {
        request: null,
        error: error as CustomerCancellationError,
      };
    }

    const row =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;
    if (
      !row ||
      typeof row.request_id !== "string" ||
      !UUID_RE.test(row.request_id) ||
      row.status !== "pending_staff" ||
      typeof row.replayed !== "boolean"
    ) {
      return {
        request: null,
        error: {
          code: "INVALID_RESCHEDULE_REQUEST_RECEIPT",
          message: "The reschedule request response could not be verified.",
          details: null,
          hint: null,
        },
      };
    }

    return {
      request: {
        requestId: row.request_id,
        status: row.status,
        replayed: row.replayed,
      },
      error: null,
    };
  } catch (cause) {
    return {
      request: null,
      error: {
        code: "NETWORK_ERROR",
        message:
          cause instanceof Error
            ? cause.message
            : "The reschedule request failed.",
        details: null,
        hint: null,
      },
    };
  }
}

export interface CustomerCancellationReceipt {
  targetBookingId: string;
  bookingGroupId: string | null;
  cancelledBookingIds: string[];
  cancelledCount: number;
  cancelledAt: string;
}

export interface CustomerCancellationError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidCancellationRow(
  value: unknown,
  expectedBookingId: string,
): value is CustomerCancellationRpcRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CustomerCancellationRpcRow>;
  if (
    typeof row.target_booking_id !== "string" ||
    !UUID_RE.test(row.target_booking_id) ||
    row.target_booking_id !== expectedBookingId
  ) {
    return false;
  }
  if (
    row.booking_group_id !== null &&
    (typeof row.booking_group_id !== "string" || !UUID_RE.test(row.booking_group_id))
  ) {
    return false;
  }
  if (
    !Array.isArray(row.cancelled_booking_ids) ||
    row.cancelled_booking_ids.length === 0 ||
    row.cancelled_booking_ids.some(
      (id) => typeof id !== "string" || !UUID_RE.test(id),
    ) ||
    new Set(row.cancelled_booking_ids).size !== row.cancelled_booking_ids.length ||
    !row.cancelled_booking_ids.includes(row.target_booking_id)
  ) {
    return false;
  }
  if (
    !Number.isInteger(row.cancelled_count) ||
    row.cancelled_count !== row.cancelled_booking_ids.length
  ) {
    return false;
  }
  return (
    typeof row.cancelled_at === "string" &&
    row.cancelled_at.trim() !== "" &&
    Number.isFinite(Date.parse(row.cancelled_at))
  );
}

function invalidCancellationReceipt(): CustomerCancellationError {
  return {
    code: "INVALID_CANCELLATION_RECEIPT",
    message: "The cancellation response could not be verified.",
    details: null,
    hint: null,
  };
}

// Customer cancellation is one atomic database command. The repository
// accepts success only when exactly one complete receipt can be verified.
export async function cancelCustomerBooking(
  client: SupabaseClient,
  input: { bookingId: string; reason: string },
): Promise<{
  receipt: CustomerCancellationReceipt | null;
  error: CustomerCancellationError | null;
}> {
  try {
    const { data, error } = await cancelCustomerBookingRpc(client, input);
    if (error) {
      return {
        receipt: null,
        error: error as CustomerCancellationError,
      };
    }

    if (
      !Array.isArray(data) ||
      data.length !== 1 ||
      !isValidCancellationRow(data[0], input.bookingId)
    ) {
      return { receipt: null, error: invalidCancellationReceipt() };
    }

    const row = data[0];
    return {
      receipt: {
        targetBookingId: row.target_booking_id,
        bookingGroupId: row.booking_group_id,
        cancelledBookingIds: row.cancelled_booking_ids,
        cancelledCount: row.cancelled_count,
        cancelledAt: row.cancelled_at,
      },
      error: null,
    };
  } catch (cause) {
    return {
      receipt: null,
      error: {
        code: "NETWORK_ERROR",
        message:
          cause instanceof Error ? cause.message : "The cancellation request failed.",
        details: null,
        hint: null,
      },
    };
  }
}

// App-shaped booking for the customer dashboard: camelCase fields plus the
// joined dog snapshot. Only the columns the dashboard actually renders —
// keep the select list below in step with this shape.
export interface CustomerBookingSummary {
  id: string;
  bookingDate: string;
  slot: string;
  size: string | null;
  service: string | null;
  status: string | null;
  payment: string | null;
  dogId: string | null;
  visitId: string | null;
  groupId: string | null;
  staffCapacityOverride: boolean;
  depositRequired: boolean;
  depositReceivedAt: string | null;
  depositAmount: number | null;
  depositReference: string | null;
  depositDueBy: string | null;
  dog: { name: string; breed: string; size: string | null } | null;
}

const CUSTOMER_BOOKING_COLUMNS =
  "id, booking_date, slot, size, service, status, payment, dog_id, visit_id, " +
  "group_id, staff_capacity_override, deposit_required, deposit_received_at, " +
  "deposit_amount, deposit_reference, deposit_due_by, dogs(name, breed, size)";

interface DbCustomerBookingRow {
  id: string;
  booking_date: string;
  slot: string;
  size: string | null;
  service: string | null;
  status: string | null;
  payment: string | null;
  dog_id: string | null;
  visit_id: string | null;
  group_id: string | null;
  staff_capacity_override: boolean | null;
  deposit_required: boolean | null;
  deposit_received_at: string | null;
  deposit_amount: number | null;
  deposit_reference: string | null;
  deposit_due_by: string | null;
  dogs: { name: string | null; breed: string | null; size: string | null } | null;
}

function dbRowToCustomerBooking(row: DbCustomerBookingRow): CustomerBookingSummary {
  return {
    id: row.id,
    bookingDate: row.booking_date,
    slot: row.slot,
    size: row.size ?? null,
    service: row.service ?? null,
    status: row.status ?? null,
    payment: row.payment ?? null,
    dogId: row.dog_id ?? null,
    visitId: row.visit_id ?? null,
    groupId: row.group_id ?? null,
    staffCapacityOverride: row.staff_capacity_override === true,
    depositRequired: row.deposit_required === true,
    depositReceivedAt: row.deposit_received_at ?? null,
    depositAmount: row.deposit_amount ?? null,
    depositReference: row.deposit_reference ?? null,
    depositDueBy: row.deposit_due_by ?? null,
    dog: row.dogs
      ? {
          name: row.dogs.name ?? "",
          breed: row.dogs.breed ?? "",
          size: row.dogs.size ?? null,
        }
      : null,
  };
}

// Bookings for the customer's dogs from `sinceDate` forward (RLS scopes the
// rows to the signed-in customer; the dog filter keeps the query honest).
// Newest first, matching the dashboard's display order.
export async function listCustomerBookings(
  client: SupabaseClient,
  { dogIds, sinceDate }: { dogIds: string[]; sinceDate: string },
): Promise<{ bookings: CustomerBookingSummary[]; error: Error | null }> {
  if (dogIds.length === 0) return { bookings: [], error: null };
  const { data, error } = await client
    .from("bookings")
    .select(CUSTOMER_BOOKING_COLUMNS)
    .in("dog_id", dogIds)
    .gte("booking_date", sinceDate)
    .order("booking_date", { ascending: false })
    .order("slot", { ascending: false });
  if (error) return { bookings: [], error: new Error(error.message) };
  return {
    bookings: ((data ?? []) as unknown as DbCustomerBookingRow[]).map(
      dbRowToCustomerBooking,
    ),
    error: null,
  };
}

// Older page for "Load more past appointments": bookings strictly before
// `beforeDate`, newest first, capped at `limit`.
export async function listOlderCustomerBookings(
  client: SupabaseClient,
  { dogIds, beforeDate, limit }: { dogIds: string[]; beforeDate: string; limit: number },
): Promise<{ bookings: CustomerBookingSummary[]; error: Error | null }> {
  if (dogIds.length === 0) return { bookings: [], error: null };
  const { data, error } = await client
    .from("bookings")
    .select(CUSTOMER_BOOKING_COLUMNS)
    .in("dog_id", dogIds)
    .lt("booking_date", beforeDate)
    .order("booking_date", { ascending: false })
    .order("slot", { ascending: false })
    .limit(limit);
  if (error) return { bookings: [], error: new Error(error.message) };
  return {
    bookings: ((data ?? []) as unknown as DbCustomerBookingRow[]).map(
      dbRowToCustomerBooking,
    ),
    error: null,
  };
}

// Whether any bookings exist before `beforeDate` — drives the "Load more"
// button without fetching rows. Degrades to false on error (the button
// simply doesn't show; the recent list already rendered).
export async function hasCustomerBookingsBefore(
  client: SupabaseClient,
  { dogIds, beforeDate }: { dogIds: string[]; beforeDate: string },
): Promise<boolean> {
  if (dogIds.length === 0) return false;
  const { count, error } = await client
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .in("dog_id", dogIds)
    .lt("booking_date", beforeDate);
  if (error) return false;
  return (count ?? 0) > 0;
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

export interface DepositSettings {
  bank: { accountName: string; sortCode: string; accountNumber: string } | null;
  releaseHours: number;
}

/**
 * Bank details + release window for the deposit panels. Reads
 * salon_config.settings (customers hold a SELECT policy). Degrades to
 * { bank: null, releaseHours: 12 } — panels then show the reference and
 * amount without bank details rather than erroring.
 */
export async function getDepositSettings(client: SupabaseClient): Promise<DepositSettings> {
  const fallback: DepositSettings = { bank: null, releaseHours: 12 };
  if (!client) return fallback;
  const { data, error } = await client
    .from("salon_config")
    .select("settings")
    .limit(1)
    .maybeSingle();
  if (error || !data?.settings) return fallback;
  const s = data.settings as {
    depositBank?: { accountName?: string; sortCode?: string; accountNumber?: string } | null;
    depositReleaseHours?: number | null;
  };
  const bank = s.depositBank;
  const complete = Boolean(bank?.accountName && bank?.sortCode && bank?.accountNumber);
  return {
    bank: complete
      ? {
          accountName: bank!.accountName!,
          sortCode: bank!.sortCode!,
          accountNumber: bank!.accountNumber!,
        }
      : null,
    releaseHours:
      typeof s.depositReleaseHours === "number" && s.depositReleaseHours > 0
        ? s.depositReleaseHours
        : 12,
  };
}
