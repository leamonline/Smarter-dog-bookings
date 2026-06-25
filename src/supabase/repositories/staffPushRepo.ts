// Repository for staff Web Push: owns the snake_case ↔ camelCase boundary for
// staff_push_subscriptions and staff_alert_prefs. Components/hooks call these
// and never see DB column names. Uses the STAFF client (passed in) — RLS scopes
// every row to the calling staff member.
import type { SupabaseClient } from "@supabase/supabase-js";

/** The six per-staff alert categories (camelCase). */
export interface StaffAlertPrefs {
  messages: boolean;
  newBooking: boolean;
  cancellation: boolean;
  reschedule: boolean;
  newClient: boolean;
  waitlist: boolean;
}

export const DEFAULT_STAFF_ALERT_PREFS: StaffAlertPrefs = {
  messages: true,
  newBooking: true,
  cancellation: true,
  reschedule: true,
  newClient: true,
  waitlist: true,
};

interface DbPrefsRow {
  user_id: string;
  messages: boolean;
  new_booking: boolean;
  cancellation: boolean;
  reschedule: boolean;
  new_client: boolean;
  waitlist: boolean;
}

export function dbRowToPrefs(row: DbPrefsRow): StaffAlertPrefs {
  return {
    messages: row.messages,
    newBooking: row.new_booking,
    cancellation: row.cancellation,
    reschedule: row.reschedule,
    newClient: row.new_client,
    waitlist: row.waitlist,
  };
}

export function prefsToDbRow(userId: string, prefs: StaffAlertPrefs): DbPrefsRow {
  return {
    user_id: userId,
    messages: prefs.messages,
    new_booking: prefs.newBooking,
    cancellation: prefs.cancellation,
    reschedule: prefs.reschedule,
    new_client: prefs.newClient,
    waitlist: prefs.waitlist,
  };
}

/** Read this staff member's prefs, or null if they have no row yet. */
export async function getPrefs(
  client: SupabaseClient,
  userId: string,
): Promise<{ prefs: StaffAlertPrefs | null; error: Error | null }> {
  const { data, error } = await client
    .from("staff_alert_prefs")
    .select("user_id, messages, new_booking, cancellation, reschedule, new_client, waitlist")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { prefs: null, error };
  return { prefs: data ? dbRowToPrefs(data as DbPrefsRow) : null, error: null };
}

/** Insert/update this staff member's prefs row. */
export async function upsertPrefs(
  client: SupabaseClient,
  userId: string,
  prefs: StaffAlertPrefs,
): Promise<{ error: Error | null }> {
  const { error } = await client
    .from("staff_alert_prefs")
    .upsert({ ...prefsToDbRow(userId, prefs), updated_at: new Date().toISOString() }, {
      onConflict: "user_id",
    });
  return { error };
}

export interface StaffSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

/** Upsert a device subscription (keyed by its unique endpoint). */
export async function saveSubscription(
  client: SupabaseClient,
  sub: StaffSubscriptionInput,
): Promise<{ error: Error | null }> {
  const { error } = await client.from("staff_push_subscriptions").upsert(
    {
      user_id: sub.userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent ?? null,
      last_used_at: new Date().toISOString(),
      failure_count: 0,
    },
    { onConflict: "endpoint" },
  );
  return { error };
}

/** Remove a device subscription by endpoint (on disable). */
export async function deleteSubscriptionByEndpoint(
  client: SupabaseClient,
  endpoint: string,
): Promise<{ error: Error | null }> {
  const { error } = await client
    .from("staff_push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  return { error };
}
