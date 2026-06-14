import { useCallback } from "react";
import { supabase } from "../../client.js";
import { logger } from "../../../lib/logger";

export function useConversationNotes({ selectedId, setConversations }) {
  const updateConversationNotes = useCallback(async (notes, conversationId) => {
    const id = conversationId ?? selectedId;
    if (!id) return { ok: false, reason: "no conversation selected" };

    const nextNotes = notes.trim() ? notes : null;

    try {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ notes: nextNotes })
        .eq("id", id);
      if (error) throw error;

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === id
            ? { ...conversation, notes: nextNotes }
            : conversation,
        ),
      );
      return { ok: true };
    } catch (err) {
      logger.error("updateConversationNotes failed", err, {
        tags: { hook: "useConversationNotes", op: "updateConversationNotes" },
      });
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }, [selectedId, setConversations]);

  return { updateConversationNotes };
}
