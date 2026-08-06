// ============================================================
// "Owner confirmed in chat" detection — pure TS, zero React.
//
// The problem this solves: `needsConfirmation()` (today.ts) only clears when
// `bookings.reminder_confirmed_at` is stamped, and the ONLY thing that stamps
// it is the customer tapping the "Confirm" Quick Reply button on the WhatsApp
// reminder template (whatsapp-agent → mark_reminder_confirmed). A customer who
// instead types a reply — "yes", "confirmed", "see you Tuesday" — lands in the
// inbox as an ordinary message, nothing is stamped, and the Daily Brief keeps
// telling staff the dog "Needs confirmation" hours after the owner said yes.
//
// This module reads those inbox replies and derives the missing signal. It is
// strictly READ-ONLY and display-level: it never writes to bookings, never
// touches the WhatsApp agent / auto-send / gates, and never fabricates a
// `reminder_confirmed_at` timestamp — the green "Confirmed via WhatsApp" tick
// still means only the real button tap. Same shape and spirit as
// `engine/onTheWay.ts`.
//
// Safety posture: a false positive stops staff chasing an owner who never
// replied, so the matching is deliberately tighter than the on-the-way chip's:
//   1. Only INBOUND messages sent AFTER the reminder went out count — the reply
//      has to be an answer to the question we asked.
//   2. Any blocker (cancel / reschedule / can't make it / another day) anywhere
//      in that window suppresses the signal entirely, even if an earlier
//      message read as a yes. "Yes … actually, can we move it?" is a
//      conversation for a human, not a card that quietly goes quiet.
//   3. Bare interjections ("yes", "ok", "👍") only count in a short message, so
//      an "ok but ..." paragraph never passes as a confirmation on its own.
// ============================================================

import type { NeedActionReason } from "./today";

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
 */
const BARE_AFFIRMATIVE = /^\W*(yes|yep|yeah|yup|yh|ye|aye|ok|oki|okay|okey|k|kk|sure|great|perfect|lovely|brilliant|fab|fine|grand|noted|confirmed)\b/;

/**
 * A reply that is nothing but thumbs-up / tick emoji. Kept separate from
 * BARE_AFFIRMATIVE because emoji aren't word characters, so a `\b` anchor never
 * matches after one. Tested against the body with variation selectors stripped,
 * so the class holds bare base emoji only — a combined character inside a class
 * is a lint error, and would miss the "❤️" spelling anyway.
 */
const AFFIRMATIVE_EMOJI_ONLY = /^[\s👍👌👏✅✔🙂😊😀🐶❤🥰]+$/u;
const VARIATION_SELECTORS = /[\uFE0E\uFE0F]/g;

/**
 * Anything that means "this is not a clean yes". One of these anywhere in the
 * post-reminder window suppresses the whole signal — the card keeps saying
 * "Needs confirmation" and a human reads the thread.
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

/** True when a single message body reads as a clean confirmation. */
export function detectReplyConfirmation(text: string | null | undefined): boolean {
  const raw = (text || "").trim();
  if (!raw) return false;
  const t = raw.toLowerCase();
  if (CONFIRMATION_BLOCKERS.some((re) => re.test(t))) return false;
  if (CONFIRMATION_CUES.some((re) => re.test(t))) return true;
  if (raw.length > BARE_AFFIRMATIVE_MAX_LENGTH) return false;
  return BARE_AFFIRMATIVE.test(t) || AFFIRMATIVE_EMOJI_ONLY.test(raw.replace(VARIATION_SELECTORS, ""));
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
    if (CONFIRMATION_BLOCKERS.some((re) => re.test(body.toLowerCase()))) return null;
    if (!detectReplyConfirmation(body)) continue;
    if (ts >= bestAt) {
      bestAt = ts;
      best = { at: m.created_at, text: body };
    }
  }

  return best;
}

/** The subset of a Daily Brief feed entry this module reads and rewrites. */
export interface ChatConfirmableEntry {
  booking: { id?: string | null };
  isUnconfirmed: boolean;
  needsAction: boolean;
  actionReasons: NeedActionReason[];
}

export type WithChatConfirmation<T> = T & {
  chatConfirmation: ReplyConfirmationSignal | null;
};

/**
 * Fold chat confirmations into an already-built feed: an entry whose owner
 * replied "yes" after the reminder stops counting as unconfirmed, and carries
 * the signal so the card can say so in the owner's own words.
 *
 * Applied to the built feed rather than inside `buildTodayFeed` on purpose —
 * the engine stays pure and synchronous; the messages behind the signal are
 * fetched asynchronously by `useReplyConfirmations`. Stripping the reason here
 * keeps every downstream consumer (lane warnings, the "N to confirm" heading,
 * the "N need action" count, the Needs-action filter, card tone) in agreement
 * with what the card shows.
 */
export function applyChatConfirmations<T extends ChatConfirmableEntry>(
  entries: T[],
  signals: Record<string, ReplyConfirmationSignal>,
): WithChatConfirmation<T>[] {
  return entries.map((entry) => {
    const signal = (entry.booking?.id && signals[entry.booking.id]) || null;
    if (!signal || !entry.isUnconfirmed) {
      return { ...entry, chatConfirmation: signal };
    }
    const actionReasons = entry.actionReasons.filter((reason) => reason !== "confirmation");
    return {
      ...entry,
      isUnconfirmed: false,
      actionReasons,
      needsAction: actionReasons.length > 0,
      chatConfirmation: signal,
    };
  });
}
