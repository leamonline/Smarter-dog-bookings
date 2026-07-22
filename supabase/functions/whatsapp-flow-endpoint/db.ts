// ============================================================
// supabase/functions/whatsapp-flow-endpoint/db.ts
//
// Supabase-backed implementation of the FlowDb interface (defined in
// _shared/flowBooking.ts) plus the whatsapp_flow_sessions IO. This is
// the Deno-only IO glue — the pure logic it serves lives in _shared and
// is unit-tested there. Uses the service role: it bypasses RLS but NOT
// the bookings capacity trigger, so inserts are still guarded.
// ============================================================

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type AvailabilitySlot,
  type BookingInsert,
  type DogRow,
  type ExistingBooking,
  type FlowDb,
  type GroupBookingItem,
  type GroupInsertResult,
  type RescheduleSelector,
  type HumanRow,
  type InsertResult,
  type LargeDogDay,
  sanitizeDayOverrides,
} from "../_shared/flowBooking.ts";
import type { SlotOverrides } from "../_shared/capacity.ts";
import type { DogSize, PricingMap } from "../_shared/salonConstants.ts";

/** Pinned (server-resolved) per-dog identity for the booking group. */
export interface FlowDogMeta {
  name: string;
  size: DogSize;
}

// Multi-dog session state. dog_ids holds the selection order; dog_meta pins
// each dog's name + authoritative size; services/addons are keyed by dog id.
// The per-dog screens are DOG_A..DOG_D (forward-only routing), so the dog
// position comes from the screen id rather than a stored cursor. (jsonb
// column — no schema change.)
export interface FlowState {
  dog_ids?: string[];
  dog_meta?: Record<string, FlowDogMeta>;
  services?: Record<string, string>;
  addons?: Record<string, string[]>;
  date?: string;
  drop_off?: string;
  // ── Reschedule mode (pre-seeded by the agent) ──
  // When flow_mode==='reschedule' the Flow opens on SELECT_DATE with the dogs
  // + services above already pinned; on CONFIRM the endpoint creates the new
  // booking group, then cancels the old visit. The *_snapshot fields freeze
  // the old visit so CONFIRM can detect it changing underneath the customer.
  flow_mode?: "reschedule";
  reschedule_group_id?: string | null;
  reschedule_booking_id?: string;
  old_booking_ids?: string[];
  old_date?: string;
  old_slot?: string;
  old_start_at?: string;
  service_snapshot?: Record<string, string>;
  dog_snapshot?: string[];
}

export interface FlowSessionRow {
  flow_token: string;
  phone_e164: string;
  human_id: string | null;
  flow_type: string;
  screen: string | null;
  state: FlowState;
  status: string;
  booking_id: string | null;
  expires_at: string;
}

export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function makeFlowDb(supabase: SupabaseClient): FlowDb {
  return {
    async getHumanByPhone(phone: string): Promise<HumanRow | null> {
      const { data } = await supabase
        .from("humans")
        .select("id, name, surname, phone")
        .eq("phone", phone)
        .maybeSingle();
      return (data as HumanRow | null) ?? null;
    },

    async getDogsByHuman(humanId: string): Promise<DogRow[]> {
      const { data, error } = await supabase
        .from("dogs")
        .select("id, name, breed, size, human_id")
        .eq("human_id", humanId)
        .order("name");
      if (error) {
        console.error("getDogsByHuman failed:", error.message);
        return [];
      }
      return (data as DogRow[]) ?? [];
    },

    async getDogById(dogId: string): Promise<DogRow | null> {
      const { data } = await supabase
        .from("dogs")
        .select("id, name, breed, size, human_id")
        .eq("id", dogId)
        .maybeSingle();
      return (data as DogRow | null) ?? null;
    },

    async getPricing(): Promise<PricingMap | null> {
      const { data } = await supabase
        .from("salon_config")
        .select("pricing")
        .limit(1)
        .maybeSingle();
      const pricing = (data as { pricing?: PricingMap } | null)?.pricing;
      return pricing && Object.keys(pricing).length > 0 ? pricing : null;
    },

    async getSmallMediumAvailability(fromDate: string, toDate: string): Promise<AvailabilitySlot[]> {
      const { data, error } = await supabase.rpc("get_small_medium_availability", {
        p_from: fromDate,
        p_to: toDate,
      });
      if (error) {
        console.error("get_small_medium_availability failed:", error.message);
        return [];
      }
      return (data as AvailabilitySlot[]) ?? [];
    },

    async getLargeDogDays(fromDate: string, toDate: string): Promise<LargeDogDay[]> {
      const { data, error } = await supabase.rpc("get_large_dog_day_availability", {
        p_from: fromDate,
        p_to: toDate,
      });
      if (error) {
        console.error("get_large_dog_day_availability failed:", error.message);
        return [];
      }
      return (data as LargeDogDay[]) ?? [];
    },

    async insertBooking(row: BookingInsert): Promise<InsertResult> {
      const { data, error } = await supabase
        .from("bookings")
        .insert(row)
        .select("id")
        .single();
      if (error) {
        return { errorCode: error.code, errorMessage: error.message };
      }
      return { id: (data as { id: string }).id };
    },

    async getBookingsForDate(dateStr: string): Promise<ExistingBooking[]> {
      // Service role bypasses RLS, so this sees every customer's booking —
      // exactly what the 2-2-1 group allocator needs (the portal reaches the
      // same full occupancy via the get_slot_occupancy RPC). Cancelled rows
      // don't hold a seat.
      const { data, error } = await supabase
        .from("bookings")
        .select("slot, size")
        .eq("booking_date", dateStr)
        .neq("status", "Cancelled");
      if (error) {
        console.error("getBookingsForDate failed:", error.message);
        return [];
      }
      return (data as ExistingBooking[]) ?? [];
    },

    async getDayOverrides(dateStr: string): Promise<Record<string, SlotOverrides>> {
      // day_settings is staff-only under RLS; the service role reads it
      // directly. Degrade to {} on any error — a read blip must never stop
      // the customer booking (the capacity trigger stays the hard guard).
      const { data, error } = await supabase
        .from("day_settings")
        .select("overrides")
        .eq("setting_date", dateStr)
        .maybeSingle();
      if (error) {
        console.error("getDayOverrides failed:", error.message);
        return {};
      }
      return sanitizeDayOverrides((data as { overrides?: unknown } | null)?.overrides);
    },

    async getImmediateSlots(): Promise<Array<{ setting_date: string; slot: string }>> {
      const { data, error } = await supabase.rpc("get_immediate_slots");
      if (error) {
        // Fail closed: no rows means no same-day slots are offered, which is
        // the safe direction (the calendar trigger would reject them anyway).
        console.error("get_immediate_slots failed:", error.message);
        return [];
      }
      return (data as Array<{ setting_date: string; slot: string }>) ?? [];
    },

    async insertBookingGroup(
      items: GroupBookingItem[],
      dateStr: string,
      humanId: string,
    ): Promise<GroupInsertResult> {
      const payload = items.map((it) => ({
        dog_id: it.dog_id,
        slot: it.slot,
        service: it.service,
        size: it.size,
        addons: it.addons,
      }));
      const { data, error } = await supabase.rpc("create_whatsapp_booking_group", {
        p_bookings: payload,
        p_booking_date: dateStr,
        p_human_id: humanId,
      });
      if (error) {
        return { errorCode: error.code, errorMessage: error.message };
      }
      const ids = Array.isArray(data)
        ? (data as Array<{ id: string }>).map((r) => r.id)
        : [];
      return { ids };
    },

    // Atomic reschedule. One RPC cancels the old visit and creates the
    // replacement in a single transaction, so a partial failure can never
    // leave two active appointments. Errors are returned, not thrown, so the
    // caller keeps its existing slot-taken retry behaviour.
    async rescheduleBookingGroup(
      items: GroupBookingItem[],
      dateStr: string,
      humanId: string,
      old: RescheduleSelector,
    ): Promise<GroupInsertResult> {
      const payload = items.map((it) => ({
        dog_id: it.dog_id,
        slot: it.slot,
        service: it.service,
        size: it.size,
        addons: it.addons,
      }));
      const { data, error } = await supabase.rpc("reschedule_whatsapp_booking_group", {
        p_bookings: payload,
        p_booking_date: dateStr,
        p_human_id: humanId,
        p_old_group_id: old.groupId ?? null,
        p_old_booking_id: old.bookingId ?? null,
        p_expected_old_ids: old.expectedOldIds?.length ? old.expectedOldIds : null,
        p_reason: "Rescheduled via WhatsApp",
      });
      if (error) {
        return { errorCode: error.code, errorMessage: error.message };
      }
      const row = (Array.isArray(data) ? data[0] : data) as
        | { new_booking_ids?: string[]; cancelled_booking_ids?: string[] }
        | null;
      return {
        ids: row?.new_booking_ids ?? [],
        cancelledIds: row?.cancelled_booking_ids ?? [],
      };
    },
  };
}

// ── Session IO ─────────────────────────────────────────────────

export async function loadSession(
  supabase: SupabaseClient,
  flowToken: string,
): Promise<FlowSessionRow | null> {
  const { data } = await supabase
    .from("whatsapp_flow_sessions")
    .select("flow_token, phone_e164, human_id, flow_type, screen, state, status, booking_id, expires_at")
    .eq("flow_token", flowToken)
    .maybeSingle();
  if (!data) return null;
  const row = data as FlowSessionRow;
  return { ...row, state: (row.state ?? {}) as FlowState };
}

export async function saveSession(
  supabase: SupabaseClient,
  flowToken: string,
  patch: { screen?: string; state?: FlowState },
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.screen !== undefined) update.screen = patch.screen;
  if (patch.state !== undefined) update.state = patch.state;
  const { error } = await supabase
    .from("whatsapp_flow_sessions")
    .update(update)
    .eq("flow_token", flowToken);
  if (error) console.error("saveSession failed:", error.message);
}

export async function completeSession(
  supabase: SupabaseClient,
  flowToken: string,
  bookingId: string,
): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_flow_sessions")
    .update({ status: "completed", booking_id: bookingId, updated_at: new Date().toISOString() })
    .eq("flow_token", flowToken);
  if (error) console.error("completeSession failed:", error.message);
}

export async function failSession(supabase: SupabaseClient, flowToken: string): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_flow_sessions")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("flow_token", flowToken);
  if (error) console.error("failSession failed:", error.message);
}

// ── Reschedule helpers (re-validate + cancel the old visit) ────

/** A current 'Booked' booking row owned by the customer, for re-validating a
 *  reschedule's old visit at CONFIRM time. */
export interface OldBookingRow {
  id: string;
  dog_id: string;
  service: string | null;
  group_id: string | null;
  booking_date: string;
  slot: string;
}

/** Re-fetch the still-active ('Booked'), owned bookings of the old visit. The
 *  dogs!inner + human_id filter is the server-side ownership guard. */
export async function getActiveOwnedBookings(
  supabase: SupabaseClient,
  humanId: string,
  sel: { groupId?: string | null; bookingId?: string },
): Promise<OldBookingRow[]> {
  let q = supabase
    .from("bookings")
    .select("id, dog_id, service, group_id, booking_date, slot, dogs!inner(human_id)")
    .eq("status", "Booked")
    .eq("dogs.human_id", humanId);
  if (sel.groupId) q = q.eq("group_id", sel.groupId);
  else if (sel.bookingId) q = q.eq("id", sel.bookingId);
  else return [];
  const { data, error } = await q;
  if (error) {
    console.error("getActiveOwnedBookings failed:", error.message);
    return [];
  }
  return ((data as Array<Record<string, unknown>>) ?? []).map((r) => ({
    id: r.id as string,
    dog_id: r.dog_id as string,
    service: (r.service as string | null) ?? null,
    group_id: (r.group_id as string | null) ?? null,
    booking_date: r.booking_date as string,
    slot: r.slot as string,
  }));
}

/** Cancel the old visit after a reschedule's new booking is created. Uses the
 *  group RPC when grouped, else the by-id RPC (which still cancels the whole
 *  group it resolves). Returns the actual cancelled count so the caller can
 *  detect a partial/duplicate. */
export async function cancelOldBookingForReschedule(
  supabase: SupabaseClient,
  humanId: string,
  sel: { groupId?: string | null; bookingId?: string },
): Promise<{ cancelledCount: number; bookingIds: string[] }> {
  const p_reason = "Rescheduled via WhatsApp";
  const rpc = sel.groupId ? "cancel_whatsapp_booking_group" : "cancel_whatsapp_booking_by_id";
  const args = sel.groupId
    ? { p_group_id: sel.groupId, p_human_id: humanId, p_reason }
    : { p_booking_id: sel.bookingId, p_human_id: humanId, p_reason };
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) {
    console.error(`${rpc} failed:`, error.message);
    return { cancelledCount: 0, bookingIds: [] };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { cancelled_count?: number; booking_ids?: string[] }
    | null;
  return { cancelledCount: row?.cancelled_count ?? 0, bookingIds: row?.booking_ids ?? [] };
}
