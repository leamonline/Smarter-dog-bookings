// Staff account data access — the one place that touches the Supabase client
// for a staff member's own profile + auth credentials. Keeps these queries out
// of AccountSettings.jsx (Debt #12): the client is owned here, and the query
// shapes are testable rather than hand-built in JSX.
import { supabase } from "../client";

/** Whether the account backend is reachable (false in offline/sample mode). */
export function isAccountBackendAvailable(): boolean {
  return !!supabase;
}

/** Update the staff member's display name + phone on their staff_profiles row. */
export async function updateStaffProfile(
  profileId: string,
  fields: { displayName: string; phone: string },
) {
  if (!supabase) return { error: new Error("offline"), data: null };
  return supabase
    .from("staff_profiles")
    .update({ display_name: fields.displayName, phone: fields.phone })
    .eq("id", profileId);
}

/** Change the signed-in staff user's login email (sends a confirmation email). */
export async function updateAccountEmail(email: string) {
  if (!supabase) return { error: new Error("offline"), data: null };
  return supabase.auth.updateUser({ email });
}
