import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase/client";
import { latestOnTheWaySignal, ON_THE_WAY_WINDOW_MINUTES, type OnTheWaySignal, type InboundMessage } from "../engine/onTheWay";
import { logger } from "../lib/logger";

interface HasConversation {
  id?: string | null;
  whatsappConversationId?: string | null;
}

/**
 * "Owner on the way" signals (improvement #2), keyed by BOOKING id — which is
 * how every consumer reads them (`onTheWaySignals[booking.id]` in
 * StatusBoard.jsx / ArrivingSlotGroup.jsx). They were previously keyed by
 * conversation id, so the lookup never hit and the chip never rendered.
 *
 * Read-only: fetches recent INBOUND messages for the given bookings'
 * conversations and keyword-detects an on-the-way intent. Never touches the
 * agent / auto-send. Empty offline or when no booking has a conversation.
 */
export function useOnTheWaySignals(bookings: HasConversation[]): Record<string, OnTheWaySignal> {
  const [signals, setSignals] = useState<Record<string, OnTheWaySignal>>({});

  // Several dogs from one household share a conversation, so keep the
  // booking → conversation pairs and fan the one thread's signal back out
  // across every booking on it.
  const candidates = useMemo(
    () =>
      bookings
        .filter((b) => !!b.id && !!b.whatsappConversationId)
        .map((b) => ({ id: b.id as string, conversationId: b.whatsappConversationId as string }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [bookings],
  );
  const convIds = useMemo(
    () => [...new Set(candidates.map((c) => c.conversationId))],
    [candidates],
  );
  const key = candidates.map((c) => `${c.id}:${c.conversationId}`).join(",");

  useEffect(() => {
    if (!supabase || convIds.length === 0) {
      setSignals({});
      return;
    }
    const controller = new AbortController();
    (async () => {
      const since = new Date();
      since.setMinutes(since.getMinutes() - ON_THE_WAY_WINDOW_MINUTES);
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("conversation_id, direction, content, sent_at")
        .in("conversation_id", convIds)
        .eq("direction", "inbound")
        .gte("sent_at", since.toISOString())
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      if (error) {
        logger.error("useOnTheWaySignals: failed to load messages", error);
        setSignals({});
        return;
      }

      const byConv: Record<string, InboundMessage[]> = {};
      (data || []).forEach((m: { conversation_id: string; direction: string; content: string | null; sent_at: string }) => {
        (byConv[m.conversation_id] ||= []).push({ direction: m.direction, body: m.content, created_at: m.sent_at });
      });
      const now = new Date();
      const byConversationSignal: Record<string, OnTheWaySignal> = {};
      Object.entries(byConv).forEach(([cid, msgs]) => {
        const sig = latestOnTheWaySignal(msgs, now);
        if (sig) byConversationSignal[cid] = sig;
      });
      const out: Record<string, OnTheWaySignal> = {};
      candidates.forEach((candidate) => {
        const sig = byConversationSignal[candidate.conversationId];
        if (sig) out[candidate.id] = sig;
      });
      setSignals(out);
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return signals;
}
