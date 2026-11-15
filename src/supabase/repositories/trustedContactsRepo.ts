// Customer-added trusted contacts (20261115120100), staff side. Customers write
// through SECURITY DEFINER RPCs (supabase/rpc.ts); staff read and remove them
// directly, which RLS allows for staff only. Rows cross this boundary
// app-shaped, so components never see the table's column names.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CustomerAddedContact {
  id: string;
  name: string;
  surname: string | null;
  phone: string;
  relationship: string | null;
  addedAt: string | null;
}

interface Row {
  id: string;
  name: string | null;
  surname: string | null;
  phone: string | null;
  relationship: string | null;
  created_at: string | null;
}

export async function listCustomerAddedContacts(
  client: SupabaseClient,
  ownerHumanId: string,
): Promise<{ contacts: CustomerAddedContact[]; error: Error | null }> {
  const { data, error } = await client
    .from("customer_trusted_contacts")
    .select("id, name, surname, phone, relationship, created_at")
    .eq("owner_human_id", ownerHumanId)
    .order("created_at");
  if (error) return { contacts: [], error: new Error(error.message) };
  return {
    contacts: ((data ?? []) as Row[]).map((row) => ({
      id: row.id,
      name: row.name ?? "",
      surname: row.surname,
      phone: row.phone ?? "",
      relationship: row.relationship,
      addedAt: row.created_at,
    })),
    error: null,
  };
}

/** True only when a row was actually removed. */
export async function removeCustomerAddedContact(
  client: SupabaseClient,
  id: string,
): Promise<{ removed: boolean; error: Error | null }> {
  const { data, error } = await client
    .from("customer_trusted_contacts")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { removed: false, error: new Error(error.message) };
  return { removed: (data ?? []).length > 0, error: null };
}
