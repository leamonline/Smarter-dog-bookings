// ============================================================
// supabase/functions/_shared/apnsChannel.ts
//
// Whether a reminder may go to the iPhone app instead of WhatsApp.
//
// Pure and dependency-free. The flag, the 14-day freshness rule and the
// "notifications off" rule live here so notify-booking-reminder and
// reminder-send cannot drift apart. Nothing in this file sends a push
// or reads the database.
//
// IOS_PUSH_ENABLED defaults off. Unset, empty, or any value other than
// the ones iosPushEnabled accepts means reminders stay on today's path.
// ============================================================

/** A token last seen longer ago than this is not used. "Older than 14 days" is stale; exactly 14 days is still fresh. */
export const APNS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface ApnsSeen {
  notificationsEnabled: boolean;
  lastSeenAt: string | null;
}

/** True only for an explicit on-switch. Everything else, including unset, is off. */
export function iosPushEnabled(raw: string | null | undefined): boolean {
  switch ((raw ?? "").trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    default:
      return false;
  }
}

/**
 * A token can receive a reminder when notifications are on and the app has
 * been seen within 14 days. A last_seen_at in the future (clock skew) still
 * counts as fresh. A missing or unparseable timestamp does not.
 */
export function apnsTokenIsFresh(token: ApnsSeen, now: Date): boolean {
  if (!token.notificationsEnabled) return false;
  if (!token.lastSeenAt) return false;
  const seen = Date.parse(token.lastSeenAt);
  if (Number.isNaN(seen)) return false;
  const age = now.getTime() - seen;
  if (age < 0) return true;
  return age <= APNS_MAX_AGE_MS;
}

export function freshApnsTokens<T extends ApnsSeen>(tokens: readonly T[], now: Date): T[] {
  return tokens.filter((token) => apnsTokenIsFresh(token, now));
}
