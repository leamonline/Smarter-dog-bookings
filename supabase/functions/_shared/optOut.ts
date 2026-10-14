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
  /**
   * The opt-out came from the number saying STOP (the number's own
   * suppression, or a record whose reason is `asked_on_whatsapp`). Only the
   * STOP acknowledgement may then be sent; `override_opt_out` cannot.
   */
  stopped?: boolean | null;
}

export type OptOutDecision =
  | { allowed: true; reason: "not_opted_out" | "unknown_recipient" | "staff_override" | "stop_acknowledgement" }
  | { allowed: false; reason: "whatsapp_opted_out" };

export interface OptOutDecisionInput {
  /** The humans row the message is going to, or null when no record matched. */
  recipient: OptOutRecipient | null;
  /** The caller set `override_opt_out: true` on the request body. */
  overrideOptOut: boolean;
  /**
   * Staff are sending the agent's stored STOP acknowledgement draft, as the
   * agent wrote it. The one message a number that said STOP may still get.
   */
  approvesAcknowledgement?: boolean;
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
 * - Opted out because the number said STOP: refused even with the override.
 *   The only exception is staff sending the agent's acknowledgement draft.
 */
export function decideOptOutSend(input: OptOutDecisionInput): OptOutDecision {
  if (!input.recipient) return { allowed: true, reason: "unknown_recipient" };
  if (!input.recipient.whatsapp_opted_out) return { allowed: true, reason: "not_opted_out" };
  if (input.callerIsStaff && !input.aiInitiated) {
    if (input.approvesAcknowledgement) return { allowed: true, reason: "stop_acknowledgement" };
    // A number that said STOP gets nothing else, override or not: only the
    // audited re-enable (staff_reenable_whatsapp_number) lifts it (#1016).
    if (input.overrideOptOut && !input.recipient.stopped) return { allowed: true, reason: "staff_override" };
  }
  return { allowed: false, reason: "whatsapp_opted_out" };
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
 * between the digits, with a +44, 44, 0044 or 0 prefix or none, and the
 * "(0)" form.
 * `humans.phone` has no canonical form, so an exact-string lookup misses
 * "07700 900123" (#1016 review). Callers re-check each row with
 * `ukNationalDigits`, so the pattern only has to be permissive, never exact.
 * Null for a non-UK number: `phoneMatchPattern` covers those.
 */
export function ukPhoneMatchPattern(phone: string | null | undefined): string | null {
  const national = ukNationalDigits(phone);
  if (!national) return null;
  const sep = "[^0-9]*";
  // The prefix is optional and "00 44" may be spaced: whatsapp_phone_key (and
  // phoneMatchKey) give "7700900123" and "00 44 7700 900123" the same key as
  // "+447700900123", so the pattern must not filter them out first (#1016
  // final review).
  return `^${sep}(?:(?:0${sep}0${sep})?4${sep}4${sep}(?:0${sep})?|0${sep})?${national.split("").join(sep)}${sep}$`;
}

/**
 * The digits that identify a number for opt-out matching: the UK national
 * number for a UK number however typed, otherwise the international digits
 * without a "00" prefix ("+33 6 12 34 56 78" and "0033612345678" both give
 * "33612345678"). Null when there are too few digits to be a phone number.
 */
export function phoneMatchKey(phone: string | null | undefined): string | null {
  const uk = ukNationalDigits(phone);
  if (uk) return uk;
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 7 ? digits : null;
}

/**
 * The formatting-tolerant PostgREST `match` pattern for any number: the UK
 * pattern above, or for an international number its digits with anything
 * that is not a digit allowed between them and an optional "00" prefix, so a
 * canonical "+33612345678" finds "+33 6 12 34 56 78" (#1016 review). Callers
 * confirm each row with `phoneMatchKey`. Null when there is nothing to match.
 */
export function phoneMatchPattern(phone: string | null | undefined): string | null {
  const uk = ukPhoneMatchPattern(phone);
  if (uk) return uk;
  const key = phoneMatchKey(phone);
  if (!key) return null;
  const sep = "[^0-9]*";
  return `^${sep}(?:0${sep}0${sep})?${key.split("").join(sep)}${sep}$`;
}

// A request to stop, in the words customers actually use. Deliberately narrow:
// a false positive opts the number out and silences the thread, so salon
// phrases that share the words must not match: "stop by", "can we opt out of
// the nail clip?", "take me off the waiting list", "remove my old number",
// "don't message me before 9". Standalone STOP / UNSUBSCRIBE / OPT OUT (the
// carrier conventions) match on their own; longer sentences need the request
// aimed at our messages or our list.
//
// Each pattern is tested against one clause at a time (the message split at
// . ! ? , ; line breaks and dashes), and most are anchored to the END of the
// clause: "stop texting me" is a request, "stop texting me at 6am" or "stop
// sending me reminders for Max, he passed away" is something staff should
// read, not an automatic opt-out (#1016 final review). A clause may end with
// politeness ("please", "thanks", "any more"), never with more content.
const TAIL = String.raw`(?:\s+(?:again|any\s*more|now|please|pls|plz|thanks|thank\s+you|thx|ta|asap|immediately))*\s*$`;
const MESSAGES = String.raw`(?:messages|texts|whatsapps?|reminders)`;
const OUR = String.raw`(?:(?:all|any|the|these|those|your)\s+)?`;
// "... any more messages from you": the only thing that may follow the
// messages, so "any more reminders for Max" stays for staff to read.
const FROM_US = String.raw`(?:\s+from\s+(?:you|the\s+salon|smarter\s+dog))?`;

// A clause that is nothing but the request: "STOP", "Stop please", "STOP ALL",
// "Stop promotions" (Meta's marketing opt-out button), "unsubscribe", "opt
// out", "leave me alone". Only as the first or last clause of a message: "No
// thanks, stop" and "Stop. Wrong person." are requests.
const BARE_STOP = new RegExp(
  String.raw`^(?:(?:please|pls|plz)\s+)?(?:stop(?:\s+(?:all|it|promotions?))?|unsubscribe|opt[\s-]?out|leave\s+(?:me|us)\s+alone)` + TAIL,
  "i",
);

export const OPT_OUT_PATTERNS: readonly RegExp[] = [
  // "stop messaging me", "please stop sending me these texts", "why won't you
  // stop texting me"
  new RegExp(String.raw`\b(?:stop|quit|cease)\s+(?:texting|messaging|contacting|whatsapping|sending)\s+(?:me|us|this\s+number)(?:\s+${OUR}${MESSAGES})?` + TAIL, "i"),
  // "I want to stop receiving these messages", "how do I stop getting texts"
  new RegExp(String.raw`\b(?:stop|quit)\s+(?:receiving|getting)\s+${OUR}${MESSAGES}` + TAIL, "i"),
  // "I want to opt out", "I'd like to opt out", "can I opt out"; never "can
  // we opt out of the nail clip", which goes on past the request
  new RegExp(String.raw`\b(?:(?:want|like|wish)\s+to|(?:can|could|may)\s+(?:i|we)|how\s+(?:do|can)\s+(?:i|we))\s+opt[\s-]?out` + TAIL, "i"),
  // "please stop sending messages", "stop sending reminders", "stop texting
  // the reminders"; not "stop sending the reminder to my old email"
  new RegExp(String.raw`\b(?:stop|quit|cease)\s+(?:sending|texting)\s+${OUR}${MESSAGES}` + TAIL, "i"),
  // "Please stop all messages", "Stop messaging", "how do I stop these
  // messages", "stop all messages to this number"; not "stop the messages
  // going to my old phone"
  new RegExp(String.raw`\b(?:stop|quit|cease)\s+${OUR}(?:messages|messaging|texts|texting|whatsapps?|whatsapping|reminders)(?:\s+to\s+(?:me|us|this\s+number))?` + TAIL, "i"),
  // "don't text me again", "don't ever message me again", "do not contact
  // me."; bare "don't message me" only at the end of its clause, so "don't
  // message me before 9" is scheduling, not opt-out
  new RegExp(String.raw`\b(?:don'?t|do\s+not|never)(?:\s+ever)?\s+(?:text|message|contact|whatsapp)\s+(?:me|us)(?:\s+(?:again|any\s*more)\b|${TAIL})`, "i"),
  // "can you not message me any more", "could you not text me again"
  new RegExp(String.raw`\b(?:can|could|would|will)\s+(?:you|u)\s+not\s+(?:text|message|contact|whatsapp)\s+(?:me|us)\s+(?:again|any\s*more)` + TAIL, "i"),
  // "please don't send me any more messages", "please do not send any more
  // messages", "do not send me texts again", "never send us these
  // reminders."; not "don't send me the reminder until Tuesday", which is
  // scheduling
  new RegExp(String.raw`\b(?:don'?t|do\s+not|never)\s+send\s+(?:(?:me|us)\s+)?(?:(?:any\s*more|no\s+more|more|further)\s+${MESSAGES}${FROM_US}${TAIL}|(?:(?:these|those|your|any|the)\s+)?${MESSAGES}(?:\s+(?:again|any\s*more)\b|${TAIL}))`, "i"),
  // "I don't want any more messages", "I no longer want to receive texts",
  // "I don't want your messages."; not "I don't want the reminder moved"
  // or "I don't want messages before 9"
  new RegExp(String.raw`\b(?:don'?t|do\s+not|no\s+longer)\s+(?:want|wish)\s+(?:to\s+(?:receive|get)\s+)?(?:(?:any\s*more|any\s+further|no\s+more|more|further)\s+${MESSAGES}${FROM_US}${TAIL}|(?:(?:any|these|your|the)\s+)?${MESSAGES}(?:\s+(?:again|any\s*more|from\s+(?:you|the\s+salon|smarter\s+dog))\b|${TAIL}))`, "i"),
  // "I don't want you to send me any more messages", "I don't want you to
  // message me anymore"; not "I don't want you to message me before 9" or
  // "I don't want you to text me about Bella" (#1016 review)
  new RegExp(String.raw`\b(?:don'?t|do\s+not|no\s+longer)\s+(?:want|wish)\s+(?:you|u|the\s+salon|anyone)\s+to\s+(?:(?:text|message|contact|whatsapp)\s+(?:me|us)|send\s+(?:me|us)\s+(?:(?:any\s*more|any\s+further|no\s+more|more|further)\s+)?${OUR}${MESSAGES})(?:\s+(?:again|any\s*more)\b|${TAIL})`, "i"),
  // "No more messages please", "no further texts": as the whole clause, never
  // in a report such as "I got the reminder but no more messages came through"
  new RegExp(String.raw`^(?:please\s+)?no\s+(?:more|further)\s+${MESSAGES}` + TAIL, "i"),
  // "take me off your list", "remove my number from this chat"; never a
  // waiting list, which is a booking request
  /\b(?:take|remove)\s+(?:me|us|my\s+number)\s+(?:off|from)\s+(?:your|the|this)\s+(?:(?:mailing|contact|contacts|messaging|message|text|texting|whatsapp|marketing)\s+)?(?:list|chat)\b/i,
  // "please unsubscribe me", "how do I unsubscribe", "unsubscribe me from
  // these messages"; never "unsubscribe me from the waiting list"
  new RegExp(String.raw`\bunsubscribe(?:\s+(?:me|us))?` + TAIL, "i"),
  /\bunsubscribe\s+(?:(?:me|us)\s+)?from\s+(?:(?:your|the|these|this|all)\s+)?(?:(?:mailing|contact|contacts|messaging|message|text|texting|whatsapp|marketing)\s+)?(?:messages|texts|whatsapps?|reminders|marketing|updates|list|chats?)\b/i,
  // "opt me out please", "opt me out of these messages", "opted out of your
  // list"; never "opt me out of the nail clip this time"
  new RegExp(String.raw`\bopt\s+(?:me|us)\s+out` + TAIL, "i"),
  /\bopt(?:ed|ing)?(?:\s+(?:me|us))?[\s-]?out\s+of\s+(?:(?:your|the|these|this|all)\s+)?(?:(?:mailing|contact|contacts|messaging|message|text|texting|whatsapp|marketing)\s+)?(?:messages|texts|whatsapps?|marketing|updates|reminders|chats?|list)\b/i,
];

// "Please don't stop messaging me", "I don't want you to stop sending
// reminders", "please do not unsubscribe me", "don't opt me out": a negation
// before the removal verb reverses the request. Only filler words may sit
// between the negation and the verb, and it is checked per clause: "I don't
// know how, please stop messaging me" is still a stop. "Why won't you stop
// messaging me?" is not a negation: it is the request, made angrily.
const NEGATED_STOP = /\b(?:don'?t|do\s+not|never|not)(?:\s+(?:you|to|ever|please|want|wish|need|i|we|really|ask|asking|for|them|go|ahead|and))*\s+(?:stop|quit|cease|unsubscribe|opt|remove|take)\b/i;

// "Why did you stop messaging me?", "Have you stopped sending reminders?":
// asking about a stop is not asking for one.
const PAST_STOP = /\b(?:stopped|unsubscribed)\b|\b(?:did|didn'?t|have|haven'?t|has|hasn'?t|had)\s+(?:(?:you|u|they|we|it)\s+)?(?:stop|unsubscribe)\b/i;

// What may follow a leading bare STOP: thanks, a goodbye, or why.
const SIGN_OFF = /^(?:(?:thanks?|thank\s+you|thx|ta|cheers|please|pls|bye|goodbye|no\s+thanks|not\s+interested)(?:\s+(?:you|very\s+much))?|wrong\s+(?:person|number))$/i;

// A clause that only limits the one before it: when, until or for how long.
const QUALIFIER = /^(?:until|till|til|before|after|while|whilst|when|unless|except|during|between|on|at|from|this|today|tonight|tomorrow|for\s+now|for\s+(?:a|the|this|that)\b|in\s+the|just|only)\b/i;

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

/** True when the message is the customer asking us not to message them. */
export function isOptOutRequest(messageText: string | null | undefined): boolean {
  if (!messageText) return false;
  // Phone keyboards type a curly apostrophe (don’t); the patterns use the
  // straight one, so fold every apostrophe-like character first.
  const text = messageText.replace(/[‘’ʼ′`´]/g, "'").replace(EMOJI, " ");
  const clauses = text
    .split(/[.!?;,\n…]+|\s[-–—]+\s/)
    .map((clause) => clause.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return clauses.some((clause, index) => {
    if (NEGATED_STOP.test(clause) || PAST_STOP.test(clause)) return false;
    // "Please don't message me, until Bella is ready": the next clause
    // qualifies this one, so it is scheduling, not a stop (#1016 review).
    if (QUALIFIER.test(clauses[index + 1] ?? "")) return false;
    // A bare STOP counts as the last clause ("No thanks, stop"), or as the
    // first when nothing but a sign-off follows it ("Stop. Wrong person.");
    // "Stop, I meant Tuesday" is a correction, not a stop (#1016 review).
    if (BARE_STOP.test(clause)) {
      if (index === clauses.length - 1) return true;
      if (index === 0 && clauses.slice(1).every((rest) => SIGN_OFF.test(rest))) return true;
    }
    return OPT_OUT_PATTERNS.some((pattern) => pattern.test(clause));
  });
}
