import { useCallback } from "react";
import { supabase } from "../../client.js";
import { logger } from "../../../lib/logger";

export function useConversationSnooze({
  selectedId,
  actionInFlight,
  setActionInFlight,
  setConversations,
}) {
  const snoozeConversation = useCallback(async (snoozedUntil, conversationId) => {
    const id = conversationId ?? selectedId;
    if (!id || actionInFlight) return { ok: false };

    setActionInFlight(true);
    try {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ state: "snoozed", snoozed_until: snoozedUntil })
        .eq("id", id);
      if (error) throw error;

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === id
            ? { ...conversation, state: "snoozed", snoozed_until: snoozedUntil }
            : conversation,
        ),
      );
      return { ok: true };
    } catch (err) {
      logger.error("snoozeConversation failed", err, {
        tags: { hook: "useConversationSnooze", op: "snoozeConversation" },
      });
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight, setConversations]);

  const unsnoozeConversation = useCallback(async (conversationId) => {
    const id = conversationId ?? selectedId;
    if (!id || actionInFlight) return { ok: false };

    setActionInFlight(true);
    try {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ state: "ai_handling", snoozed_until: null })
        .eq("id", id);
      if (error) throw error;

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === id
            ? { ...conversation, state: "ai_handling", snoozed_until: null }
            : conversation,
        ),
      );
      return { ok: true };
    } catch (err) {
      logger.error("unsnoozeConversation failed", err, {
        tags: { hook: "useConversationSnooze", op: "unsnoozeConversation" },
      });
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight, setConversations]);

  return { snoozeConversation, unsnoozeConversation };
}
