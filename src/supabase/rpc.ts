// Typed RPC wrappers.
//
// Each wrapper names the Postgres function in one place and forwards
// the parameters the function expects (matching the column names in
// supabase/migrations/). Pass the client explicitly so the same wrapper
// works for both customer (customerSupabase) and staff (supabase)
// surfaces — both share the same RPC functions but operate under
// different RLS contexts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingPolicyRpcTransport } from "./client";

export type CalendarFeedType = "customer" | "staff";

export interface CustomerDogRow {
  id: string;
  name: string | null;
  breed: string | null;
  size: string | null;
  reported_size: string | null;
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

// Customer trusted-contact reading -----------------------------------

// Returns only the customer-safe fields for contacts linked to the caller.
// The database derives the owner from auth.uid(); callers provide no row ID.
export function listCustomerTrustedHumans(client: SupabaseClient) {
  return client
    .rpc("list_customer_trusted_humans")
    .overrideTypes<CustomerTrustedHumanRow[], { merge: false }>();
}

// Customer profile editing --------------------------------------------

export interface CustomerContactDetailsInput {
  name: string;
  surname: string;
  address: string;
  postcode?: string | null;
  email?: string | null;
  whatsapp?: boolean;
  fb?: string | null;
  insta?: string | null;
  tiktok?: string | null;
}

// The database derives the target human from auth.uid(); callers provide no
// row identifier and can submit only the profile fields exposed here.
export function updateCustomerContactDetails(
  client: SupabaseClient,
  input: CustomerContactDetailsInput,
) {
  return client.rpc("update_customer_contact_details", {
    p_name: input.name,
    p_surname: input.surname,
    p_address: input.address,
    p_postcode: input.postcode ?? null,
    p_email: input.email ?? null,
    p_whatsapp: input.whatsapp ?? false,
    p_fb: input.fb ?? null,
    p_insta: input.insta ?? null,
    p_tiktok: input.tiktok ?? null,
  });
}

export interface CompleteCustomerProfileInput {
  name: string;
  surname: string;
  address: string;
  postcode?: string | null;
  policiesVersion: string;
}

export function completeCustomerProfile(
  client: SupabaseClient,
  input: CompleteCustomerProfileInput,
) {
  return client.rpc("complete_customer_profile", {
    p_name: input.name,
    p_surname: input.surname,
    p_address: input.address,
    p_postcode: input.postcode ?? null,
    p_policies_version: input.policiesVersion,
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
  // "Where did you hear about us?" — the chosen option label or the free text
  // typed for "Other". Optional; null/absent when the customer skipped it.
  heard_about_us?: string | null;
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

// Today's staff-flagged "last minute" slots a customer could still book.
// The RPC applies every rule server-side (Europe/London today, 30-minute
// cutoff, day open, slot not fully blocked) and returns (setting_date, slot)
// — setting_date is the SERVER's today, so clients never trust the device
// clock. No parameters, minimal disclosure. Authenticated only.
export function getImmediateSlots(client: SupabaseClient) {
  return client.rpc("get_immediate_slots");
}

// Per-dog grooming cadence for the retention report (2D): (dog_id, visit_count,
// median_interval_days, last_groomed_date, first_groomed_date, last_service).
// The heavy median is computed server-side over completed bookings. Staff-locked
// (is_staff() guard), SECURITY INVOKER so RLS applies.
export function getDogGroomingIntervals(client: SupabaseClient) {
  return client.rpc("get_dog_grooming_intervals");
}

export interface BookingDenialInput {
  reasonCode: string;
  source?: string;
  requestedDate?: string | null;
  slot?: string | null;
  size?: string | null;
  service?: string | null;
  dogCount?: number | null;
  reasonDetail?: string | null;
  alternativeShown?: boolean;
  alternativeTaken?: boolean;
  humanId?: string | null;
}

// Best-effort capacity-denial log into booking_denials (report 2F). The RPC is
// SECURITY DEFINER, granted to authenticated + service_role, and never raises on
// ordinary input. ALWAYS call this fire-and-forget (e.g. `.then(undefined, () => {})`)
// — a logging failure must never surface to, or block, a booking.
export function logBookingDenial(client: SupabaseClient, input: BookingDenialInput) {
  return client.rpc("log_booking_denial", {
    p_reason_code: input.reasonCode,
    p_source: input.source ?? "portal",
    p_requested_date: input.requestedDate ?? null,
    p_slot: input.slot ?? null,
    p_size: input.size ?? null,
    p_service: input.service ?? null,
    p_dog_count: input.dogCount ?? null,
    p_reason_detail: input.reasonDetail ?? null,
    p_alternative_shown: input.alternativeShown ?? false,
    p_alternative_taken: input.alternativeTaken ?? false,
    p_human_id: input.humanId ?? null,
  });
}

// Best-effort booking-wizard step telemetry (improvement #4). SECURITY DEFINER
// RPC granted to authenticated; never raises on ordinary input. ALWAYS call
// fire-and-forget — a failure must never surface to, or block, the wizard.
export function logFunnelEvent(
  client: SupabaseClient,
  input: {
    sessionId: string;
    step: string;
    stepIndex?: number | null;
    occurredAt?: string | null;
    humanId?: string | null;
    dogCount?: number | null;
    /**
     * Set only when the wizard could offer no way forward at this step.
     * Never set to explain a customer who had a choice and left anyway —
     * that is not observable. See src/engine/funnelBlockers.ts.
     */
    blockedReason?: string | null;
    /**
     * Set only on step = "confirm_failed": why a confirm click produced no
     * booking (#708). Governed set — see src/engine/confirmFailure.ts.
     */
    failureCode?: string | null;
    failureDetail?: string | null;
  },
) {
  return client.rpc("log_funnel_event", {
    p_session_id: input.sessionId,
    p_step: input.step,
    p_step_index: input.stepIndex ?? null,
    p_occurred_at: input.occurredAt ?? null,
    p_human_id: input.humanId ?? null,
    p_dog_count: input.dogCount ?? null,
    p_blocked_reason: input.blockedReason ?? null,
    p_failure_code: input.failureCode ?? null,
    p_failure_detail: input.failureDetail ?? null,
  });
}

// Customer booking creation -------------------------------------------

// One row per dog in the group. group_id is assigned server-side; status
// and confirmed are set by the RPC (customers can't choose them). The RPC
// always takes authoritative size from the dog record.
export interface CreateBookingGroupRow {
  dog_id: string;
  slot: string;
  service: string;
  // Retained in the wire shape for deployment compatibility. The database
  // ignores it and reads the staff-confirmed dogs.size value instead.
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

// Customer booking cancellation --------------------------------------

export interface CustomerCancellationRpcRow {
  target_booking_id: string;
  booking_group_id: string | null;
  cancelled_booking_ids: string[];
  cancelled_count: number;
  cancelled_at: string;
}

// The database derives ownership, group membership and the applicable salon
// settings. The customer supplies only the booking they selected and a reason.
export function cancelCustomerBooking(
  client: SupabaseClient,
  input: { bookingId: string; reason: string },
) {
  return client.rpc("cancel_customer_booking", {
    p_booking_id: input.bookingId,
    p_reason: input.reason,
  });
}

export function rescheduleCustomerBooking(
  client: SupabaseClient,
  params: {
    bookingId: string;
    bookingDate: string;
    bookings: CreateBookingGroupRow[];
    reason: string;
  },
) {
  return client.rpc("reschedule_customer_booking", {
    p_booking_id: params.bookingId,
    p_bookings: params.bookings,
    p_booking_date: params.bookingDate,
    p_reason: params.reason,
  });
}

export function requestCustomerOverrideReschedule(
  client: SupabaseClient,
  params: {
    bookingId: string;
    bookingDate: string;
    bookings: CreateBookingGroupRow[];
    reason: string;
  },
) {
  return client.rpc("request_customer_override_reschedule", {
    p_booking_id: params.bookingId,
    p_bookings: params.bookings,
    p_booking_date: params.bookingDate,
    p_reason: params.reason,
  });
}

export function decideCustomerOverrideRescheduleRequest(
  client: SupabaseClient,
  params: {
    requestId: string;
    decision: "approve" | "deny";
    reason: string;
  },
) {
  return client.rpc("decide_customer_override_reschedule_request", {
    p_request_id: params.requestId,
    p_decision: params.decision,
    p_reason: params.reason,
  });
}

// Staff day closures ---------------------------------------------------

// Closing the authoritative day and creating one linked task per affected
// visit is a single database transaction. The function is staff-gated in
// Postgres; browser callers supply only the date.
export function closeDayWithRearrangementTasks(
  client: SupabaseClient,
  params: { date: string },
) {
  return client.rpc("close_day_with_rearrangement_tasks", {
    p_date: params.date,
  });
}

// Closure tasks are completed through a diary-aware command rather than a
// generic salon_todos update. Postgres refuses while an active booking remains
// on the closed date (unless staff reopened the date).
export function completeClosureRearrangementTask(
  client: SupabaseClient,
  params: { taskId: string },
) {
  return client.rpc("complete_closure_rearrangement_task", {
    p_task_id: params.taskId,
  });
}

// Staff booking creation ------------------------------------------------

// One row per dog in a same-date staff booking group. Unlike the customer
// RPC, size is staff-authoritative (staff may override a dog's stored size
// per booking) and `id` is the client-generated uuid so the optimistic row,
// the returned row and the realtime echo all match. No group_id — the staff
// flow has never grouped rows and changing that would alter cancel semantics.
export interface StaffBookingGroupRow {
  id?: string;
  dog_id: string;
  slot: string;
  service: string;
  size?: string | null;
  status?: string;
  confirmed?: boolean;
  addons?: string[];
  payment?: string;
  pickup_by_id?: string | null;
  staff_capacity_override?: boolean;
  notify_human_ids?: string[];
  confirmation_channel?: string;
}

// Atomic staff write path for a multi-dog booking (AUDIT-3): all rows insert
// in one transaction, so a capacity/duplicate rejection on any dog rolls the
// whole group back instead of leaving a partial booking. SECURITY INVOKER —
// runs as the calling staff user under the same RLS policy and BEFORE-INSERT
// gates as the direct single insert it complements.
export function createStaffBookingGroup(
  client: SupabaseClient,
  params: { bookingDate: string; bookings: StaffBookingGroupRow[] },
) {
  return client.rpc("create_staff_booking_group", {
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

// ── Visit-level policy commands (previous_day_1500_v1) ────────────────
//
// Every command returns one typed receipt; decode it with
// decodeCustomerVisitReceipt so a malformed or transport-failed response can
// never be mistaken for a committed outcome. While the policy is inactive
// these return a `policy_not_active` blocked receipt and mutate nothing.

export function previewCustomerCancelVisit(
  client: SupabaseClient,
  params: { visitId: string },
) {
  return client.rpc("preview_customer_cancel_visit", {
    p_visit_id: params.visitId,
  });
}

export function cancelCustomerBookingVisit(
  client: SupabaseClient,
  params: {
    visitId: string;
    reviewId: string;
    idempotencyKey: string;
    reason?: string | null;
    paidDepositOutcome?: "refund" | "credit";
  },
) {
  return client.rpc("cancel_customer_booking_visit", {
    p_visit_id: params.visitId,
    p_review_id: params.reviewId,
    p_idempotency_key: params.idempotencyKey,
    p_reason: params.reason ?? null,
    p_paid_deposit_outcome: params.paidDepositOutcome ?? "refund",
  });
}

export function withdrawCustomerBookingVisit(
  client: SupabaseClient,
  params: { visitId: string; idempotencyKey: string; reason?: string | null },
) {
  return client.rpc("withdraw_customer_booking_visit", {
    p_visit_id: params.visitId,
    p_idempotency_key: params.idempotencyKey,
    p_reason: params.reason ?? null,
  });
}

export function withdrawCustomerBookingChangeRequest(
  client: SupabaseClient,
  params: { requestId: string; idempotencyKey: string },
) {
  return client.rpc("withdraw_customer_booking_change_request", {
    p_request_id: params.requestId,
    p_idempotency_key: params.idempotencyKey,
  });
}

export function getCustomerBookingVisitCapabilities(
  client: SupabaseClient,
  params: { visitId: string },
) {
  return client.rpc("get_customer_booking_visit_capabilities", {
    p_visit_id: params.visitId,
  });
}

export function getCustomerCreditBalance(client: SupabaseClient) {
  return client.rpc("get_customer_credit_balance");
}

export function requestCustomerCreditRefund(
  client: SupabaseClient,
  params: { amountPence: number; idempotencyKey: string },
) {
  return client.rpc("request_customer_credit_refund", {
    p_amount_pence: params.amountPence,
    p_idempotency_key: params.idempotencyKey,
  });
}

export function cancelCustomerCreditRefund(
  client: SupabaseClient,
  params: { refundDueId: string; idempotencyKey: string },
) {
  return client.rpc("cancel_customer_credit_refund", {
    p_refund_due_id: params.refundDueId,
    p_idempotency_key: params.idempotencyKey,
  });
}

// Customer-safe booking rules: intake availability, horizon, portal switches,
// the generic Terms link and a read-only deadline description. Never bank
// details, publication hashes or auto-confirm configuration.
export function getCustomerBookingRules(client: SupabaseClient) {
  return client.rpc("current_customer_booking_rules");
}

// Staff-only full Booking Rules, and the audited owner-only save.
export function getBookingRules(client: BookingPolicyRpcTransport) {
  return client.rpc("current_booking_rules");
}

export function updateBookingRules(
  client: BookingPolicyRpcTransport,
  params: { rules: Record<string, unknown> },
) {
  return client.rpc("update_booking_rules", { p_rules: params.rules });
}

// The policy runtime status a client may poll to know when to refetch.
// Browser time never authorises a mutation; the server decides.
export function getBookingPolicyRuntimeStatus(client: BookingPolicyRpcTransport) {
  return client.rpc("booking_policy_runtime_status");
}

// ── Staff visit policy commands ───────────────────────────────────────
//
// All staff-gated and idempotent. Staff-caused changes consume no customer
// reschedule and create no incident; no command releases capacity on a timer.
// `expectedVisitRevision` is always the projected optimistic row version from
// `booking_visits.row_revision`; `booking_visits.revision` is the separate,
// immutable lineage ordinal.

export function approveBookingVisit(
  client: SupabaseClient,
  params: {
    visitId: string;
    expectedVisitRevision: number;
    idempotencyKey: string;
    reason?: string | null;
  },
) {
  return client.rpc("approve_booking_visit", {
    p_visit_id: params.visitId,
    p_expected_visit_revision: params.expectedVisitRevision,
    p_idempotency_key: params.idempotencyKey,
    p_reason: params.reason ?? null,
  });
}

export function declineBookingVisit(
  client: SupabaseClient,
  params: {
    visitId: string;
    expectedVisitRevision: number;
    customerReason: string;
    idempotencyKey: string;
  },
) {
  return client.rpc("decline_booking_visit", {
    p_visit_id: params.visitId,
    p_expected_visit_revision: params.expectedVisitRevision,
    p_customer_reason: params.customerReason,
    p_idempotency_key: params.idempotencyKey,
  });
}

// The customer's bank receipt time decides punctuality — never the later
// staff-check time.
export function recordVisitDepositOutcome(
  client: SupabaseClient,
  params: {
    visitId: string;
    expectedVisitRevision: number;
    outcome: "received" | "not_received";
    bankReceivedAt?: string | null;
    staffReference?: string | null;
    idempotencyKey: string;
    reason?: string | null;
  },
) {
  return client.rpc("record_visit_deposit_outcome", {
    p_visit_id: params.visitId,
    p_expected_visit_revision: params.expectedVisitRevision,
    p_outcome: params.outcome,
    p_bank_received_at: params.bankReceivedAt ?? null,
    p_staff_reference: params.staffReference ?? null,
    p_idempotency_key: params.idempotencyKey,
    p_reason: params.reason ?? null,
  });
}

export function resolveVisitDepositMoney(
  client: SupabaseClient,
  params: {
    visitId: string;
    expectedVisitRevision: number;
    resolution: "refund" | "credit";
    idempotencyKey: string;
    reason: string;
  },
) {
  return client.rpc("resolve_visit_deposit_money", {
    p_visit_id: params.visitId,
    p_expected_visit_revision: params.expectedVisitRevision,
    p_resolution: params.resolution,
    p_idempotency_key: params.idempotencyKey,
    p_reason: params.reason,
  });
}

export function settleBookingRefundDue(
  client: SupabaseClient,
  params: {
    refundDueId: string;
    actualPaidAt: string;
    bankReference: string;
    idempotencyKey: string;
    reason?: string | null;
  },
) {
  return client.rpc("settle_booking_refund_due", {
    p_refund_due_id: params.refundDueId,
    p_actual_paid_at: params.actualPaidAt,
    p_bank_reference: params.bankReference,
    p_idempotency_key: params.idempotencyKey,
    p_reason: params.reason ?? null,
  });
}

export function waiveVisitDepositRequirement(
  client: SupabaseClient,
  params: {
    visitId: string;
    expectedVisitRevision: number;
    reason: string;
    idempotencyKey: string;
  },
) {
  return client.rpc("waive_visit_deposit_requirement", {
    p_visit_id: params.visitId,
    p_expected_visit_revision: params.expectedVisitRevision,
    p_reason: params.reason,
    p_idempotency_key: params.idempotencyKey,
  });
}

export function recordBookingIncident(
  client: SupabaseClient,
  params: {
    visitId: string;
    expectedVisitRevision: number;
    kind:
      | "late_cancellation"
      | "late_reschedule"
      | "no_show"
      | "late_arrival_unserviceable"
      | "late_partial_change";
    reason: string;
    idempotencyKey: string;
  },
) {
  return client.rpc("record_booking_incident", {
    p_visit_id: params.visitId,
    p_expected_visit_revision: params.expectedVisitRevision,
    p_kind: params.kind,
    p_reason: params.reason,
    p_idempotency_key: params.idempotencyKey,
  });
}

// Marking a no-show sends no automatic customer message.
export function markBookingVisitNoShow(
  client: SupabaseClient,
  params: {
    visitId: string;
    expectedVisitRevision: number;
    reason: string;
    idempotencyKey: string;
  },
) {
  return client.rpc("mark_booking_visit_no_show", {
    p_visit_id: params.visitId,
    p_expected_visit_revision: params.expectedVisitRevision,
    p_reason: params.reason,
    p_idempotency_key: params.idempotencyKey,
  });
}

export function setBookingIncidentWaiver(
  client: SupabaseClient,
  params: {
    incidentId: string;
    expectedIncidentRevision: number;
    waived: boolean;
    reason: string;
    idempotencyKey: string;
  },
) {
  return client.rpc("set_booking_incident_waiver", {
    p_incident_id: params.incidentId,
    p_expected_incident_revision: params.expectedIncidentRevision,
    p_waived: params.waived,
    p_reason: params.reason,
    p_idempotency_key: params.idempotencyKey,
  });
}

export function setCustomerDepositOverride(
  client: SupabaseClient,
  params: {
    humanId: string;
    mode: "required" | "waived" | "clear";
    reason: string;
    idempotencyKey: string;
  },
) {
  return client.rpc("set_customer_deposit_override", {
    p_human_id: params.humanId,
    p_mode: params.mode,
    p_reason: params.reason,
    p_idempotency_key: params.idempotencyKey,
  });
}

export function recordCustomerBookingContact(
  client: SupabaseClient,
  params: {
    visitId: string;
    expectedVisitRevision: number;
    channel: "website" | "whatsapp" | "phone" | "email" | "in_person";
    contactedAt: string;
    idempotencyKey: string;
    providerMessageId?: string | null;
  },
) {
  return client.rpc("record_customer_booking_contact", {
    p_visit_id: params.visitId,
    p_expected_visit_revision: params.expectedVisitRevision,
    p_channel: params.channel,
    p_contacted_at: params.contactedAt,
    p_idempotency_key: params.idempotencyKey,
    p_provider_message_id: params.providerMessageId ?? null,
  });
}

export function decideBookingChangeRequest(
  client: SupabaseClient,
  params: {
    requestId: string;
    expectedRequestRevision: number;
    decision: "accept" | "decline";
    reason: string;
    idempotencyKey: string;
    recordIncident?: boolean;
  },
) {
  return client.rpc("decide_booking_change_request", {
    p_request_id: params.requestId,
    p_expected_request_revision: params.expectedRequestRevision,
    p_decision: params.decision,
    p_reason: params.reason,
    p_idempotency_key: params.idempotencyKey,
    p_record_incident: params.recordIncident ?? true,
  });
}

export function getStaffCustomerCreditBalance(
  client: SupabaseClient,
  params: { humanId: string },
) {
  return client.rpc("get_staff_customer_credit_balance", {
    p_human_id: params.humanId,
  });
}

export function getBookingVisitBackfillReview(client: SupabaseClient) {
  return client.rpc("get_booking_visit_backfill_review");
}

// ── Staff visit write commands (Path B) ───────────────────────────────
//
// The v1 staff write path. Whole-visit, idempotent and audited. Staff moves
// consume no customer reschedule allowance and create no incident unless one
// is deliberately recorded. While the policy is inactive these return
// `policy_not_active` and staff continue using createStaffBookingGroup.

export function createStaffBookingVisit(
  client: SupabaseClient,
  params: {
    bookings: unknown[];
    bookingDate: string;
    humanId: string;
    idempotencyKey: string;
    // How staff gave the customer notice of the Terms. Required — the server
    // never defaults it, because bookings are taken in person, by phone and
    // over WhatsApp. This records that staff GAVE notice; it is not customer
    // acceptance.
    termsNoticeMethod: "in_person" | "phone" | "whatsapp" | "email" | "other";
    source?: string;
  },
) {
  return client.rpc("create_staff_booking_visit", {
    p_bookings: params.bookings,
    p_booking_date: params.bookingDate,
    p_human_id: params.humanId,
    p_idempotency_key: params.idempotencyKey,
    p_terms_notice_method: params.termsNoticeMethod,
    p_source: params.source ?? "staff",
  });
}

// `expectedRevision` is the projected `booking_visits.row_revision` the staff
// member had on screen. A mismatch returns `stale_review` so a concurrent edit
// is never overwritten; it is never the immutable lineage ordinal.
export function cancelStaffBookingVisit(
  client: SupabaseClient,
  params: {
    visitId: string;
    expectedRevision: number;
    idempotencyKey: string;
    reason?: string | null;
    paidDepositOutcome?: "refund" | "credit";
    // Required when the visit carries non-deposit prepayment: the money is
    // never silently stranded.
    prepaymentHandling?: "reconciliation_required" | "refund_due" | "transfer" | null;
    // Required for a `transfer`: a same-customer active destination visit.
    prepaymentTargetVisitId?: string | null;
    // Required for a `refund_due`: the date staff promised the customer. Must
    // be in the future — the server never invents the deposit's
    // five-working-day promise for service prepayment.
    prepaymentRefundDueAt?: string | null;
    recordIncident?: boolean;
    incidentKind?: string | null;
  },
) {
  return client.rpc("cancel_staff_booking_visit", {
    p_visit_id: params.visitId,
    p_expected_revision: params.expectedRevision,
    p_idempotency_key: params.idempotencyKey,
    p_reason: params.reason ?? null,
    p_paid_deposit_outcome: params.paidDepositOutcome ?? "refund",
    p_prepayment_handling: params.prepaymentHandling ?? null,
    p_record_incident: params.recordIncident ?? false,
    p_incident_kind: params.incidentKind ?? null,
    p_prepayment_target_visit_id: params.prepaymentTargetVisitId ?? null,
    p_prepayment_refund_due_at: params.prepaymentRefundDueAt ?? null,
  });
}

export function rescheduleStaffBookingVisit(
  client: SupabaseClient,
  params: {
    visitId: string;
    expectedRevision: number;
    bookingDate: string;
    slotAssignments: Array<{ dog_id: string; slot: string }>;
    idempotencyKey: string;
    reason?: string | null;
  },
) {
  return client.rpc("reschedule_staff_booking_visit", {
    p_visit_id: params.visitId,
    p_expected_revision: params.expectedRevision,
    p_booking_date: params.bookingDate,
    p_slot_assignments: params.slotAssignments,
    p_idempotency_key: params.idempotencyKey,
    p_reason: params.reason ?? null,
  });
}

export function updateStaffBookingVisit(
  client: SupabaseClient,
  params: {
    visitId: string;
    expectedRevision: number;
    changes: Array<{ bookingId: string; service?: string; addons?: string[] }>;
    idempotencyKey: string;
    reason: string;
  },
) {
  return client.rpc("update_staff_booking_visit", {
    p_visit_id: params.visitId,
    p_expected_revision: params.expectedRevision,
    p_changes: params.changes,
    p_idempotency_key: params.idempotencyKey,
    p_reason: params.reason,
  });
}
