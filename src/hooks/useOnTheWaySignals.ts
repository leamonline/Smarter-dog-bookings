import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase/client";
import { latestOnTheWaySignal, ON_THE_WAY_WINDOW_MINUTES, type OnTheWaySignal, type InboundMessage } from "../engine/onTheWay";
import { logger } from "../lib/logger";

interface HasConversation {
  whatsappConversationId?: string | null;
}

/**
 * "Owner on the way" signals (improvement #2), keyed by WhatsApp conversation
 * id. Read-only: fetches recent INBOUND messages for the given bookings'
 * conversations and keyword-detects an on-the-way intent. Never touches the
 * agent / auto-send. Empty offline or when no booking has a conversation.
 */
export function useOnTheWaySignals(bookings: HasConversation[]): Record<string, OnTheWaySignal> {
  const [signals, setSignals] = useState<Record<string, OnTheWaySignal>>({});

  const convIds = useMemo(
    () => [...new Set(bookings.map((b) => b.whatsappConversationId).filter((id): id is string => !!id))].sort(),
    [bookings],
  );
  const key = convIds.join(",");

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
      const out: Record<string, OnTheWaySignal> = {};
      Object.entries(byConv).forEach(([cid, msgs]) => {
        const sig = latestOnTheWaySignal(msgs, now);
        if (sig) out[cid] = sig;
      });
      setSignals(out);
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return signals;
}
