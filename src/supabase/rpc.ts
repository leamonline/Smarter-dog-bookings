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
