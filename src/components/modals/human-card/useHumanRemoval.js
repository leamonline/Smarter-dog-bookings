// Delete / archive confirmation for the Human card (Debt 7; extracted
// from HumanCardModal.jsx as a pure move).
//
// Owns the "are you sure?" step for the two destructive actions and what
// happens after staff confirm: call the parent handler, drop the dialog,
// toast the outcome, and close the card on success. The dialogs themselves
// still render in HumanCardModal; this hook only supplies their handlers.
//
// The two paths deliberately differ, matching the parent contracts:
// - onDeleteHuman resolves `{ ok } | { error }` and is keyed by the route
//   humanId; a result with neither field is silent.
// - onArchiveHuman resolves the archived row (truthy) or null, and prefers
//   the resolved record's id so an on-demand-fetched human still archives.
//
// `pendingArchive` itself stays with useHumanCardActions (the overflow
// menu sets it); this hook is handed the setter so the archive confirm /
// cancel pair lives beside the delete one.
import { useCallback, useState } from "react";
import { useToast } from "../../../contexts/ToastContext.jsx";

export function useHumanRemoval({
  human,
  humanId,
  onClose,
  onDeleteHuman,
  onArchiveHuman,
  setPendingArchive,
}) {
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState(false);

  // The edit footer only offers Delete when the parent wired a handler.
  const requestDelete = onDeleteHuman ? () => setPendingDelete(true) : undefined;
  const cancelDelete = useCallback(() => setPendingDelete(false), []);

  const confirmDelete = useCallback(async () => {
    const result = await onDeleteHuman?.(humanId);
    setPendingDelete(false);
    if (result?.ok) {
      toast.show("Deleted", "success");
      onClose?.();
    } else if (result?.error) {
      toast.show(result.error, "error");
    }
  }, [onDeleteHuman, humanId, toast, onClose]);

  const cancelArchive = useCallback(() => setPendingArchive(false), [setPendingArchive]);

  const confirmArchive = useCallback(async () => {
    const result = await onArchiveHuman?.(human.id || humanId);
    setPendingArchive(false);
    if (result) {
      toast.show("Archived", "success");
      onClose?.();
    } else {
      toast.show("Couldn't archive that one — give it another go", "error");
    }
  }, [onArchiveHuman, human.id, humanId, setPendingArchive, toast, onClose]);

  return {
    pendingDelete,
    requestDelete,
    cancelDelete,
    confirmDelete,
    cancelArchive,
    confirmArchive,
  };
}
