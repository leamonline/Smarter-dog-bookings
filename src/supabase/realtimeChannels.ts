// ============================================================
// src/supabase/realtimeChannels.ts
//
// Central registry of Supabase realtime channel (topic) names + a helper to
// make a per-subscription-unique name. Previously every hook hand-wrote its
// channel name as a string literal, with inconsistent uniqueness — some
// static, some appending `Date.now()`/`Math.random()` ad hoc (see the
// technical-debt register, item #16). Two failure modes that caused:
//   1. typos / drift between subscribe + (no) cleanup, and
//   2. a double-mount in dev (HMR / StrictMode) colliding on a shared topic.
//
// Two intentional patterns are preserved, just centralised here:
//   • Singleton, ref-counted hooks (useTodos, useWhatsAppUnread,
//     useWhatsAppSummary, the dashboard cards) share ONE channel on a stable
//     name — use the CHANNELS.* base directly.
//   • Per-instance hooks (useBookings, useDogs, useHumansData, the month/day
//     views) want a fresh topic per mount — wrap the base in
//     uniqueChannelName() so the suffix is generated one consistent way.
// ============================================================

/** Canonical base names. Values are the exact topic strings used today. */
export const CHANNELS = {
  salonTodos: "salon-todos",
  waitlistChanges: "waitlist_changes",
  waitlistUpcoming: "waitlist_upcoming_changes",
  dashboardBookingEvents: "dashboard-booking-events",
  humanCardBookingEvents: "human-card-booking-events",
  whatsappDashboardCounts: "whatsapp-dashboard-counts",
  whatsappDashboardSummary: "whatsapp-dashboard-summary",
  dashboardAgentFailures: "dashboard-agent-failures",
  whatsappToolbarUnread: "whatsapp-toolbar-unread",
  dashboardDeliveryFailures: "dashboard-delivery-failures",
  whatsappInboxList: "whatsapp-inbox-list",
  whatsappInboxDetail: "whatsapp-inbox-detail",
  signupApprovalQueue: "signup-approval-queue",
  pendingSignupsCount: "pending-signups-count",
  dashboardTomorrowReminders: "dashboard-tomorrow-reminders",
  monthDaySettings: "month-day-settings",
  monthBookings: "month-bookings",
  daySettings: "day-settings-rt",
  inboxDiaryDaySettings: "inbox-diary-day-settings",
  inboxDiaryBookings: "inbox-diary-bookings",
  dogsRealtime: "dogs-realtime",
  bookingsRealtime: "bookings-realtime",
  humansRealtime: "humans-realtime",
} as const;

export type ChannelBase = (typeof CHANNELS)[keyof typeof CHANNELS];

// Monotonic counter so two channels created in the same millisecond still
// differ even if crypto.randomUUID is unavailable.
let seq = 0;

/**
 * Build a per-subscription-unique channel name from a base. Appends a short
 * random suffix so a fresh mount never collides with a still-tearing-down
 * previous mount on the same topic. Use ONLY for per-instance subscriptions;
 * singleton ref-counted hooks pass the base directly.
 */
export function uniqueChannelName(base: string): string {
  seq += 1;
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${base}-${seq}-${rand}`;
}
