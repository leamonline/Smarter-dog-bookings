// _shared/calendar-auth.ts — Feed token validation for calendar endpoints
// Calendar apps (Apple Calendar, Google Calendar, Outlook) cannot carry JWTs,
// so we use opaque bearer tokens stored in the calendar_feed_tokens table.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface TokenInfo {
  humanId: string | null;
  staffUserId: string | null;
  feedType: "customer" | "staff";
}

/**
 * Validate a calendar feed token against the database.
 * Returns the token owner info or null if invalid/expired/inactive.
 * Also updates `last_accessed` on the token.
 */
export async function validateFeedToken(
  token: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<TokenInfo | null> {
  if (!token) return null;

  const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("calendar_feed_tokens")
    .select("id, human_id, staff_user_id, feed_type, expires_at")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;

  // Check expiry if set
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null;
  }

  // Update last_accessed (fire and forget — don't block the response)
  supabase
    .from("calendar_feed_tokens")
    .update({ last_accessed: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return {
    humanId: data.human_id,
    staffUserId: data.staff_user_id,
    feedType: data.feed_type as "customer" | "staff",
  };
}
