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

// A request to stop, in the words customers actually use. Deliberately narrow:
// a false positive silences someone who wanted a groom, so "stop by", "pop in"
// and "message me when he's ready" must not match. Standalone STOP /
// UNSUBSCRIBE / OPT OUT (the carrier conventions) match on their own; longer
// sentences need a stop-verb aimed at us ("stop messaging me", "don't text me
// again", "take me off your list").
export const OPT_OUT_PATTERNS: readonly RegExp[] = [
  /^\s*(?:please\s+)?(?:stop|unsubscribe|opt[\s-]?out)\s*[.!]*\s*$/i,
  /\b(?:stop|quit|cease)\s+(?:texting|messaging|contacting|whatsapping|sending)\s+(?:me|us)\b/i,
  /\b(?:don'?t|do\s+not|never|stop)\s+(?:text|message|contact|whatsapp)\s+(?:me|us)(?:\s+(?:again|any\s*more))?\b/i,
  /\bno\s+(?:more|further)\s+(?:messages|texts|whatsapps?)\b/i,
  /\b(?:take|remove)\s+(?:me|us|my\s+number)\s+(?:off|from)\b/i,
  /\bunsubscribe\b/i,
  /\bopt(?:ed|ing)?[\s-]?out\b/i,
];

/** True when the message is the customer asking us not to message them. */
export function isOptOutRequest(messageText: string | null | undefined): boolean {
  if (!messageText) return false;
  const text = messageText.trim();
  if (!text) return false;
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(text));
}
