// Typed RPC wrappers.
//
// Each wrapper names the Postgres function in one place and forwards
// the parameters the function expects (matching the column names in
// supabase/migrations/). Pass the client explicitly so the same wrapper
// works for both customer (customerSupabase) and staff (supabase)
// surfaces — both share the same RPC functions but operate under
// different RLS contexts.
import type { SupabaseClient } from "@supabase/supabase-js";

export type CalendarFeedType = "customer" | "staff";

export interface CustomerDogRow {
  id: string;
  name: string | null;
  breed: string | null;
  size: string | null;
  dob: string | null;
}

export interface CustomerTrustedHumanRow {
  id: string;
  name: string | null;
  surname: string | null;
  phone: string | null;
  relationship: string | null;
}

export interface CustomerHumanRow {
  id: string;
  name: string | null;
  surname: string | null;
  phone: string | null;
}

// Calendar feed tokens -------------------------------------------------

export function getOrCreateCalendarFeedToken(
  client: SupabaseClient,
  feedType: CalendarFeedType,
) {
  return client.rpc("get_or_create_calendar_feed_token", {
    p_feed_type: feedType,
  });
}

export function revokeCalendarFeedToken(
  client: SupabaseClient,
  feedType: CalendarFeedType,
) {
  return client.rpc("revoke_calendar_feed_token", { p_feed_type: feedType });
}

// Customer dog editing -------------------------------------------------

export function updateCustomerDog(
  client: SupabaseClient,
  params: {
    dogId: string;
    name: string;
    breed: string;
    size: string;
    dob: string | null;
  },
) {
  return client.rpc("update_customer_dog", {
    p_dog_id: params.dogId,
    p_name: params.name,
    p_breed: params.breed,
    p_size: params.size,
    p_dob: params.dob,
  });
}

// Customer trusted-human linking --------------------------------------

export function addCustomerTrustedHuman(
  client: SupabaseClient,
  params: {
    name: string;
    surname: string;
    phone: string;
    relationship: string;
  },
) {
  return client.rpc("add_customer_trusted_human", {
    p_name: params.name,
    p_surname: params.surname,
    p_phone: params.phone,
    p_relationship: params.relationship,
  });
}

// Customer ↔ human linking on first login -----------------------------

export function linkCustomerToHuman(client: SupabaseClient) {
  return client.rpc("link_customer_to_human");
}

// Customer slot availability ------------------------------------------

// Read (slot, size) for every non-cancelled booking on a date. The
// bookings RLS only exposes the caller's own rows, so the capacity
// engine needs this SECURITY DEFINER RPC to see the full occupancy.
// Returns no PII — just what the engine reads.
export function getSlotOccupancy(client: SupabaseClient, dateStr: string) {
  return client.rpc("get_slot_occupancy", { p_date: dateStr });
}

// Staff WhatsApp inbox -------------------------------------------------

// Apply a pending booking proposal that the AI agent attached to a
// draft. The RPC reads the action's payload column (which the caller
// may have updated to reflect staff edits beforehand) and creates /
// reschedules / cancels the booking accordingly. Returns the resulting
// booking id when applicable.
export function applyWhatsappBookingAction(
  client: SupabaseClient,
  params: { actionId: string },
) {
  return client.rpc("apply_whatsapp_booking_action", {
    p_action_id: params.actionId,
  });
}

// Mark a WhatsApp conversation as read by the current staff user.
// Fire-and-forget — realtime reconciles drift with the actual DB state.
export function markWhatsappConversationRead(
  client: SupabaseClient,
  params: { conversationId: string },
) {
  return client.rpc("mark_whatsapp_conversation_read", {
    p_conversation_id: params.conversationId,
  });
}
