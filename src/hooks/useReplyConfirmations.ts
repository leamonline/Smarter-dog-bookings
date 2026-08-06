import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase/client";
import {
  latestReplyConfirmation,
  type InboundMessage,
  type ReplyConfirmationSignal,
} from "../engine/replyConfirmation";
import { logger } from "../lib/logger";

interface ConfirmationCandidate {
  id?: string | null;
  whatsappConversationId?: string | null;
  reminderSentAt?: string | null;
  reminderConfirmedAt?: string | null;
}

/**
 * "Owner confirmed in chat" signals, keyed by BOOKING id.
 *
 * Read-only: fetches the inbound WhatsApp messages that arrived after each
 * booking's reminder went out and keyword-detects a confirmation reply (see
 * engine/replyConfirmation.ts for the matching rules and why they are tight).
 * Nothing is written back — this only stops the Daily Brief claiming a dog
 * "Needs confirmation" when the owner already answered in the inbox.
 *
 * Only bookings that were actually asked (a sent reminder) and have not been
 * confirmed the official way (the WhatsApp Confirm button → reminder_confirmed_at)
 * are looked up. Empty offline or when nothing qualifies.
 */
export function useReplyConfirmations(
  bookings: ConfirmationCandidate[],
): Record<string, ReplyConfirmationSignal> {
  const [signals, setSignals] = useState<Record<string, ReplyConfirmationSignal>>({});

  const candidates = useMemo(
    () =>
      bookings
        .filter((b) => !!b.id && !!b.whatsappConversationId && !!b.reminderSentAt && !b.reminderConfirmedAt)
        .map((b) => ({
          id: b.id as string,
          conversationId: b.whatsappConversationId as string,
          reminderSentAt: b.reminderSentAt as string,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [bookings],
  );
  // Re-fetch when the candidate set OR any reminder send time changes; a
  // reminder sent since the last run moves the window the replies are read from.
  const key = candidates.map((c) => `${c.id}:${c.conversationId}:${c.reminderSentAt}`).join(",");

  useEffect(() => {
    if (!supabase || candidates.length === 0) {
      setSignals({});
      return;
    }
    const controller = new AbortController();
    const conversationIds = [...new Set(candidates.map((c) => c.conversationId))];
    const since = candidates
      .map((c) => c.reminderSentAt)
      .reduce((earliest, at) => (at < earliest ? at : earliest));

    (async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("conversation_id, direction, content, sent_at")
        .in("conversation_id", conversationIds)
        .eq("direction", "inbound")
        .gte("sent_at", since)
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      if (error) {
        logger.error("useReplyConfirmations: failed to load messages", error);
        setSignals({});
        return;
      }

      const byConversation: Record<string, InboundMessage[]> = {};
      (data || []).forEach(
        (m: { conversation_id: string; direction: string; content: string | null; sent_at: string }) => {
          (byConversation[m.conversation_id] ||= []).push({
            direction: m.direction,
            body: m.content,
            created_at: m.sent_at,
          });
        },
      );

      const out: Record<string, ReplyConfirmationSignal> = {};
      candidates.forEach((candidate) => {
        const signal = latestReplyConfirmation(
          byConversation[candidate.conversationId] || [],
          candidate.reminderSentAt,
        );
        if (signal) out[candidate.id] = signal;
      });
      setSignals(out);
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return signals;
}
