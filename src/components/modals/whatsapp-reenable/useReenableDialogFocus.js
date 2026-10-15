// Where focus goes in "Switch WhatsApp back on?" as its state changes. The
// control staff used is disabled or removed while a request runs (Confirm
// shows a spinner, the footer swaps to Close), which would drop focus to
// <body> and let Tab wander into the page behind the modal. So focus moves to
// whatever now says what happened, or else stays on the dialog itself.
import { useEffect } from "react";

/** Focus is gone from the dialog: on <body>, outside it, or on a control just disabled. */
function focusLost(dialog) {
  const active = document.activeElement;
  return !active || active === document.body || active.disabled === true || !dialog.contains(active);
}

function dialogFor(titleId) {
  return document.getElementById(titleId)?.closest('[role="dialog"]') ?? null;
}

/**
 * outcomeRef: the element stating the latest outcome (a notice, the verifying
 * line, or the message that replaces the form). liveAlertRef: the alert for
 * a STOP seen on the live list, which takes focus only when focus was lost,
 * never from the note while staff are typing.
 */
export function useReenableDialogFocus({ titleId, outcomeRef, liveAlertRef, status, notice, liveNewStop }) {
  useEffect(() => {
    const dialog = dialogFor(titleId);
    if (!dialog) return;
    if (outcomeRef.current) outcomeRef.current.focus();
    else if (focusLost(dialog)) dialog.focus();
  }, [titleId, outcomeRef, status, notice]);

  useEffect(() => {
    const dialog = dialogFor(titleId);
    if (liveNewStop && liveAlertRef.current && dialog && focusLost(dialog)) liveAlertRef.current.focus();
  }, [titleId, liveAlertRef, liveNewStop]);
}
