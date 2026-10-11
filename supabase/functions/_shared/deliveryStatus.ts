// ============================================================
// supabase/functions/_shared/deliveryStatus.ts
//
// What a Meta "failed" delivery status means for a logged notification.
//
// whatsapp-send logs a customer notification to notification_log as 'sent'
// the moment Meta ACCEPTS it. Meta's verdict on whether it actually reached
// the phone arrives later, as a status webhook, and used to update only the
// whatsapp_messages row. So a reminder Meta could not deliver (131026, most
// often a number that isn't on WhatsApp) stayed 'sent' in notification_log,
// and every staff surface that reads that log — the calendar badge, the
// booking-detail card with its fix-number-and-resend controls, the dashboard
// list — never showed it. 32 confirmations and reminders for real bookings
// failed that way between June and October 2026, all invisible to staff.
//
// Pure: no Deno or Supabase imports, so Vitest can exercise it directly.
// ============================================================

export interface MetaStatusError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

/** Meta's code for a message it accepted but could not get to the handset. */
export const META_UNDELIVERABLE = 131026;

/**
 * One readable line for staff, stored in notification_log.error_message and
 * shown on the booking's delivery-failure card. Keeps Meta's code so the
 * cause can still be looked up, but leads with what it means for the salon.
 */
export function metaFailureSummary(errors: readonly MetaStatusError[] | null | undefined): string {
  const first = errors?.[0];
  if (!first) return "WhatsApp could not deliver this message.";
  if (first.code === META_UNDELIVERABLE) {
    return `WhatsApp could not deliver this — the number may not be on WhatsApp (Meta ${META_UNDELIVERABLE}).`;
  }
  const what = (first.title || first.message || "delivery failed").trim();
  return first.code != null
    ? `WhatsApp could not deliver this: ${what} (Meta ${first.code}).`
    : `WhatsApp could not deliver this: ${what}.`;
}

/**
 * The notification_log change a Meta status implies, or null when there is
 * nothing to record. Only 'failed' changes the log: 'delivered' and 'read'
 * already agree with its 'sent', and the SMS fallback job reads delivery
 * receipts straight from whatsapp_messages.
 */
export function notificationLogPatchForStatus(
  status: string | null | undefined,
  errors: readonly MetaStatusError[] | null | undefined,
): { status: "failed"; error_message: string } | null {
  if (status !== "failed") return null;
  return { status: "failed", error_message: metaFailureSummary(errors) };
}
