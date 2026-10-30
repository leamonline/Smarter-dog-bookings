// ============================================================
// supabase/functions/_shared/twilioDelivery.ts
//
// What a Twilio response means for a logged WhatsApp notification.
//
// Twilio answers a Messages POST with 2xx the moment it QUEUES the message.
// For WhatsApp that is not delivery: the real failures (outside the 24-hour
// window, number not on WhatsApp, sandbox recipient not joined) arrive later
// as status callbacks, and this project has none wired for the Twilio channel.
// notify-booking-cancelled and notify-booking-ready used to write
// notification_log.status = 'sent' on that 2xx (audit C3, #989). Cancellation
// notices no longer use Twilio WhatsApp: they go out as SMS, or email when a
// text cannot be sent, and are logged sent or failed on that channel.
//
// This helper remains for historical WhatsApp rows. isDeliveryUnconfirmed
// still tells the delivery card that one of those notes is "not confirmed"
// rather than a reported failure. A Twilio rejection is recorded as 'failed'
// with Twilio's own reason. An accept, for any caller that still uses this
// helper, stays 'pending' so it is not claimed as delivered.
//
// Pure: no Deno or Supabase imports, so it is unit-tested without a network.
// ============================================================

export interface TwilioSendOutcome {
  ok: boolean;
  status: number;
  sid?: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Every note that means "we do not know whether it arrived" starts with this,
 * so staff surfaces can say "not confirmed as delivered" instead of "failed"
 * (`isDeliveryUnconfirmed`). The row's status is still 'failed' once reaped:
 * that is what lets reminder-sms-fallback chase it, not a claim that it failed.
 */
export const DELIVERY_UNCONFIRMED_PREFIX = "Delivery unconfirmed:";

/**
 * Stored on the row while Twilio's accept is all we know. Survives the reaper
 * (which only writes its own text over a null error_message), so the booking's
 * delivery card tells staff what actually happened rather than "send
 * interrupted". It promises no SMS: a customer who has opted out of texts, or
 * has no mobile, gets none.
 */
export const TWILIO_WHATSAPP_UNCONFIRMED =
  `${DELIVERY_UNCONFIRMED_PREFIX} Twilio accepted this WhatsApp but cannot report whether it arrived. If the customer accepts texts, the same message follows by SMS about an hour later.`;

/** True for a log row whose note says delivery is unknown rather than failed. */
export function isDeliveryUnconfirmed(errorMessage: string | null | undefined): boolean {
  return typeof errorMessage === "string" && errorMessage.startsWith(DELIVERY_UNCONFIRMED_PREFIX);
}

export type TwilioWhatsAppLogPatch = {
  status: "pending" | "failed";
  provider_message_id: string | null;
  sent_at: null;
  error_message: string;
};

/**
 * The notification_log change a Twilio WhatsApp response implies. Never
 * 'sent': an accept keeps the row 'pending' for the reaper, a rejection is
 * 'failed' with Twilio's code and message so staff can look it up.
 */
export function notificationLogPatchForTwilioWhatsApp(
  result: TwilioSendOutcome,
): TwilioWhatsAppLogPatch {
  if (result.ok) {
    return {
      status: "pending",
      provider_message_id: result.sid ?? null,
      sent_at: null,
      error_message: TWILIO_WHATSAPP_UNCONFIRMED,
    };
  }
  const what = (result.errorMessage ?? "").trim();
  const code = result.errorCode ? ` (Twilio ${result.errorCode})` : "";
  return {
    status: "failed",
    provider_message_id: null,
    sent_at: null,
    error_message: what
      ? `Twilio rejected this WhatsApp: ${what}${code}.`
      : `Twilio rejected this WhatsApp (HTTP ${result.status})${code}.`,
  };
}
