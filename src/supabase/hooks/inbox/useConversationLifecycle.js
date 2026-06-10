// useConversationLifecycle — the four state-transition callbacks on
// whatsapp_conversations:
//   - takeoverConversation:  state → 'human_takeover' (staff is driving)
//   - releaseConversation:   state → 'ai_handling'    (let the AI back in)
//   - resolveConversation:   closed_at = now, closure_reason inherits
//                            any active "suggest closing" pill or
//                            falls back to 'manual'. closed_by is the
//                            current auth.uid() so an attacker can't
//                            backdate someone else's closure.
//   - reopenConversation:    clears closed_at + closure_reason +
//                            closure_suggested_at/reason; closed_by
//                            is preserved for audit.
//
// Pulled out of useWhatsAppInbox so the transitions can be tested in
// isolation against a stubbed supabase client, and so the monolith
// shrinks without the InboxView consumer noticing.
import { useCallback } from "react";
import { supabase } from "../../client.js";
import { logger } from "../../../lib/logger";

export function useConversationLifecycle({
  selectedId,
  actionInFlight,
  setActionInFlight,
  conversations,
}) {
  const takeoverConversation = useCallback(async () => {
    if (!selectedId || actionInFlight) return { ok: false };
    setActionInFlight(true);
    try {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ state: "human_takeover" })
        .eq("id", selectedId);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      logger.error("takeoverConversation failed", err, {
        tags: { hook: "useConversationLifecycle", op: "takeoverConversation" },
      });
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight]);

  const releaseConversation = useCallback(async () => {
    if (!selectedId || actionInFlight) return { ok: false };
    setActionInFlight(true);
    try {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ state: "ai_handling" })
        .eq("id", selectedId);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      logger.error("releaseConversation failed", err, {
        tags: { hook: "useConversationLifecycle", op: "releaseConversation" },
      });
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight]);

  const resolveConversation = useCallback(async () => {
    if (!selectedId || actionInFlight) return { ok: false };
    setActionInFlight(true);

    const current = conversations.find((c) => c.id === selectedId);
    const inheritedReason = current?.closure_suggested_reason ?? null;
    const reason = inheritedReason || "manual";

    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({
          closed_at: new Date().toISOString(),
          closed_by: userId,
          closure_reason: reason,
          closure_suggested_at: null,
          closure_suggested_reason: null,
        })
        .eq("id", selectedId);
      if (error) throw error;
      return { ok: true, reason };
    } catch (err) {
      logger.error("resolveConversation failed", err, {
        tags: { hook: "useConversationLifecycle", op: "resolveConversation" },
      });
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight, conversations]);

  const reopenConversation = useCallback(async (conversationId) => {
    const id = conversationId ?? selectedId;
    if (!id || actionInFlight) return { ok: false };
    setActionInFlight(true);
    try {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({
          closed_at: null,
          closure_reason: null,
          closure_suggested_at: null,
          closure_suggested_reason: null,
        })
        .eq("id", id);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      logger.error("reopenConversation failed", err, {
        tags: { hook: "useConversationLifecycle", op: "reopenConversation" },
      });
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight]);

  return {
    takeoverConversation,
    releaseConversation,
    resolveConversation,
    reopenConversation,
  };
}
