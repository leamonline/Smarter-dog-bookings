// Dogs repository for the customer surface. Read-side queries live
// here; writes go through the typed RPC wrappers in supabase/rpc.ts
// (updateCustomerDog) because the database guards them with a
// SECURITY DEFINER function.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DogSize } from "../../constants/salon";

export interface CustomerDog {
  id: string;
  name: string;
  breed: string;
  size: DogSize | null;
}

interface DbDogRow {
  id: string;
  name: string | null;
  breed: string | null;
  size: string | null;
}

function dbRowToCustomerDog(row: DbDogRow): CustomerDog {
  return {
    id: row.id,
    name: row.name ?? "",
    breed: row.breed ?? "",
    size: (row.size as DogSize | null) ?? null,
  };
}

export async function listForHuman(
  client: SupabaseClient,
  { humanId, signal }: { humanId: string; signal?: AbortSignal },
): Promise<{ dogs: CustomerDog[]; error: Error | null }> {
  let q = client
    .from("dogs")
    .select("id, name, breed, size")
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
