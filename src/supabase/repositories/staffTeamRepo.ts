// Staff team data access: the list of people who can sign in to the staff
// dashboard. Reads staff_profiles (every signed-in user may read it under RLS).
//
// There is deliberately NO insert here. Creating a staff row is revoked for
// every client role because is_staff() trusts a row's existence; the only way
// in is the owner-only `staff-invite` Edge Function.
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffRoleName = "owner" | "staff";

export interface StaffMember {
  id: string;
  userId: string;
  role: StaffRoleName;
  displayName: string;
  createdAt: string | null;
}

interface StaffProfileRow {
  id: string;
  user_id: string;
  role: string;
  display_name: string | null;
  created_at: string | null;
}

/** snake_case row to the app's camelCase shape. Anything but "owner" is plain staff. */
export function toStaffMember(row: StaffProfileRow): StaffMember {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role === "owner" ? "owner" : "staff",
    displayName: (row.display_name ?? "").trim(),
    createdAt: row.created_at ?? null,
  };
}

/** Everyone on the team, oldest first. */
export async function listStaffTeam(client: SupabaseClient) {
  const { data, error } = await client
    .from("staff_profiles")
    .select("id, user_id, role, display_name, created_at")
    .order("created_at", { ascending: true });
  return {
    data: ((data ?? []) as StaffProfileRow[]).map(toStaffMember),
    error,
  };
}
