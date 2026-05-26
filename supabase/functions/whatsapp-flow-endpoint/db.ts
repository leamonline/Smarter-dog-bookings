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
import type {
  AvailabilitySlot,
  BookingInsert,
  DogRow,
  FlowDb,
  HumanRow,
  InsertResult,
  LargeDogDay,
} from "../_shared/flowBooking.ts";
import type { DogSize, PricingMap } from "../_shared/salonConstants.ts";

export interface FlowState {
  dog_id?: string;
  dog_name?: string;
  size?: DogSize;
  service?: string;
  addons?: string[];
  date?: string;
  slot?: string;
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
