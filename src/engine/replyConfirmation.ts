// ============================================================
// "Owner confirmed in chat" — the Daily Brief's view of reminder replies.
//
// The matching itself lives in supabase/functions/_shared/reminderConfirmation.ts
// and is re-exported here. It is imported rather than mirrored on purpose: the
// whatsapp-agent edge function uses the same rules to stamp
// `bookings.reminder_confirmed_at` when a reply arrives, and a second copy of
// the keyword lists would drift (see the capacity engine's three copies in
// CLAUDE.md). The module is dependency-free and runtime-agnostic, so it bundles
// for the browser exactly as it runs under Deno.
//
// Why the frontend still derives anything once the agent records confirmations:
// replies that arrived BEFORE the agent wiring shipped were never stamped, and
// `mark_reminder_confirmed` only stamps bookings whose reminder went out in the
// last 36 hours. This layer reads the inbox directly, so those cards stop
// chasing too. It is display-level only — it never writes to `bookings` and
// never fabricates a `reminder_confirmed_at`; the green ConfirmedMark tick
// still means a recorded confirmation.
// ============================================================

import type { NeedActionReason } from "./today";
import type { ReplyConfirmationSignal } from "../../supabase/functions/_shared/reminderConfirmation";

export {
  BARE_AFFIRMATIVE_MAX_LENGTH,
  detectReplyConfirmation,
  hasConfirmationBlocker,
  latestReplyConfirmation,
} from "../../supabase/functions/_shared/reminderConfirmation";
export type {
  InboundMessage,
  ReplyConfirmationSignal,
} from "../../supabase/functions/_shared/reminderConfirmation";

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
