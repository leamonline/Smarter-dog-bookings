// WhatsApp opt-out: one decision for every send, and one detector for the
// customer asking us to stop.
//
// Until October 2026 `humans.whatsapp_opted_out` was honoured only by the
// callers that chose a channel through recipients.ts (the notify-* family).
// Staff template and compose sends, the agent's manual/book_entry/flow/list
// modes and apply-customer-confirm's acknowledgements all reached whatsapp-send
// without looking at it, so a customer who had opted out could still be
// messaged (audit finding H4, #990). whatsapp-send now asks this module before
// it calls Meta, whatever the mode.
//
// Pure functions only, so the policy is unit-tested without a database.

export interface OptOutRecipient {
  whatsapp_opted_out: boolean | null;
}

export type OptOutDecision =
  | { allowed: true; reason: "not_opted_out" | "unknown_recipient" | "staff_override" }
  | { allowed: false; reason: "whatsapp_opted_out" };

export interface OptOutDecisionInput {
  /** The humans row the message is going to, or null when no record matched. */
  recipient: OptOutRecipient | null;
  /** The caller set `override_opt_out: true` on the request body. */
  overrideOptOut: boolean;
  /** The request carried a staff JWT (not the internal secret). */
  callerIsStaff: boolean;
  /** The caller marked the send as AI-initiated. */
  aiInitiated: boolean;
}

/**
 * Whether a WhatsApp send may proceed given the recipient's opt-out flag.
 *
 * - No matching customer record: allowed. An unknown number cannot have opted
 *   out, and first-contact templates to a new number are legitimate.
 * - Opted out: refused, unless a member of staff explicitly overrides on a
 *   message they are sending themselves. The override exists for the rare
 *   operational message a customer must receive (a cancellation they asked
 *   for, say); it is never available to an AI-initiated send and never
 *   implied by the internal secret alone.
 */
export function decideOptOutSend(input: OptOutDecisionInput): OptOutDecision {
  if (!input.recipient) return { allowed: true, reason: "unknown_recipient" };
  if (!input.recipient.whatsapp_opted_out) return { allowed: true, reason: "not_opted_out" };
  if (input.overrideOptOut && input.callerIsStaff && !input.aiInitiated) {
    return { allowed: true, reason: "staff_override" };
  }
  return { allowed: false, reason: "whatsapp_opted_out" };
}

/**
 * The `humans.phone` values a WhatsApp E.164 number may have been stored as.
 * Mirrors the agent's lookup: "+447700900123", "447700900123", "07700900123".
 */
export function phoneLookupCandidates(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return [];
  const e164 = `+${digits}`;
  const ukLocal = digits.startsWith("44") ? `0${digits.slice(2)}` : null;
  return [e164, digits, ukLocal].filter((value): value is string => !!value);
}

/**
 * The UK national significant number ("7700900123") for any way a UK number
 * may have been typed or stored: "+447700900123", "447700900123",
 * "07700 900123", "+44 (0)7700 900 123", "0044 7700-900123". Null for an
 * empty or non-UK number.
 */
export function ukNationalDigits(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  let national: string | null = null;
  if (digits.startsWith("0044")) national = digits.slice(4);
  else if (digits.startsWith("44")) national = digits.slice(2);
  else if (digits.startsWith("0")) national = digits.slice(1);
  if (!national) return null;
  // "+44 (0)7700…" carries the trunk 0 after the country code.
  if (national.startsWith("0")) national = national.slice(1);
  return /^\d{9,10}$/.test(national) ? national : null;
}

/**
 * A PostgreSQL regular expression (for PostgREST `match`) that finds a UK
 * number however it was stored: any spaces, dashes, dots or brackets
 * between the digits, with a +44, 44, 0044 or 0 prefix, and the "(0)" form.
 * `humans.phone` has no canonical form, so an exact-string lookup misses
 * "07700 900123" (#1016 review). Callers re-check each row with
 * `ukNationalDigits`, so the pattern only has to be permissive, never exact.
 * Null for a non-UK number: use `phoneLookupCandidates` instead.
 */
export function ukPhoneMatchPattern(phone: string | null | undefined): string | null {
  const national = ukNationalDigits(phone);
  if (!national) return null;
  const sep = "[^0-9]*";
  return `^${sep}(?:(?:00)?44${sep}(?:0${sep})?|0${sep})${national.split("").join(sep)}${sep}$`;
}

// A request to stop, in the words customers actually use. Deliberately narrow:
// a false positive flags a customer as opted out and silences their thread,
// so salon phrases that share the words must not match: "stop by", "can we
// opt out of the nail clip?", "take me off the waiting list", "remove my old
// number", "don't message me before 9". Standalone STOP / UNSUBSCRIBE /
// OPT OUT (the carrier conventions) match on their own; longer sentences need
// the request aimed at our messages or our list.
export const OPT_OUT_PATTERNS: readonly RegExp[] = [
  // "STOP", "please stop", "Unsubscribe.", "opt out!"
  /^\s*(?:please\s+)?(?:stop|unsubscribe|opt[\s-]?out)\s*[.!]*\s*$/i,
  // "stop messaging me", "please stop sending me these"
  /\b(?:stop|quit|cease)\s+(?:texting|messaging|contacting|whatsapping|sending)\s+(?:me|us)\b/i,
  // "please stop sending these messages", "stop sending the texts"
  /\b(?:stop|quit|cease)\s+(?:sending|texting)\s+(?:(?:me|us)\s+)?(?:these|the|your|any|all)\s+(?:messages|texts|whatsapps?|reminders)\b/i,
  // "don't text me again", "never message me any more", "do not contact me."
  // (bare "don't message me" only at the end, so "don't message me before 9"
  // and "don't text me until he's ready" are scheduling, not opt-out)
  /\b(?:don'?t|do\s+not|never)\s+(?:text|message|contact|whatsapp)\s+(?:me|us)(?:\s+(?:again|any\s*more)\b|\s*(?:please\s*)?[.!]*\s*$)/i,
  // "no more messages", "no further texts"
  /\bno\s+(?:more|further)\s+(?:messages|texts|whatsapps?)\b/i,
  // "take me off your list", "remove my number from this chat"; never a
  // waiting list, which is a booking request
  /\b(?:take|remove)\s+(?:me|us|my\s+number)\s+(?:off|from)\s+(?:your|the|this)\s+(?:(?:mailing|contact|contacts|messaging|message|text|texting|whatsapp|marketing)\s+)?(?:list|chat)\b/i,
  // "unsubscribe me", "how do I unsubscribe"
  /\bunsubscribe\b/i,
  // "opt me out", "opt out of these messages"; never "opt out of the nail clip"
  /\bopt\s+(?:me|us)\s+out\b/i,
  /\bopt(?:ed|ing)?[\s-]?out\s+of\s+(?:(?:your|the|these|this|all)\s+)?(?:messages|texts|whatsapps?|marketing|updates|reminders|chats?)\b/i,
];

// "Please don't stop messaging me", "I don't want you to stop sending
// reminders": a negation within a few words before the stop-verb reverses the
// request. Checked before the positive patterns (#1016 review), because a
// false positive silences a customer who asked for the opposite.
const NEGATED_STOP = /\b(?:don'?t|do\s+not|never|not|won'?t)\b(?:\s+\w+){0,4}\s+(?:stop|quit|cease)\b/i;

/** True when the message is the customer asking us not to message them. */
export function isOptOutRequest(messageText: string | null | undefined): boolean {
  if (!messageText) return false;
  // Phone keyboards type a curly apostrophe (don’t); the patterns use the
  // straight one, so fold every apostrophe-like character first.
  const text = messageText.replace(/[\u2018\u2019\u02BC\u2032`´]/g, "'").trim();
  if (!text) return false;
  if (NEGATED_STOP.test(text)) return false;
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(text));
}
