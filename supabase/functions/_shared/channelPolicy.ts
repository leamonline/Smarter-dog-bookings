// ============================================================
// supabase/functions/_shared/channelPolicy.ts
//
// The one place that decides whether a customer may be messaged on a channel.
//
// Smarter Dog's messaging policy (confirmed by the salon, November 2026):
//
//  1. SMS is a REQUIRED operational channel. A customer gives a valid mobile
//     number and agrees to essential service messages as a condition of
//     booking: confirmations, reminders, changes, cancellations, collection
//     notices. So the optional `humans.sms` tickbox ("SMS reminders") is NOT
//     consulted for operational messages. It used to be, and because it
//     defaults to false that silently suppressed reminders and fallbacks.
//  2. WhatsApp is preferred where the customer is set up for it; SMS is the
//     fallback whenever WhatsApp is unavailable or fails.
//  3. A STOP is never overridden automatically. `whatsapp_opted_out` is set
//     when a number replies STOP on WhatsApp (and may be set by staff), and an
//     opt-out belongs to the number, so we cannot know the customer only meant
//     WhatsApp. Automatic texts are therefore PAUSED (not sent) until staff
//     have clarified which channels are permitted. The pause lifts when staff
//     re-enable WhatsApp through the audited action, or record that SMS is
//     fine by setting `preferred_channel = 'sms'`. An `sms_opted_out` always
//     blocks SMS.
//  4. Marketing is a separate class with its own consent. It is never implied
//     by the operational rules above, and never by the `sms` tickbox. Nothing
//     sends promotional SMS today; `canSendMarketing` fails closed until a
//     dedicated consent flag exists and is true.
//
// Pure and dependency-free, so the edge functions, the staff UI and the tests
// all share exactly one implementation (the browser imports it too).
// ============================================================

export type PolicyChannel = "whatsapp" | "sms" | "email";
export type MessageClass = "operational" | "marketing";

export interface PolicyContact {
  phone?: string | null;
  email?: string | null;
  /** WhatsApp "set up" preference. Still consulted for WhatsApp (not for SMS). */
  whatsapp?: boolean | null;
  /** Optional "SMS reminders" tickbox. Deliberately NOT consulted by this policy. */
  sms?: boolean | null;
  whatsapp_opted_out?: boolean | null;
  sms_opted_out?: boolean | null;
  email_opted_out?: boolean | null;
  /** Staff-recorded "SMS is fine" after a STOP. The only thing besides a re-enable that lifts the pause. */
  preferred_channel?: string | null;
  /** Does not exist in the database yet. Marketing SMS stays impossible until it does and is true. */
  marketing_sms_consent?: boolean | null;
}

export type BlockReason =
  | "no_number"
  | "no_email"
  | "not_set_up"
  | "opted_out"
  | "paused_after_stop";

/**
 * They replied STOP (or were opted out of WhatsApp) and staff have not yet said
 * SMS is fine. Automatic texts are held until they have.
 */
export function smsPausedAfterStop(contact: PolicyContact): boolean {
  return Boolean(contact.whatsapp_opted_out) && contact.preferred_channel !== "sms";
}

/** Why an OPERATIONAL message may not go on this channel, or null when it may. */
export function blockReason(contact: PolicyContact, channel: PolicyChannel): BlockReason | null {
  switch (channel) {
    case "whatsapp":
      if (!contact.phone) return "no_number";
      if (!contact.whatsapp) return "not_set_up";
      if (contact.whatsapp_opted_out) return "opted_out";
      return null;
    case "sms":
      if (!contact.phone) return "no_number";
      if (contact.sms_opted_out) return "opted_out";
      if (smsPausedAfterStop(contact)) return "paused_after_stop";
      return null;
    case "email":
      if (!contact.email) return "no_email";
      if (contact.email_opted_out) return "opted_out";
      return null;
    default:
      return "no_number";
  }
}

/** Can an essential service message go on this channel right now? */
export function operationalChannelAvailable(contact: PolicyContact, channel: PolicyChannel): boolean {
  return blockReason(contact, channel) === null;
}

/**
 * Promotional SMS needs its own consent and nothing else stands in for it:
 * not a phone number, not a booking, not the `sms` tickbox. Fails closed.
 */
export function canSendMarketing(contact: PolicyContact, channel: "sms"): boolean {
  if (channel !== "sms") return false;
  return (
    contact.marketing_sms_consent === true &&
    Boolean(contact.phone) &&
    !contact.sms_opted_out &&
    !smsPausedAfterStop(contact)
  );
}

/** Does staff need to clarify which channels this customer permits? */
export function needsChannelReview(contact: PolicyContact): boolean {
  return smsPausedAfterStop(contact);
}

/** Staff-facing wording for a block, so every screen and function says the same thing. */
export function blockText(channel: PolicyChannel, reason: BlockReason): string {
  switch (channel) {
    case "whatsapp":
      if (reason === "no_number") return "No WhatsApp number on file";
      if (reason === "not_set_up") return "Customer isn't set up for WhatsApp";
      return "Customer opted out of WhatsApp";
    case "sms":
      if (reason === "no_number") return "No mobile number on file";
      if (reason === "paused_after_stop") {
        return "Customer replied STOP on WhatsApp. Texts are paused until you've checked which channels they're happy with";
      }
      return "Customer opted out of SMS";
    case "email":
      if (reason === "no_email") return "No email on file";
      return "Customer opted out of email";
    default:
      return "Cannot message this customer";
  }
}
