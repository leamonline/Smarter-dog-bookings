import type { SupabaseClient } from "@supabase/supabase-js";
import { DOG_SIZES, type DogSize } from "../../constants/salon";

export interface SignupDog {
  id: string;
  name: string;
  breed: string | null;
  size: DogSize | null;
  reportedSize: string | null;
}
export interface PendingSignup {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  submittedAt: string;
  dogs: { id: string; name: string }[];
}
export interface SignupReview extends PendingSignup { activeDogs: SignupDog[] }
export interface SignupPage { customers: PendingSignup[]; total: number }
export const SIGNUP_PAGE_SIZE = 5;
const HUMAN_COLUMNS = "id, name, surname, phone, email, signup_submitted_at, dogs(id, name)";
const DOG_COLUMNS = "id, name, breed, size, reported_size";

interface HumanRow {
  id: string; name: string | null; surname: string | null;
  phone: string | null; email: string | null; signup_submitted_at: string;
  dogs: { id: string; name: string | null }[];
}
function toSignup(row: HumanRow): PendingSignup {
  return {
    id: row.id, name: [row.name, row.surname].filter(Boolean).join(" ") || "Unnamed customer",
    phone: row.phone, email: row.email, submittedAt: row.signup_submitted_at,
    dogs: (row.dogs || []).map(dog => ({ id: dog.id, name: dog.name || "Unnamed dog" })),
  };
}
function pendingQuery(client: SupabaseClient) {
  return client.from("humans").select(HUMAN_COLUMNS, { count: "exact" })
    .is("approved_at", null).not("signup_submitted_at", "is", null).is("archived_at", null)
    .is("dogs.archived_at", null);
}

export async function listPendingSignups(client: SupabaseClient, page: number): Promise<SignupPage> {
  const { data, error, count } = await pendingQuery(client)
    .order("signup_submitted_at", { ascending: true }).order("id", { ascending: true })
    .range(page * SIGNUP_PAGE_SIZE, (page + 1) * SIGNUP_PAGE_SIZE - 1);
  if (error || count === null) throw new Error("Couldn't load awaiting approvals. Please try again.");
  return { customers: ((data || []) as unknown as HumanRow[]).map(toSignup), total: count };
}

export async function getSignupReview(client: SupabaseClient, humanId: string): Promise<SignupReview> {
  const { data, error } = await pendingQuery(client).eq("id", humanId).maybeSingle();
  if (error) throw new Error("Couldn't load this signup. Please try again.");
  if (!data) throw new Error("This signup is no longer awaiting approval. Close this panel and refresh the queue.");
  // Read every active dog, independently of the paginated directory cache.
  const activeDogs: SignupDog[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const result = await client.from("dogs").select(DOG_COLUMNS)
      .eq("human_id", humanId).is("archived_at", null).order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (result.error) throw new Error("Couldn't load all dogs. Please try again before approving.");
    const rows = result.data || [];
    for (const dog of rows) activeDogs.push({
      id: dog.id, name: dog.name || "Unnamed dog", breed: dog.breed,
      size: DOG_SIZES.includes(dog.size) ? dog.size : null, reportedSize: dog.reported_size,
    });
    if (rows.length < pageSize) break;
  }
  return { ...toSignup(data as unknown as HumanRow), activeDogs };
}

/** Staff RLS remains the write boundary. Never overwrite a changed breed/size. */
export async function saveSignupDogSize(
  client: SupabaseClient, humanId: string, dog: SignupDog, size: DogSize,
): Promise<void> {
  if (!DOG_SIZES.includes(size)) throw new Error("Choose a valid dog size.");
  let query = client.from("dogs").update({ size }).eq("id", dog.id)
    .eq("human_id", humanId).is("archived_at", null);
  query = dog.size === null ? query.is("size", null) : query.eq("size", dog.size);
  query = dog.breed === null ? query.is("breed", null) : query.eq("breed", dog.breed);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(`Couldn't save ${dog.name}'s size. Some earlier sizes may have saved. Reload the review before trying again.`);
  if (!data) throw new Error(`${dog.name}'s details have changed. Some earlier sizes may have saved. Reload the review before trying again.`);
}
