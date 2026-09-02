import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../../client";
import { logger } from "../../../lib/logger";
import type { InboxActionResult } from "./helpers";

/** The slice of a conversation row this hook touches; the list holds richer objects. */
interface ConversationWithNotes {
  id: string;
  notes?: string | null;
}

export interface UseConversationNotesArgs<T extends ConversationWithNotes> {
  selectedId: string | null | undefined;
  setConversations: Dispatch<SetStateAction<T[]>>;
}

export interface UseConversationNotesResult {
  updateConversationNotes: (notes: string, conversationId?: string | null) => Promise<InboxActionResult>;
}

export function useConversationNotes<T extends ConversationWithNotes>({
  selectedId,
  setConversations,
}: UseConversationNotesArgs<T>): UseConversationNotesResult {
  const updateConversationNotes = useCallback(async (notes: string, conversationId?: string | null): Promise<InboxActionResult> => {
    const id = conversationId ?? selectedId;
    if (!id) return { ok: false, reason: "no conversation selected" };

    const nextNotes = notes.trim() ? notes : null;

    try {
      if (!supabase) throw new Error("Not connected");
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
