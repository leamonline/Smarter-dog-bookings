// Dogs repository for the customer surface. Read-side queries live
// here; writes go through the typed RPC wrappers in supabase/rpc.ts
// (updateCustomerDog, createCustomerDog) because the database guards
// them with SECURITY DEFINER functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DogSize } from "../../constants/salon";
import { createCustomerDog } from "../rpc";

export interface CustomerDog {
  id: string;
  name: string;
  breed: string;
  size: DogSize | null;
  isPregnant: boolean;
}

interface DbDogRow {
  id: string;
  name: string | null;
  breed: string | null;
  size: string | null;
  is_pregnant: boolean | null;
}

function dbRowToCustomerDog(row: DbDogRow): CustomerDog {
  return {
    id: row.id,
    name: row.name ?? "",
    breed: row.breed ?? "",
    size: (row.size as DogSize | null) ?? null,
    isPregnant: row.is_pregnant ?? false,
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
      size: (row.size as DogSize | null) ?? null,
      isPregnant: false, // a freshly-added dog is never pregnant; staff set it later
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
    .select("id, name, breed, size, is_pregnant")
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
