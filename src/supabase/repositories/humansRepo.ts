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
