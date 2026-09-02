// Dogs repository for the customer surface. Read-side queries live
// here; writes go through the typed RPC wrappers in supabase/rpc.ts
// (updateCustomerDog, createCustomerDog) because the database guards
// them with SECURITY DEFINER functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DogSize } from "../../constants/salon";
import { createCustomerDog, updateCustomerDog } from "../rpc";

export interface CustomerDog {
  id: string;
  name: string;
  breed: string;
  size: DogSize | null;
  reportedSize: DogSize | null;
  isPregnant: boolean;
  // "YYYY-MM" (month & year only); older rows may hold a full "YYYY-MM-DD".
  // Optional: only dashboard reads carry it — wizard-side dog shapes don't.
  dob?: string | null;
}

interface DbDogRow {
  id: string;
  name: string | null;
  breed: string | null;
  size: string | null;
  reported_size: string | null;
  is_pregnant: boolean | null;
  dob: string | null;
}

function dbRowToCustomerDog(row: DbDogRow): CustomerDog {
  return {
    id: row.id,
    name: row.name ?? "",
    breed: row.breed ?? "",
    size: (row.size as DogSize | null) ?? null,
    reportedSize: (row.reported_size as DogSize | null) ?? null,
    isPregnant: row.is_pregnant ?? false,
    dob: row.dob ?? null,
  };
}

export async function createForHuman(
  client: SupabaseClient,
  { humanId, name, breed, size }: { humanId: string; name: string; breed?: string | null; size?: DogSize | null },
): Promise<{ dog: CustomerDog | null; error: Error | null }> {
  const { data, error } = await createCustomerDog(client, {
    name,
    breed: breed ?? null,
    size: size ?? null,
    humanId,
  });
  if (error) return { dog: null, error: new Error(error.message) };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { dog: null, error: new Error("create_customer_dog returned no row") };
  return {
    dog: {
      id: row.id,
      name: row.name ?? "",
      breed: row.breed ?? "",
      size: null,
      reportedSize: (row.reported_size as DogSize | null) ?? null,
      isPregnant: false, // a freshly-added dog is never pregnant; staff set it later
      dob: (row as { dob?: string | null }).dob ?? null,
    },
    error: null,
  };
}

// The fields update_customer_dog returns, app-shaped. Deliberately a partial
// of CustomerDog: the RPC doesn't return is_pregnant, so callers merge this
// over their existing dog object rather than replacing it (a true pregnancy
// flag in local state must survive a name edit).
export interface CustomerDogUpdate {
  id: string;
  name: string;
  breed: string;
  size: DogSize | null;
  reportedSize: DogSize | null;
  dob: string | null;
}

// Edit a customer's own dog through the SECURITY DEFINER RPC (ownership
// validated server-side; authoritative size is cleared when breed/reported
// size change). Error messages are preserved verbatim — DogsSection maps the
// RPC's stable codes (not_authenticated, dog_not_found, …) to friendly copy.
export async function updateForCustomer(
  client: SupabaseClient,
  { dogId, name, breed, size, dob }: {
    dogId: string;
    name: string;
    breed: string;
    size: string;
    dob: string | null;
  },
): Promise<{ dog: CustomerDogUpdate | null; error: Error | null }> {
  const { data, error } = await updateCustomerDog(client, {
    dogId,
    name,
    breed,
    size,
    dob,
  });
  if (error) return { dog: null, error: new Error(error.message) };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { dog: null, error: new Error("update_customer_dog returned no row") };
  return {
    dog: {
      id: row.id,
      name: row.name ?? "",
      breed: row.breed ?? "",
      size: (row.size as DogSize | null) ?? null,
      reportedSize: (row.reported_size as DogSize | null) ?? null,
      dob: (row as { dob?: string | null }).dob ?? null,
    },
    error: null,
  };
}

export async function listForHuman(
  client: SupabaseClient,
  { humanId, signal }: { humanId: string; signal?: AbortSignal },
): Promise<{ dogs: CustomerDog[]; error: Error | null }> {
  let q = client
    .from("dogs")
    .select("id, name, breed, size, reported_size, is_pregnant, dob")
    .eq("human_id", humanId)
    .order("name");
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) return { dogs: [], error: new Error(error.message) };
  return {
    dogs: (data ?? []).map((row: DbDogRow) => dbRowToCustomerDog(row)),
    error: null,
  };
}

/** The dog columns the inbox customer-context panel reads; raw PostgREST result. */
export function listCustomerContextDogs(client: SupabaseClient, humanId: string, signal?: AbortSignal) {
  const q = client
    .from("dogs")
    .select("id, name, breed, age, size, alerts, groom_notes")
    .eq("human_id", humanId)
    .order("name");
  return signal ? q.abortSignal(signal) : q;
}

/** The dog columns the weekly cash-up needs (custom price + names); raw PostgREST result. */
export function listCashUpDogs(client: SupabaseClient, signal?: AbortSignal) {
  const q = client.from("dogs").select("id, name, breed, human_id, custom_price, size");
  return signal ? q.abortSignal(signal) : q;
}
