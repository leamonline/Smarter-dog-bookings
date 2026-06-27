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

// Customer-self-service: add a dog to the caller's own human. SECURITY
// DEFINER, validates ownership of p_human_id; granted authenticated only.
export function createCustomerDog(
  client: SupabaseClient,
  params: { name: string; breed?: string | null; size?: string | null; humanId: string },
) {
  return client.rpc("create_customer_dog", {
    p_name: params.name,
    p_breed: params.breed ?? null,
    p_size: params.size ?? null,
    p_human_id: params.humanId,
  });
}

// Staff trusted-contact linking ----------------------------------------

// Atomically replace every trusted-contact link for a human. The old
// client-side DELETE + INSERT pair could permanently lose all links when
// the insert failed after the delete committed; the RPC does both inside
// one transaction (staff only — migration 20260610150000).
export function replaceTrustedContacts(
  client: SupabaseClient,
  params: {
    humanId: string;
    contacts: { trustedId: string; relationship: string | null }[];
  },
) {
  return client.rpc("replace_trusted_contacts", {
    p_human_id: params.humanId,
    p_contacts: params.contacts.map((c) => ({
      trusted_id: c.trustedId,
      relationship: c.relationship,
    })),
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

// Shape of each row returned by link_customer_to_human(). `has_password`
// is derived live from auth.users.encrypted_password for the calling
// user (NULLIF(...,'') guarded), and drives the required set-password
// gate in CustomerApp.
export interface LinkedHumanRow {
  id: string;
  name: string | null;
  surname: string | null;
  phone: string | null;
  sms: boolean | null;
  whatsapp: boolean | null;
  email: string | null;
  fb: string | null;
  insta: string | null;
  tiktok: string | null;
  address: string | null;
  customer_user_id: string | null;
  has_password: boolean;
}

export function linkCustomerToHuman(client: SupabaseClient) {
  return client.rpc("link_customer_to_human");
}

// "Join the Pack" self-signup --------------------------------------------

// Owner details collected during onboarding (mandatory + optional).
export interface SignupOwner {
  name: string;
  surname: string;
  address: string;
  postcode?: string | null;
  email?: string | null;
  sms?: boolean;
  whatsapp?: boolean;
  policies_version?: string | null;
}

// One dog per entry. name + breed + sex + dob are mandatory at signup;
// size is derived from the breed client-side (null when unknown → staff
// set it); the rest are optional.
export interface SignupDog {
  name: string;
  breed: string;
  sex?: string | null;
  dob?: string | null; // "YYYY-MM"
  size?: string | null;
  microchip?: string | null;
  neutered?: boolean | null;
  vet?: string | null;
  colour?: string | null;
  groom_notes?: string | null;
  alerts?: string[];
}

// Create the pending "shell" humans row for a freshly-verified phone that
// has no record yet. Idempotent — returns the existing linked human if any.
export function createPendingCustomer(client: SupabaseClient) {
  return client.rpc("create_pending_customer");
}

// Finalise a signup: owner details + policy agreement + dogs, atomically,
// and drop a review to-do for staff.
export function submitCustomerSignup(
  client: SupabaseClient,
  params: { owner: SignupOwner; dogs: SignupDog[] },
) {
  return client.rpc("submit_customer_signup", {
    p_owner: params.owner,
    p_dogs: params.dogs,
  });
}

// Staff: approve / reject a pending self-signup.
export function approveCustomerSignup(
  client: SupabaseClient,
  params: { humanId: string },
) {
  return client.rpc("approve_customer_signup", { p_human_id: params.humanId });
}

export function rejectCustomerSignup(
  client: SupabaseClient,
  params: { humanId: string; reason?: string | null },
) {
  return client.rpc("reject_customer_signup", {
    p_human_id: params.humanId,
    p_reason: params.reason ?? null,
  });
}

// Customer slot availability ------------------------------------------

// Read (slot, size) for every non-cancelled booking on a date. The
// bookings RLS only exposes the caller's own rows, so the capacity
// engine needs this SECURITY DEFINER RPC to see the full occupancy.
// Returns no PII — just what the engine reads.
export function getSlotOccupancy(client: SupabaseClient, dateStr: string) {
  return client.rpc("get_slot_occupancy", { p_date: dateStr });
}

// Range sibling of get_slot_occupancy: (booking_date, slot, size) for every
// non-cancelled booking between two dates, so the date step can dim the days
// the selected dogs can't be booked into. SECURITY DEFINER, authenticated
// only, returns no PII.
export function getOccupancyRange(
  client: SupabaseClient,
  params: { startDate: string; endDate: string },
) {
  return client.rpc("get_occupancy_range", {
    p_from: params.startDate,
    p_to: params.endDate,
  });
}

// Staff-blocked seat positions (day_settings.overrides = "blocked") across a
// date range, so the customer capacity engine can treat a blocked seat as
// taken. day_settings is staff-only via RLS, so this SECURITY DEFINER RPC is
// the only customer read path; it returns only (setting_date, slot, seat_index)
// — never "open" overrides or other staff fields. Authenticated only.
export function getBlockedSeats(
  client: SupabaseClient,
  params: { startDate: string; endDate: string },
) {
  return client.rpc("get_blocked_seats", {
    p_start: params.startDate,
    p_end: params.endDate,
  });
}

// Customer booking creation -------------------------------------------

// One row per dog in the group. group_id is assigned server-side; status
// and confirmed are set by the RPC (customers can't choose them). size is
// optional — the RPC takes the authoritative size from the dog record and
// only falls back to this when the dog has no size on file.
export interface CreateBookingGroupRow {
  dog_id: string;
  slot: string;
  service: string;
  size?: string;
  addons?: string[];
  payment?: string;
}

// Sole customer write path into bookings. The raw INSERT was replaced by
// this SECURITY DEFINER RPC, which validates ownership and 1–4-dog groups
// and inserts atomically; the bookings BEFORE-INSERT triggers enforce
// calendar safety (open/future/unblocked) and seat capacity (raising the
// same P0001 messages the wizard already surfaces).
export function createCustomerBookingGroup(
  client: SupabaseClient,
  params: { bookingDate: string; bookings: CreateBookingGroupRow[] },
) {
  return client.rpc("create_customer_booking_group", {
    p_booking_date: params.bookingDate,
    p_bookings: params.bookings,
  });
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

// Staff "Book appointment" from an inbox conversation. Stages a manual
// booking action (source=staff_manual) and applies it via the same
// guarded path as an AI proposal; returns the new booking id.
export interface StaffBookingPayload {
  dog_id: string;
  booking_date: string; // YYYY-MM-DD
  slot: string;
  service: string;
  size?: string;
  status?: string;
  addons?: string[];
  payment?: string;
  confirmed?: boolean;
}

export function createStaffBookingFromConversation(
  client: SupabaseClient,
  params: { conversationId: string; payload: StaffBookingPayload },
) {
  return client.rpc("create_staff_booking_from_conversation", {
    p_conversation_id: params.conversationId,
    p_payload: params.payload,
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

// Open-day lookup -------------------------------------------------------

// day_settings is staff-only via RLS; this RPC exposes just
// (setting_date, is_open) for a date range so the customer booking
// wizard can grey out closures.
export function getOpenDays(
  client: SupabaseClient,
  params: { startDate: string; endDate: string },
) {
  return client.rpc("get_open_days", {
    p_start: params.startDate,
    p_end: params.endDate,
  });
}

// Staff directories ------------------------------------------------------

// Server-side search + filter + sort + pagination for the Dogs directory.
export function searchDogsDirectory(
  client: SupabaseClient,
  params: {
    search: string | null;
    size: string | null;
    alert: boolean;
    incomplete: boolean;
    letter: string | null;
    sort: string;
    limit: number;
    offset: number;
  },
) {
  return client.rpc("search_dogs_directory", {
    p_search: params.search,
    p_size: params.size,
    p_alert: params.alert,
    p_incomplete: params.incomplete,
    p_letter: params.letter,
    p_sort: params.sort,
    p_limit: params.limit,
    p_offset: params.offset,
  });
}

// Server-side search + filter + sort + pagination for the Humans directory.
export function searchHumansDirectory(
  client: SupabaseClient,
  params: {
    search: string | null;
    flagged: boolean;
    noDogs: boolean;
    noPhone: boolean;
    whatsapp: boolean;
    pending: boolean;
    letter: string | null;
    sort: string;
    limit: number;
    offset: number;
  },
) {
  return client.rpc("search_humans_directory", {
    p_search: params.search,
    p_flagged: params.flagged,
    p_no_dogs: params.noDogs,
    p_no_phone: params.noPhone,
    p_whatsapp: params.whatsapp,
    p_pending: params.pending,
    p_letter: params.letter,
    p_sort: params.sort,
    p_limit: params.limit,
    p_offset: params.offset,
  });
}

// Merge a duplicate human (loser) into the canonical record (winner):
// reassigns dogs, bookings and trusted links server-side, atomically.
export function mergeHumans(
  client: SupabaseClient,
  params: { winnerId: string; loserId: string },
) {
  return client.rpc("merge_humans", {
    p_winner: params.winnerId,
    p_loser: params.loserId,
  });
}
