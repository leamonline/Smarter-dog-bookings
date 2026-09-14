// Close guard for the booking detail modal (Debt 9; extracted from
// BookingDetailModal.jsx as a pure move).
//
// One rule, two entry points: a close request (the header X, the backdrop,
// the Escape key) closes straight away in view mode but opens the
// "Discard changes?" confirm while edit mode is on. ModalShell is rendered
// with dismissOnEscape={false} so this hook owns Escape itself, and it stops
// propagation so an outer shell does not also react to the same keypress.
import { useCallback, useEffect } from "react";

export interface UseBookingDetailCloseInput {
  isEditing: boolean;
  onClose: () => void;
  setShowExitConfirm: (open: boolean) => void;
}

export function useBookingDetailClose({
  isEditing,
  onClose,
  setShowExitConfirm,
}: UseBookingDetailCloseInput): { handleCloseAttempt: () => void } {
  const handleCloseAttempt = useCallback(() => {
    if (isEditing) setShowExitConfirm(true);
    else onClose();
  }, [isEditing, onClose, setShowExitConfirm]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      handleCloseAttempt();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleCloseAttempt]);

  return { handleCloseAttempt };
}
