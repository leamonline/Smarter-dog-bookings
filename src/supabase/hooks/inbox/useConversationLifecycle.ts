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
import { supabase } from "../../client";
import { logger } from "../../../lib/logger";

/** The conversation fields resolve reads; the list holds richer objects. */
export interface LifecycleConversation {
  id: string;
  closure_suggested_reason?: string | null;
}

/** `{ ok: false }` with no reason is the "nothing selected / busy" early return. */
export type LifecycleResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; reason?: string };

export interface UseConversationLifecycleArgs<T extends LifecycleConversation> {
  selectedId: string | null | undefined;
  actionInFlight: boolean;
  setActionInFlight: (inFlight: boolean) => void;
  conversations: ReadonlyArray<T>;
}

export interface UseConversationLifecycleResult {
  takeoverConversation: () => Promise<LifecycleResult>;
  releaseConversation: () => Promise<LifecycleResult>;
  /** On success carries the closure reason that was written. */
  resolveConversation: () => Promise<LifecycleResult<{ reason: string }>>;
  reopenConversation: (conversationId?: string | null) => Promise<LifecycleResult>;
  /** On success carries the ids it closed so an undo toast can reopen exactly those. */
  bulkResolveConversations: (ids: ReadonlyArray<string | null | undefined> | null | undefined) => Promise<LifecycleResult<{ ids: string[] }>>;
  bulkReopenConversations: (ids: ReadonlyArray<string | null | undefined> | null | undefined) => Promise<LifecycleResult>;
}

const CLEARED_CLOSURE = {
  closed_at: null,
  closure_reason: null,
  closure_suggested_at: null,
  closure_suggested_reason: null,
};

function failure(err: unknown): { ok: false; reason: string } {
  return { ok: false, reason: err instanceof Error ? err.message : String(err) };
}

function requireClient() {
  if (!supabase) throw new Error("Not connected");
  return supabase;
}

export function useConversationLifecycle<T extends LifecycleConversation>({
  selectedId,
  actionInFlight,
  setActionInFlight,
  conversations,
}: UseConversationLifecycleArgs<T>): UseConversationLifecycleResult {
  const takeoverConversation = useCallback(async (): Promise<LifecycleResult> => {
    if (!selectedId || actionInFlight) return { ok: false };
    setActionInFlight(true);
    try {
      const { error } = await requireClient()
        .from("whatsapp_conversations")
        .update({ state: "human_takeover" })
        .eq("id", selectedId);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      logger.error("takeoverConversation failed", err, {
        tags: { hook: "useConversationLifecycle", op: "takeoverConversation" },
      });
      return failure(err);
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight]);

  const releaseConversation = useCallback(async (): Promise<LifecycleResult> => {
    if (!selectedId || actionInFlight) return { ok: false };
    setActionInFlight(true);
    try {
      const { error } = await requireClient()
        .from("whatsapp_conversations")
        .update({ state: "ai_handling" })
        .eq("id", selectedId);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      logger.error("releaseConversation failed", err, {
        tags: { hook: "useConversationLifecycle", op: "releaseConversation" },
      });
      return failure(err);
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight]);

  const resolveConversation = useCallback(async (): Promise<LifecycleResult<{ reason: string }>> => {
    if (!selectedId || actionInFlight) return { ok: false };
    setActionInFlight(true);

    const current = conversations.find((c) => c.id === selectedId);
    const inheritedReason = current?.closure_suggested_reason ?? null;
    const reason = inheritedReason || "manual";

    try {
      const client = requireClient();
      const { data: userRes } = await client.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const { error } = await client
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
      return failure(err);
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight, conversations]);

  const reopenConversation = useCallback(async (conversationId?: string | null): Promise<LifecycleResult> => {
    const id = conversationId ?? selectedId;
    if (!id || actionInFlight) return { ok: false };
    setActionInFlight(true);
    try {
      const { error } = await requireClient()
        .from("whatsapp_conversations")
        .update(CLEARED_CLOSURE)
        .eq("id", id);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      logger.error("reopenConversation failed", err, {
        tags: { hook: "useConversationLifecycle", op: "reopenConversation" },
      });
      return failure(err);
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight]);

  // Bulk close: the same write as resolveConversation but across many rows in a
  // single round-trip (.in instead of .eq). The closure_reason is always
  // 'manual' here — bulk close doesn't inherit per-conversation "suggest
  // closing" pills. closed_by is stamped from auth.uid() so it can't be spoofed.
  // Returns the ids it closed so the caller's undo toast can reopen exactly
  // those.
  const bulkResolveConversations = useCallback(async (
    ids: ReadonlyArray<string | null | undefined> | null | undefined,
  ): Promise<LifecycleResult<{ ids: string[] }>> => {
    const targetIds = (ids || []).filter((id): id is string => Boolean(id));
    if (targetIds.length === 0 || actionInFlight) return { ok: false };
    setActionInFlight(true);
    try {
      const client = requireClient();
      const { data: userRes } = await client.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const { error } = await client
        .from("whatsapp_conversations")
        .update({
          closed_at: new Date().toISOString(),
          closed_by: userId,
          closure_reason: "manual",
          closure_suggested_at: null,
          closure_suggested_reason: null,
        })
        .in("id", targetIds);
      if (error) throw error;
      return { ok: true, ids: targetIds };
    } catch (err) {
      logger.error("bulkResolveConversations failed", err, {
        tags: { hook: "useConversationLifecycle", op: "bulkResolveConversations" },
      });
      return failure(err);
    } finally {
      setActionInFlight(false);
    }
  }, [actionInFlight, setActionInFlight]);

  // Undo for a bulk close: reopens every id in one round-trip. Mirrors
  // reopenConversation but across the captured set.
  const bulkReopenConversations = useCallback(async (
    ids: ReadonlyArray<string | null | undefined> | null | undefined,
  ): Promise<LifecycleResult> => {
    const targetIds = (ids || []).filter((id): id is string => Boolean(id));
    if (targetIds.length === 0) return { ok: false };
    setActionInFlight(true);
    try {
      const { error } = await requireClient()
        .from("whatsapp_conversations")
        .update(CLEARED_CLOSURE)
        .in("id", targetIds);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      logger.error("bulkReopenConversations failed", err, {
        tags: { hook: "useConversationLifecycle", op: "bulkReopenConversations" },
      });
      return failure(err);
    } finally {
      setActionInFlight(false);
    }
  }, [setActionInFlight]);

  return {
    takeoverConversation,
    releaseConversation,
    resolveConversation,
    reopenConversation,
    bulkResolveConversations,
    bulkReopenConversations,
  };
}
