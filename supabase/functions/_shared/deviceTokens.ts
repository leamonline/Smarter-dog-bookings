// ============================================================
// supabase/functions/_shared/deviceTokens.ts
//
// Read a customer's registered iPhone tokens. Service-role callers only
// (RLS lets a person read their own rows, which is not this lookup).
// A lookup failure returns no tokens so the reminder falls back to
// WhatsApp rather than failing the whole run.
// ============================================================

import { apnsTokenIsFresh, type ApnsSeen } from "./apnsChannel.ts";

export interface DeviceTokenRow {
  id: string;
  apns_token: string;
  environment: string;
  bundle_id: string;
  last_seen_at: string | null;
  notifications_enabled: boolean | null;
}

// deno-lint-ignore no-explicit-any
type DeviceTokenLookup = any;

function seenOf(row: DeviceTokenRow): ApnsSeen {
  return {
    notificationsEnabled: row.notifications_enabled === true,
    lastSeenAt: row.last_seen_at,
  };
}

/** apns-send refuses more than this many devices in one call. Newest phones are kept. */
export const MAX_PUSH_TOKENS = 20;

/**
 * Tokens that may be pushed right now: notifications on, seen within 14 days,
 * sandbox or production. At most MAX_PUSH_TOKENS, newest last_seen_at first,
 * so a long registration history cannot make the send refuse the whole reminder.
 */
export function sendableDeviceTokens(
  rows: readonly DeviceTokenRow[],
  now: Date,
  limit: number = MAX_PUSH_TOKENS,
): DeviceTokenRow[] {
  return rows
    .filter((row) =>
      (row.environment === "sandbox" || row.environment === "production") &&
      typeof row.apns_token === "string" &&
      row.apns_token.length > 0 &&
      apnsTokenIsFresh(seenOf(row), now)
    )
    .sort((a, b) => {
      const aSeen = Date.parse(a.last_seen_at ?? "") || 0;
      const bSeen = Date.parse(b.last_seen_at ?? "") || 0;
      if (bSeen !== aSeen) return bSeen - aSeen;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, limit);
}

export async function loadDeviceTokensForHuman(
  supabase: DeviceTokenLookup,
  humanId: string,
): Promise<DeviceTokenRow[]> {
  const { data: human, error: humanErr } = await supabase
    .from("humans")
    .select("customer_user_id")
    .eq("id", humanId)
    .maybeSingle();
  if (humanErr) {
    console.error("device token lookup: human", humanErr.message);
    return [];
  }
  const userId = human?.customer_user_id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from("device_tokens")
    .select("id, apns_token, environment, bundle_id, last_seen_at, notifications_enabled")
    .eq("user_id", userId);
  if (error) {
    console.error("device token lookup:", error.message);
    return [];
  }
  return data ?? [];
}
