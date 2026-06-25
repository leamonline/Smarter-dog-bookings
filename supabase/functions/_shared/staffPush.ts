// ============================================================
// supabase/functions/_shared/staffPush.ts
//
// Pure, dependency-light core for staff Web Push:
//   - buildStaffPushMessage(): event_type + context → { title, body, url }
//   - selectRecipients(): apply per-staff category prefs + actor suppression
//
// Kept pure (only imports the existing _shared/format helpers) so it is
// unit-testable under Vitest as well as runnable in the Deno edge runtime.
// The DB triggers pass event_type + structured context; ALL human wording
// lives here, in one tested place, rather than being duplicated in SQL.
//
// Staff-only.
// ============================================================

import { formatDateShort, formatTime, sanitise } from "./format.ts";

export const STAFF_EVENT_TYPES = [
  "message",
  "new_booking",
  "cancellation",
  "reschedule",
  "new_client",
  "waitlist",
] as const;

export type StaffEventType = (typeof STAFF_EVENT_TYPES)[number];

export function isStaffEventType(value: unknown): value is StaffEventType {
  return (
    typeof value === "string" &&
    (STAFF_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/** Structured fields the triggers forward; all optional and untrusted. */
export interface StaffPushContext {
  customerName?: string | null;
  dogName?: string | null;
  service?: string | null;
  /** ISO date "yyyy-mm-dd". */
  bookingDate?: string | null;
  /** Slot "09:00". */
  slot?: string | null;
  previousBookingDate?: string | null;
  previousSlot?: string | null;
  senderName?: string | null;
}

export interface StaffPushMessage {
  title: string;
  body: string;
  url: string;
  /** Which staff_alert_prefs category gates this (same as event type). */
  category: StaffEventType;
  /** notification_log.trigger_type value. */
  triggerType: string;
}

/** Map an event type to its staff_alert_prefs boolean column. */
export const CATEGORY_COLUMN: Record<StaffEventType, string> = {
  message: "messages",
  new_booking: "new_booking",
  cancellation: "cancellation",
  reschedule: "reschedule",
  new_client: "new_client",
  waitlist: "waitlist",
};

function safe(value: string | null | undefined, fallback: string): string {
  const cleaned = value ? sanitise(value) : "";
  return cleaned || fallback;
}

/** "Mon 1 Jun at 9:00am", degrading gracefully when fields are absent. */
function whenLabel(
  date: string | null | undefined,
  slot: string | null | undefined,
): string {
  const parts: string[] = [];
  if (date) parts.push(formatDateShort(date));
  if (slot) parts.push(`at ${formatTime(slot)}`);
  return parts.join(" ");
}

/**
 * Build the notification copy for a staff event. Always returns a usable
 * title/body even with an empty context (defensive — a push event must render
 * something).
 */
export function buildStaffPushMessage(
  eventType: StaffEventType,
  ctx: StaffPushContext = {},
): StaffPushMessage {
  const customer = safe(ctx.customerName, "A customer");
  const dog = safe(ctx.dogName, "their dog");
  const service = safe(ctx.service, "a groom");
  const triggerType = `staff_${eventType}`;

  switch (eventType) {
    case "message": {
      const who = safe(ctx.senderName, "a customer");
      return {
        title: "New message",
        body: `${who} messaged the salon`,
        url: "/inbox",
        category: eventType,
        triggerType,
      };
    }
    case "new_booking": {
      const when = whenLabel(ctx.bookingDate, ctx.slot);
      return {
        title: "New booking",
        body: `${customer} booked ${service} for ${dog}${when ? ` — ${when}` : ""}`,
        url: "/",
        category: eventType,
        triggerType,
      };
    }
    case "cancellation": {
      const when = whenLabel(ctx.bookingDate, ctx.slot);
      return {
        title: "Booking cancelled",
        body: `${customer}'s ${service} for ${dog}${when ? ` (${when})` : ""} was cancelled`,
        url: "/",
        category: eventType,
        triggerType,
      };
    }
    case "reschedule": {
      const when = whenLabel(ctx.bookingDate, ctx.slot);
      return {
        title: "Booking moved",
        body: `${customer} moved ${dog}'s ${service}${when ? ` to ${when}` : ""}`,
        url: "/",
        category: eventType,
        triggerType,
      };
    }
    case "new_client": {
      return {
        title: "New client to review",
        body: `${customer} signed up — tap to review`,
        url: "/",
        category: eventType,
        triggerType,
      };
    }
    case "waitlist": {
      const when = ctx.bookingDate ? formatDateShort(ctx.bookingDate) : "";
      return {
        title: "Waitlist request",
        body: `${customer} joined the waitlist${when ? ` for ${when}` : ""}`,
        url: "/",
        category: eventType,
        triggerType,
      };
    }
  }
}

// ── Recipient selection ──────────────────────────────────────

export interface StaffSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
}

export interface StaffAlertPrefsRow {
  user_id: string;
  messages: boolean;
  new_booking: boolean;
  cancellation: boolean;
  reschedule: boolean;
  new_client: boolean;
  waitlist: boolean;
}

/**
 * Decide which subscriptions receive an event.
 *   - Suppress ONLY the actor's own devices (a staff member who made the
 *     booking doesn't get pinged for it; other staff still do). For
 *     customer/AI/no actor, actorId won't match any staff user_id, so
 *     everyone is notified.
 *   - Honour each staff member's category opt-in. A missing prefs row means
 *     "all enabled" (the default for a newly-subscribed device).
 */
export function selectRecipients(
  subs: StaffSubscriptionRow[],
  prefsByUser: Map<string, StaffAlertPrefsRow>,
  eventType: StaffEventType,
  actorId?: string | null,
): StaffSubscriptionRow[] {
  const column = CATEGORY_COLUMN[eventType];
  return subs.filter((sub) => {
    if (!sub.p256dh || !sub.auth) return false; // unusable subscription
    if (actorId && sub.user_id === actorId) return false; // suppress the actor
    const prefs = prefsByUser.get(sub.user_id);
    if (!prefs) return true; // no row → all categories enabled
    return prefs[column as keyof StaffAlertPrefsRow] === true;
  });
}
