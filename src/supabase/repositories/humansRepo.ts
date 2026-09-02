// Humans repository.
//
// Customer-side writes go through the typed RPC wrappers in supabase/rpc.ts
// (linkCustomerToHuman, addCustomerTrustedHuman) because the DB guards them
// with SECURITY DEFINER functions. Query-based reads that would otherwise be
// hand-built inside a component live here, so the snake_case↔app boundary is
// in one testable place (debt register #12).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface HumanSearchHit {
  id: string;
  name: string | null;
  surname: string | null;
  phone: string | null;
}

const SEARCH_COLS = "id, name, surname, phone";

/**
 * Merge several human result sets into one, deduped by id with first-seen
 * order preserved, capped at 20. Pure — split out from searchHumansAndDogs so
 * the dedupe/order/cap rules are unit-testable without a live client.
 */
export function mergeHumanSearchHits(...lists: (HumanSearchHit[] | null | undefined)[]): HumanSearchHit[] {
  const seen = new Set<string>();
  const merged: HumanSearchHit[] = [];
  for (const list of lists) {
    for (const row of list ?? []) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged.slice(0, 20);
}

/**
 * Fetch a single human by id for the customer picker shape (id / name /
 * surname / phone). Used to pre-target the "New message" composer when a
 * caller only knows the human id (e.g. "Message owner" from a booking with no
 * existing thread). Returns null if not found or on error — the caller falls
 * back to the manual search.
 */
export async function getHumanById(
  client: SupabaseClient,
  id: string,
): Promise<HumanSearchHit | null> {
  if (!client || !id) return null;
  const { data, error } = await client
    .from("humans")
    .select(SEARCH_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as HumanSearchHit;
}

/**
 * Who already holds a phone number — the answer the Human card needs when a
 * number save collides with humans_phone_unique. `isPendingSignup` is the
 * "Join the Pack" shell state: a self-signup that staff have not approved and
 * that carries a portal login, i.e. exactly what link_pending_signup() accepts.
 */
export interface HumanByPhoneHit {
  id: string;
  name: string | null;
  surname: string | null;
  phone: string | null;
  isPendingSignup: boolean;
}

const BY_PHONE_COLS = "id, name, surname, phone, source, approved_at, customer_user_id";

export async function findHumanByPhone(
  client: SupabaseClient,
  phone: string,
): Promise<HumanByPhoneHit | null> {
  const trimmed = (phone || "").trim();
  if (!trimmed) return null;
  const { data, error } = await client
    .from("humans")
    .select(BY_PHONE_COLS)
    .eq("phone", trimmed)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    id: string;
    name: string | null;
    surname: string | null;
    phone: string | null;
    source: string | null;
    approved_at: string | null;
    customer_user_id: string | null;
  };
  return {
    id: row.id,
    name: row.name,
    surname: row.surname,
    phone: row.phone,
    isPendingSignup:
      row.source === "self_signup" && !row.approved_at && !!row.customer_user_id,
  };
}

/**
 * Staff customer picker search: match humans by name / surname / phone, plus
 * the owners of any dog whose name matches. Returns a deduped, first-seen,
 * capped-at-20 list. Moved out of ComposeNewModal so the query + merge live in
 * the repo layer rather than being constructed in JSX.
 */
export async function searchHumansAndDogs(
  client: SupabaseClient,
  query: string,
): Promise<HumanSearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const likeTerm = `%${trimmed}%`;

  const [byName, bySurname, byPhone, dogHits] = await Promise.all([
    client.from("humans").select(SEARCH_COLS).ilike("name", likeTerm).limit(10),
    client.from("humans").select(SEARCH_COLS).ilike("surname", likeTerm).limit(10),
    client.from("humans").select(SEARCH_COLS).ilike("phone", likeTerm).limit(10),
    client.from("dogs").select("human_id").ilike("name", likeTerm).limit(20),
  ]);

  const dogOwnerIds = ((dogHits.data ?? []) as { human_id: string | null }[])
    .map((d) => d.human_id)
    .filter((id): id is string => Boolean(id));

  let dogOwners: HumanSearchHit[] = [];
  if (dogOwnerIds.length) {
    const { data } = await client.from("humans").select(SEARCH_COLS).in("id", dogOwnerIds);
    dogOwners = (data ?? []) as HumanSearchHit[];
  }

  return mergeHumanSearchHits(
    (byName.data ?? []) as HumanSearchHit[],
    (bySurname.data ?? []) as HumanSearchHit[],
    (byPhone.data ?? []) as HumanSearchHit[],
    dogOwners,
  );
}

export interface HumanBookingRules {
  preferredSlots: string[];
  blockedSlots: string[];
  depositRequired: boolean;
}

/**
 * Per-human booking rules for the portal wizard (customers can SELECT their
 * own humans row). Returns null on any error — callers treat that as "no
 * rules" and rely on the DB trigger as the authority.
 */
export async function getBookingRules(
  client: SupabaseClient,
  humanId: string,
): Promise<HumanBookingRules | null> {
  if (!client || !humanId) return null;
  const { data, error } = await client
    .from("humans")
    .select("preferred_slots, blocked_slots, deposit_required")
    .eq("id", humanId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    preferredSlots: data.preferred_slots || [],
    blockedSlots: data.blocked_slots || [],
    depositRequired: data.deposit_required === true,
  };
}

// ---------------------------------------------------------------------------
// Staff messaging contact reads (Debt #12). Thin, column-explicit reads that
// CollectionNoticeModal and SendReminderModal used to build inline. Results
// are returned raw ({ data, error }) so the modals keep their own error
// handling; the columns are the exact projections they read.
// ---------------------------------------------------------------------------

/** The columns the collection-notice recipient list renders. */
export const CONTACT_CARD_COLS = "id, name, surname, phone, whatsapp_opted_out";

/** One contact card by human id (owner or trusted contact). */
export function getContactCard(client: SupabaseClient, humanId: string) {
  return client.from("humans").select(CONTACT_CARD_COLS).eq("id", humanId).maybeSingle();
}

/** Contact cards for a set of human ids (the owner's trusted contacts). */
export function listContactCards(client: SupabaseClient, humanIds: string[]) {
  return client.from("humans").select(CONTACT_CARD_COLS).in("id", humanIds);
}

/** The one-way trust links from an owner: who they trust, and as what. */
export function listTrustedContactLinks(client: SupabaseClient, humanId: string) {
  return client
    .from("human_trusted_contacts")
    .select("trusted_id, relationship")
    .eq("human_id", humanId);
}

/** The humans columns the inbox customer-context panel reads. */
export const CUSTOMER_CONTEXT_COLS =
  "id, name, surname, phone, email, address, notes, sms, whatsapp, history_flag";

/** One customer's context row for the inbox panel; raw PostgREST result. */
export function getCustomerContextProfile(client: SupabaseClient, humanId: string, signal?: AbortSignal) {
  const q = client.from("humans").select(CUSTOMER_CONTEXT_COLS).eq("id", humanId);
  return (signal ? q.abortSignal(signal) : q).maybeSingle();
}

/**
 * Trusted contacts with the contact's own name embedded through the
 * trusted_id FK (the "humans!trusted_id" alias is the named-relationship
 * syntax), so the inbox panel needs no second lookup. Raw PostgREST result.
 */
export function listTrustedContactsWithNames(client: SupabaseClient, humanId: string, signal?: AbortSignal) {
  const q = client
    .from("human_trusted_contacts")
    .select("trusted_id, relationship, trusted:humans!trusted_id(id, name, surname)")
    .eq("human_id", humanId);
  return signal ? q.abortSignal(signal) : q;
}

/** The columns the reminder channel picker gates on (contact details + opt-outs). */
export const REMINDER_CONTACT_COLS =
  "id, name, surname, phone, whatsapp, sms, email, whatsapp_opted_out, sms_opted_out, email_opted_out";

/** One customer's reminder contact details by human id. */
export function getReminderContact(client: SupabaseClient, humanId: string) {
  return client.from("humans").select(REMINDER_CONTACT_COLS).eq("id", humanId).maybeSingle();
}

/** The human columns the weekly cash-up needs (names + phone); raw PostgREST result. */
export function listCashUpHumans(client: SupabaseClient, signal?: AbortSignal) {
  const q = client.from("humans").select("id, name, surname, phone");
  return signal ? q.abortSignal(signal) : q;
}
