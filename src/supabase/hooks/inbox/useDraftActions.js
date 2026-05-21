// useDraftActions — the four reply-side callbacks on the inbox
// thread:
//
//   approveDraft({ editedText })
//     POSTs the (optionally edited) draft via the whatsapp-send edge
//     function. On success: clears the local draft + flips the
//     conversation's has_pending_draft amber dot off.
//
//   approveDraftAndApply({ editedText })
//     Sends + applies any AI-attached booking proposals as one click.
//     Order: apply each action sequentially, stop on first error,
//     THEN send the reply. If the send fails after a successful
//     apply, the booking is real and the error tells staff to send
//     manually. Falls through to approveDraft when no actions are
//     attached.
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
import { supabase } from "../../client.js";
import { logger } from "../../../lib/logger.js";
import { applyWhatsappBookingAction } from "../../rpc.js";
import { SEND_FUNCTION_PATH } from "./helpers.js";

export function useDraftActions({
  draft,
  attachedActions,
  actionInFlight,
  selectedId,
  setActionInFlight,
  setDraft,
  setBookingActions,
  setConversations,
  selectedIdRef,
}) {
  const approveDraft = useCallback(async ({ editedText } = {}) => {
    if (!draft || actionInFlight) {
      return { ok: false, reason: "no draft or action in flight" };
    }
    setActionInFlight(true);
    try {
      const { data, error } = await supabase.functions.invoke(SEND_FUNCTION_PATH, {
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
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [draft, actionInFlight, setActionInFlight, setDraft, setConversations, selectedIdRef]);

  const approveDraftAndApply = useCallback(async ({ editedText } = {}) => {
    if (!draft || actionInFlight) {
      return { ok: false, reason: "no draft or action in flight" };
    }
    if (attachedActions.length === 0) {
      return approveDraft({ editedText });
    }

    setActionInFlight(true);
    try {
      // 1. Apply each attached action sequentially. Stop on first error.
      const applied = [];
      for (const action of attachedActions) {
        const { data: bookingId, error: applyError } = await applyWhatsappBookingAction(
          supabase,
          { actionId: action.id },
        );
        if (applyError) {
          const dogLabel = action.payload?.dog_name ?? "booking";
          return {
            ok: false,
            reason: `Apply failed for ${dogLabel}: ${applyError.message}`,
            appliedSoFar: applied,
          };
        }
        applied.push({ actionId: action.id, bookingId });
      }

      // 2. Optimistic: clear applied actions from local state.
      setBookingActions((prev) =>
        prev.filter((a) => !applied.some((x) => x.actionId === a.id)),
      );

      // 3. Send the reply.
      const { data: sendData, error: sendError } = await supabase.functions
        .invoke(SEND_FUNCTION_PATH, {
          body: {
            mode: "draft",
            draft_id: draft.id,
            ...(editedText ? { edited_text: editedText } : {}),
          },
        });
      if (sendError || sendData?.error) {
        const reason = sendError?.message ?? sendData?.error ?? "Send failed";
        return {
          ok: false,
          reason: `${reason} (booking was applied — please send the reply manually)`,
          appliedSoFar: applied,
        };
      }

      // 4. Optimistic: clear the pending draft and flip both badges.
      setDraft(null);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedIdRef.current
            ? { ...c, has_pending_draft: false, has_pending_booking_action: false }
            : c,
        ),
      );

      return { ok: true, applied, sendResult: sendData };
    } catch (err) {
      logger.error("approveDraftAndApply failed", err, {
        tags: { hook: "useDraftActions", op: "approveDraftAndApply" },
      });
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [
    draft,
    attachedActions,
    actionInFlight,
    approveDraft,
    setActionInFlight,
    setDraft,
    setBookingActions,
    setConversations,
    selectedIdRef,
  ]);

  const rejectDraft = useCallback(async ({ reason } = {}) => {
    if (!draft || actionInFlight) return { ok: false };
    setActionInFlight(true);
    try {
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
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [draft, actionInFlight, setActionInFlight, setDraft, setConversations, selectedIdRef]);

  const sendManualReply = useCallback(async ({ text } = {}) => {
    if (!selectedId || actionInFlight) {
      return { ok: false, reason: "no conversation selected or action in flight" };
    }
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return { ok: false, reason: "empty message" };

    setActionInFlight(true);
    try {
      const { data, error } = await supabase.functions.invoke(SEND_FUNCTION_PATH, {
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
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight]);

  return { approveDraft, approveDraftAndApply, rejectDraft, sendManualReply };
}
