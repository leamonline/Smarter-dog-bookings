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
//     The exception is a customer whose "Reminder preferences" on their profile
//     name SMS and not WhatsApp (`humans.reminder_channels`). That is an explicit
//     choice, so they are texted first and WhatsApp becomes their fallback. It
//     only changes the ORDER: it never opens a channel a STOP has closed.
//  3. A STOP is honoured for the channel it was sent on, and never overridden
//     automatically. A STOP on WhatsApp (`whatsapp_opted_out`) switches WhatsApp
//     off; essential messages then go by SMS instead. An SMS opt-out
//     (`sms_opted_out`, recorded when Twilio reports the number texted STOP)
//     always blocks SMS. Either STOP raises a staff to-do so someone can check
//     which channels the customer is happy with (staffFollowUp.ts).
//  4. Marketing is a separate class with its own consent. It is never implied
//     by the operational rules above, and never by the `sms` tickbox. Nothing
//     sends promotional SMS today and all promotional SMS stays disabled;
//     `canSendMarketing` fails closed until a dedicated consent flag exists and
//     is true.
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
  /**
   * `humans.reminder_channels`: the "Reminder preferences" pills on the customer
   * profile, e.g. ["sms"]. Read only by `prefersSms`. Defaults to ["whatsapp"].
   */
  reminder_channels?: unknown;
  /** Does not exist in the database yet. Marketing SMS stays impossible until it does and is true. */
  marketing_sms_consent?: boolean | null;
}

export type BlockReason = "no_number" | "not_textable" | "no_email" | "not_set_up" | "opted_out";

/**
 * Can a text reach this number? sms-send refuses anything that does not normalise
 * to an international (+) number, and a UK landline can't receive texts at all
 * (Twilio 21614). Records hold landlines as contact numbers on purpose, so "has a
 * phone" is not enough: without this check a landline-only customer with an email
 * on file would be sent to SMS and silently lose the confirmations and reminders
 * they get by email today. Mirrors _shared/twilio.ts normaliseUkPhone (which can't
 * be imported here: it reads Twilio secrets at load and this runs in the browser).
 * UK numbers must be mobiles (07...); other countries can't be told apart, so any
 * well-formed international number counts.
 */
export function isSmsCapableNumber(phone: string | null | undefined): boolean {
  const stripped = (phone ?? "").replace(/[\s\-().]|\p{Cf}/gu, "");
  if (!stripped) return false;
  let e164 = stripped;
  if (stripped.startsWith("00")) e164 = "+" + stripped.slice(2);
  else if (/^07\d{9}$/.test(stripped)) e164 = "+44" + stripped.slice(1);
  else if (/^447\d{9}$/.test(stripped)) e164 = "+" + stripped;
  if (!e164.startsWith("+")) return false; // national landline etc.: sms-send refuses it
  e164 = e164.replace(/^\+440/, "+44");
  if (e164.startsWith("+44")) return /^\+447\d{9}$/.test(e164); // UK: mobiles only
  return /^\+\d{8,15}$/.test(e164);
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
      // A number a text can reach, and the absence of an SMS opt-out. A WhatsApp
      // STOP is about WhatsApp; the optional tickbox is not consulted.
      if (!contact.phone) return "no_number";
      if (!isSmsCapableNumber(contact.phone)) return "not_textable";
      if (contact.sms_opted_out) return "opted_out";
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
 * Has this customer asked for texts rather than WhatsApp? True only when their
 * reminder preferences name SMS and leave WhatsApp out, which someone has to
 * choose on purpose (the default is WhatsApp). A missing or malformed value is
 * not a preference. This is not the optional `sms` tickbox, which stays
 * unconsulted: that one used to GATE texts, this one only ranks them.
 */
export function prefersSms(contact: PolicyContact): boolean {
  const chosen = contact.reminder_channels;
  if (!Array.isArray(chosen)) return false;
  return chosen.includes("sms") && !chosen.includes("whatsapp");
}

/**
 * Should an essential message try SMS before WhatsApp for this customer? Only
 * when they prefer it AND a text can actually go: a preference never beats an SMS
 * opt-out or an untextable number, so those customers stay on WhatsApp first.
 */
export function smsBeforeWhatsApp(contact: PolicyContact): boolean {
  return prefersSms(contact) && operationalChannelAvailable(contact, "sms");
}

/**
 * Promotional SMS needs its own consent and nothing else stands in for it:
 * not a phone number, not a booking, not the `sms` tickbox. Fails closed. A STOP
 * on either channel also rules it out.
 */
export function canSendMarketing(contact: PolicyContact, channel: "sms"): boolean {
  if (channel !== "sms") return false;
  return (
    contact.marketing_sms_consent === true &&
    isSmsCapableNumber(contact.phone) &&
    !contact.sms_opted_out &&
    !contact.whatsapp_opted_out
  );
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
      if (reason === "not_textable") return "That number can't receive texts (it may be a landline)";
      return "Customer opted out of SMS";
    case "email":
      if (reason === "no_email") return "No email on file";
      return "Customer opted out of email";
    default:
      return "Cannot message this customer";
  }
}
