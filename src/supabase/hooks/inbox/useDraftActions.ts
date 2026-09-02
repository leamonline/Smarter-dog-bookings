// useDraftActions — the three reply-side callbacks on the inbox
// thread:
//
//   approveDraft({ editedText })
//     POSTs the (optionally edited) draft via the whatsapp-send edge
//     function. On success: clears the local draft + flips the
//     conversation's has_pending_draft amber dot off.
//
//   rejectDraft({ reason })
//     UPDATEs whatsapp_drafts: state='rejected'. Reason is optional,
//     trimmed, capped at 500 chars.
//
//   sendManualReply({ text })
//     The compose-box path — no AI draft involved.
//     whatsapp-send (mode:'manual') handles the 24h window check
//     and persists the outbound message.
//
// Pulled out of useWhatsAppInbox so each path is testable in
// isolation. Takes setters + refs from the monolith — same plumbing
// pattern as useAIModeControls / useBookingActionDecisions.
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { supabase } from "../../client";
import { logger } from "../../../lib/logger";
import { SEND_FUNCTION_PATH } from "./helpers";

/** The draft fields this hook reads; the thread holds the full whatsapp_drafts row. */
export interface PendingDraft {
  id: string;
}

/** The conversation fields this hook writes; the list holds richer objects. */
export interface DraftConversation {
  id: string;
  has_pending_draft?: boolean | null;
}

/** whatsapp-send's JSON body: `error` on a handled failure, otherwise the send result. */
interface SendFunctionResponse {
  error?: string;
  [key: string]: unknown;
}

export type DraftActionResult =
  | { ok: true; result?: SendFunctionResponse | null }
  | { ok: false; reason?: string; detail?: unknown };

export interface UseDraftActionsArgs<D extends PendingDraft, C extends DraftConversation> {
  draft: D | null | undefined;
  actionInFlight: boolean;
  selectedId: string | null | undefined;
  setActionInFlight: (inFlight: boolean) => void;
  setDraft: Dispatch<SetStateAction<D | null>>;
  setConversations: Dispatch<SetStateAction<C[]>>;
  selectedIdRef: MutableRefObject<string | null | undefined>;
}

export interface UseDraftActionsResult {
  approveDraft: (args?: { editedText?: string | null }) => Promise<DraftActionResult>;
  rejectDraft: (args?: { reason?: string | null }) => Promise<DraftActionResult>;
  sendManualReply: (args?: { text?: string | null }) => Promise<DraftActionResult>;
}

function failure(err: unknown): DraftActionResult {
  return { ok: false, reason: err instanceof Error ? err.message : String(err) };
}

export function useDraftActions<D extends PendingDraft, C extends DraftConversation>({
  draft,
  actionInFlight,
  selectedId,
  setActionInFlight,
  setDraft,
  setConversations,
  selectedIdRef,
}: UseDraftActionsArgs<D, C>): UseDraftActionsResult {
  const approveDraft = useCallback(async ({ editedText }: { editedText?: string | null } = {}): Promise<DraftActionResult> => {
    if (!draft || actionInFlight) {
      return { ok: false, reason: "no draft or action in flight" };
    }
    setActionInFlight(true);
    try {
      if (!supabase) throw new Error("Not connected");
      const { data, error } = await supabase.functions.invoke<SendFunctionResponse>(SEND_FUNCTION_PATH, {
        body: {
          mode: "draft",
          draft_id: draft.id,
          ...(editedText ? { edited_text: editedText } : {}),
        },
      });

      if (error) {
        return { ok: false, reason: error.message ?? String(error), detail: data };
      }
      if (data?.error) {
        return { ok: false, reason: data.error, detail: data };
      }

      setDraft(null);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedIdRef.current ? { ...c, has_pending_draft: false } : c,
        ),
      );
      return { ok: true, result: data };
    } catch (err) {
      logger.error("approveDraft failed", err, {
        tags: { hook: "useDraftActions", op: "approveDraft" },
      });
      return failure(err);
    } finally {
      setActionInFlight(false);
    }
  }, [draft, actionInFlight, setActionInFlight, setDraft, setConversations, selectedIdRef]);

  const rejectDraft = useCallback(async ({ reason }: { reason?: string | null } = {}): Promise<DraftActionResult> => {
    if (!draft || actionInFlight) return { ok: false };
    setActionInFlight(true);
    try {
      if (!supabase) throw new Error("Not connected");
      const trimmed = typeof reason === "string" ? reason.trim() : "";
      const { error } = await supabase
        .from("whatsapp_drafts")
        .update({
          state: "rejected",
          decided_at: new Date().toISOString(),
          rejected_reason: trimmed ? trimmed.slice(0, 500) : null,
        })
        .eq("id", draft.id)
        .eq("state", "pending");
      if (error) throw error;
      setDraft(null);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedIdRef.current ? { ...c, has_pending_draft: false } : c,
        ),
      );
      return { ok: true };
    } catch (err) {
      logger.error("rejectDraft failed", err, {
        tags: { hook: "useDraftActions", op: "rejectDraft" },
      });
      return failure(err);
    } finally {
      setActionInFlight(false);
    }
  }, [draft, actionInFlight, setActionInFlight, setDraft, setConversations, selectedIdRef]);

  const sendManualReply = useCallback(async ({ text }: { text?: string | null } = {}): Promise<DraftActionResult> => {
    if (!selectedId || actionInFlight) {
      return { ok: false, reason: "no conversation selected or action in flight" };
    }
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return { ok: false, reason: "empty message" };

    setActionInFlight(true);
    try {
      if (!supabase) throw new Error("Not connected");
      const { data, error } = await supabase.functions.invoke<SendFunctionResponse>(SEND_FUNCTION_PATH, {
        body: {
          mode: "manual",
          conversation_id: selectedId,
          text: trimmed,
        },
      });

      if (error) {
        return { ok: false, reason: error.message ?? String(error), detail: data };
      }
      if (data?.error) {
        return { ok: false, reason: data.error, detail: data };
      }
      return { ok: true, result: data };
    } catch (err) {
      logger.error("sendManualReply failed", err, {
        tags: { hook: "useDraftActions", op: "sendManualReply" },
      });
      return failure(err);
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight]);

  return { approveDraft, rejectDraft, sendManualReply };
}
