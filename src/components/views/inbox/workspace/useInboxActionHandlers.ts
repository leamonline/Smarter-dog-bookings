/**
 * useInboxActionHandlers — the inbox's user-facing action wrappers (Debt 10).
 * Extracted from InboxWorkspaceController.jsx.
 *
 * Each handler calls the corresponding useWhatsAppInbox action and adds the
 * success / failure toast so screen-reader users hear confirmation (errors
 * that need surrounding context stay inline in the panels). Toasts go
 * through the aria-live region inside ToastProvider, so they are announced
 * without stealing focus. Nothing here changes what is sent or when — the
 * WhatsApp 24-hour window and template rules stay with the composer and the
 * hook.
 */
import { useCallback } from "react";

/** The result shape the inbox actions share: `{ ok }` plus, per action, a
 *  human-readable `reason`, the generated `replyText`, an update `summary`
 *  or the affected `ids`. Structural so the JSX call site needs no casts. */
export interface InboxActionResult {
  ok?: boolean;
  reason?: string | null;
  replyText?: string | null;
  summary?: string | null;
  ids?: string[];
}

type Result = InboxActionResult | null | undefined | void;

/** The useWhatsAppInbox actions this hook wraps (method syntax keeps the
 *  parameters bivariant so the real, more specific signatures fit). */
export interface InboxActions {
  approveDraft(opts?: unknown): Promise<Result>;
  rejectDraft(opts?: unknown): Promise<Result>;
  sendManualReply(opts?: unknown): Promise<Result>;
  applyBookingAction(actionId: string, editedPayload?: unknown): Promise<Result>;
  rejectBookingAction(actionId: string, reason?: string): Promise<Result>;
  resolveConversation(conversationId?: string): Promise<Result>;
  reopenConversation(conversationId?: string): Promise<Result>;
  bulkResolveConversations(ids: string[]): Promise<Result>;
  bulkReopenConversations(ids: string[]): Promise<Result>;
  generateReplyForConversation(conversationId: string): Promise<Result>;
  updateNotesFromConversation(conversationId: string): Promise<Result>;
}

export interface Toast {
  show(message: string, variant?: string, action?: () => void): void;
}

export interface UseInboxActionHandlersOptions {
  inbox: InboxActions;
  selectedId: string | null;
  toast: Toast;
  /** Clears the per-conversation reply draft after a successful send. */
  clearDraft: (conversationId: string) => void;
  /** Refreshes the customer-context panel after "Update notes". */
  refetchCustomerContext?: () => void;
}

export function useInboxActionHandlers({
  inbox,
  selectedId,
  toast,
  clearDraft,
  refetchCustomerContext,
}: UseInboxActionHandlersOptions) {
  const {
    approveDraft,
    rejectDraft,
    sendManualReply,
    applyBookingAction,
    rejectBookingAction,
    resolveConversation,
    reopenConversation,
    bulkResolveConversations,
    bulkReopenConversations,
    generateReplyForConversation,
    updateNotesFromConversation,
  } = inbox;

  const handleApproveDraft = useCallback(async (opts?: unknown) => {
    const res = await approveDraft(opts);
    if (res?.ok) toast.show("Reply sent", "success");
    return res;
  }, [approveDraft, toast]);

  const handleRejectDraft = useCallback(async (opts?: unknown) => {
    const res = await rejectDraft(opts);
    if (res?.ok) toast.show("Draft rejected.", "info");
    return res;
  }, [rejectDraft, toast]);

  const handleSendManualReply = useCallback(async (opts?: unknown) => {
    const res = await sendManualReply(opts);
    if (res?.ok) toast.show("Reply sent", "success");
    return res;
  }, [sendManualReply, toast]);

  // The composer's send: on success the conversation's controlled draft is
  // cleared so the box empties without a remount.
  const handleSendDraft = useCallback(async (opts?: unknown) => {
    const res = await handleSendManualReply(opts);
    if (res?.ok && selectedId) clearDraft(selectedId);
    return res;
  }, [handleSendManualReply, selectedId, clearDraft]);

  const handleRetryMessage = useCallback(
    (message: { content?: string | null }) =>
      handleSendManualReply({ text: message.content }),
    [handleSendManualReply],
  );

  const handleApplyBookingAction = useCallback(async (actionId: string, editedPayload?: unknown) => {
    const res = await applyBookingAction(actionId, editedPayload);
    if (res?.ok) toast.show("Booking added to the diary", "success");
    return res;
  }, [applyBookingAction, toast]);

  const handleRejectBookingAction = useCallback(async (actionId: string, reason?: string) => {
    const res = await rejectBookingAction(actionId, reason);
    if (res?.ok) toast.show("Booking proposal rejected.", "info");
    return res;
  }, [rejectBookingAction, toast]);

  // Resolve / reopen with an undo toast. The undo button only appears for
  // the resolve path because reopen is already cheap (and on the exact same
  // button) — clicking Mark complete again returns the conversation to the
  // active queue if it was reopened in error.
  const handleResolveConversation = useCallback(async () => {
    const targetId = selectedId ?? undefined;
    const res = await resolveConversation();
    if (res?.ok) {
      toast.show("Conversation closed", "success", () => {
        void reopenConversation(targetId);
      });
    } else if (res?.reason) {
      toast.show(`Could not close: ${res.reason}`, "error");
    }
    return res;
  }, [resolveConversation, reopenConversation, selectedId, toast]);

  const handleReopenConversation = useCallback(async () => {
    const res = await reopenConversation();
    if (res?.ok) toast.show("Conversation reopened", "info");
    else if (res?.reason) toast.show(`Could not reopen: ${res.reason}`, "error");
    return res;
  }, [reopenConversation, toast]);

  // Bulk close: one round-trip closes every ticked conversation, then a
  // single undo toast reopens exactly those ids (mirrors the single-close
  // undo). No confirm modal — the undo toast is the safety net at any count.
  // Realtime echoes the closes into the list with no extra wiring.
  const handleBulkClose = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return undefined;
    const res = await bulkResolveConversations(ids);
    if (res?.ok) {
      const closedIds = res.ids ?? ids;
      const n = closedIds.length;
      toast.show(
        `${n} conversation${n === 1 ? "" : "s"} closed`,
        "success",
        () => {
          void bulkReopenConversations(closedIds);
        },
      );
    } else if (res?.reason) {
      toast.show(`Could not close: ${res.reason}`, "error");
    }
    return res;
  }, [bulkResolveConversations, bulkReopenConversations, toast]);

  // Generate-reply (AI on demand) lives inside the compose row. It asks the
  // AI for a suggested reply and ComposePanel types the returned text into
  // the box — nothing is sent. The result is returned so ComposePanel can
  // read replyText.
  const handleGenerateReply = useCallback(async () => {
    if (!selectedId) return undefined;
    const res = await generateReplyForConversation(selectedId);
    if (res?.ok && res.replyText) {
      toast.show("Suggested reply added — review and send when ready", "info");
    } else if (res?.ok) {
      toast.show("The AI didn't have a suggestion this time — give it another go", "info");
    } else if (res?.reason) {
      toast.show(`Could not generate: ${res.reason}`, "error");
    }
    return res;
  }, [generateReplyForConversation, selectedId, toast]);

  // "Update notes" — AI reads the thread and appends durable customer notes
  // + dog grooming requests to their records (nothing is sent). On success,
  // refresh the panel so new dog groom-notes show straight away. Returns the
  // result so the panel button can manage its busy state.
  const handleUpdateNotes = useCallback(async () => {
    if (!selectedId) return undefined;
    const res = await updateNotesFromConversation(selectedId);
    if (res?.ok) {
      toast.show(res.summary ?? "Notes updated", "success");
      refetchCustomerContext?.();
    } else if (res?.reason) {
      toast.show(`Could not update notes: ${res.reason}`, "error");
    }
    return res;
  }, [updateNotesFromConversation, selectedId, toast, refetchCustomerContext]);

  return {
    approveDraft: handleApproveDraft,
    rejectDraft: handleRejectDraft,
    sendManualReply: handleSendManualReply,
    sendDraft: handleSendDraft,
    retryMessage: handleRetryMessage,
    applyBookingAction: handleApplyBookingAction,
    rejectBookingAction: handleRejectBookingAction,
    resolveConversation: handleResolveConversation,
    reopenConversation: handleReopenConversation,
    bulkClose: handleBulkClose,
    generateReply: handleGenerateReply,
    updateNotes: handleUpdateNotes,
  };
}
