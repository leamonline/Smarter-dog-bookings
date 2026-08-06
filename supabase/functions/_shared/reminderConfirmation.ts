// ============================================================
// "Did the customer confirm their appointment?" — pure text matching.
//
// `bookings.reminder_confirmed_at` used to be stamped by exactly ONE thing: the
// customer tapping the "Confirm" Quick Reply button on the WhatsApp reminder
// template. Owners who instead typed a reply — "yes", "see you then", 👍 — were
// never recorded as confirmed, so the Daily Brief kept telling staff to chase
// someone who had already answered.
//
// This module is the single source of truth for reading those replies. It is
// used from BOTH sides of the codebase, so it must stay dependency-free and
// runtime-agnostic (no Deno globals, no imports):
//   • supabase/functions/whatsapp-agent — stamps reminder_confirmed_at on
//     inbound messages, so a typed confirmation is RECORDED like a button tap.
//   • src/engine/replyConfirmation.ts — re-exports it for the Daily Brief,
//     which also reads replies that predate the agent wiring.
//
// Safety posture: a false positive stops staff chasing an owner who never
// really confirmed, so matching is deliberately tight:
//   1. Callers only consider INBOUND messages sent AFTER the reminder went out
//      — the reply has to be an answer to the question we asked.
//   2. Any blocker (cancel / reschedule / can't make it / another day) in that
//      window suppresses the signal entirely, even if an earlier message read
//      as a yes. "Yes… actually, can we move it?" is a job for a human.
//   3. Bare interjections ("yes", "ok", 👍) only count in a short message, so
//      an "ok but ..." paragraph never passes as a confirmation on its own.
// ============================================================

/** Longest message (characters) a bare "yes"/"ok"/"👍" can confirm from. */
export const BARE_AFFIRMATIVE_MAX_LENGTH = 40;

/**
 * Explicit confirmations — unambiguous enough to count inside a longer
 * message ("Yes that's great, Bella will be there at 9").
 */
const CONFIRMATION_CUES: RegExp[] = [
  /\bconfirm(s|ed|ing)?\b/,
  /\bsee (you|ya|u)\b/,
  /\b(we'?ll|i'?ll|we will|i will|we'?re|i'?m|we are|i am) (be )?(there|coming|bringing)\b/,
  /\b(that'?s|thats|sounds) (fine|great|grand|good|perfect|lovely|right|correct|spot on|all good)\b/,
  /\b(all )?(good|fine) (for|with) (us|me|that|then)\b/,
  /\bstill (coming|on|ok|okay|good|fine)\b/,
  /\b(yes|yep|yeah|yup) (please|thanks|thank you|that'?s right|we are|we'?ll|i'?ll|see)\b/,
  /\bbooked in\b/,
  /\blooking forward\b/,
];

/**
 * Bare affirmations — only trusted in a SHORT message, where there is no room
 * for a qualifier the salon would need to read.
 *
 * Deliberately omits "ye", for the same reason POSITIVE_TOKENS in
 * agentHelpers.ts does: in UK/Irish colloquial it means "you", not "yes".
 * (That helper is a different job — confirming the AI's booking summary
 * mid-flow — so the two lists are related but not interchangeable.)
 */
const BARE_AFFIRMATIVE =
  /^\W*(yes|yep|yeah|yup|yeh|yh|aye|ok|oki|okay|okey|k|kk|sure|great|perfect|lovely|brilliant|fab|fine|grand|noted|confirmed)\b/;

/**
 * A reply that is nothing but thumbs-up / tick emoji. Kept separate from
 * BARE_AFFIRMATIVE because emoji aren't word characters, so a `\b` anchor never
 * matches after one. Tested against the body with variation selectors and skin
 * tone modifiers stripped, so the class holds bare base emoji only — a combined
 * character inside a class is a lint error, and listing every "👍🏽" variant is
 * hopeless anyway.
 */
const AFFIRMATIVE_EMOJI_ONLY = /^[\s👍👌👏✅✔🙂😊😀🐶❤🥰]+$/u;
const EMOJI_MODIFIERS = /[\uFE0E\uFE0F\u{1F3FB}-\u{1F3FF}]/gu;

/**
 * Anything that means "this is not a clean yes". One of these anywhere in the
 * post-reminder window suppresses the whole signal — the booking stays
 * unconfirmed and a human reads the thread.
 */
const CONFIRMATION_BLOCKERS: RegExp[] = [
  /\bcancel/,
  /\breschedul/,
  /\brearrange/,
  /\bcan'?t\b/,
  /\bcannot\b/,
  /\bunable\b/,
  /\bnot able\b/,
  /\bwon'?t be\b/,
  /\bno longer\b/,
  /\bnot (coming|going to|able|sure|be)\b/,
  /\b(another|different|later|earlier) (day|time|date|slot|week)\b/,
  /\binstead\b/,
  /\bmove (it|the|my|this)\b/,
  /\bchange (it|the|my|this)\b/,
  /\bpush (it|the|my|this) back\b/,
  /^\W*no\b/,
  /\bpoorly\b/,
  /\bin season\b/,
];

/** True when the message raises a change the salon must read and answer. */
export function hasConfirmationBlocker(text: string | null | undefined): boolean {
  const t = (text || "").trim().toLowerCase();
  if (!t) return false;
  return CONFIRMATION_BLOCKERS.some((re) => re.test(t));
}

/** True when a single message body reads as a clean confirmation. */
export function detectReplyConfirmation(text: string | null | undefined): boolean {
  const raw = (text || "").trim();
  if (!raw) return false;
  const t = raw.toLowerCase();
  if (hasConfirmationBlocker(t)) return false;
  if (CONFIRMATION_CUES.some((re) => re.test(t))) return true;
  if (raw.length > BARE_AFFIRMATIVE_MAX_LENGTH) return false;
  return BARE_AFFIRMATIVE.test(t) || AFFIRMATIVE_EMOJI_ONLY.test(raw.replace(EMOJI_MODIFIERS, ""));
}

export interface InboundMessage {
  direction: "inbound" | "outbound" | string;
  body: string | null;
  /** ISO timestamp the message was sent. */
  created_at: string;
}

export interface ReplyConfirmationSignal {
  /** When the confirming message arrived (ISO). */
  at: string;
  /** The owner's own words, for the chip's tooltip — never paraphrased. */
  text: string;
}

/**
 * The owner's confirmation reply to a reminder, or null.
 *
 * Only inbound messages sent at/after `reminderSentAt` are considered, and the
 * whole window is vetoed by a single blocker message (see module header). The
 * LAST qualifying confirmation wins, so the signal timestamp reflects the most
 * recent yes.
 */
export function latestReplyConfirmation(
  messages: InboundMessage[],
  reminderSentAt: string | null | undefined,
): ReplyConfirmationSignal | null {
  if (!reminderSentAt) return null;
  const sentAt = Date.parse(reminderSentAt);
  if (Number.isNaN(sentAt)) return null;

  let best: ReplyConfirmationSignal | null = null;
  let bestAt = -Infinity;

  for (const m of messages) {
    if (m.direction !== "inbound") continue;
    const ts = Date.parse(m.created_at);
    if (Number.isNaN(ts) || ts < sentAt) continue;

    const body = (m.body || "").trim();
    if (!body) continue;
    // A blocker anywhere after the reminder kills the signal outright.
    if (hasConfirmationBlocker(body)) return null;
    if (!detectReplyConfirmation(body)) continue;
    if (ts >= bestAt) {
      bestAt = ts;
      best = { at: m.created_at, text: body };
    }
  }

  return best;
}
