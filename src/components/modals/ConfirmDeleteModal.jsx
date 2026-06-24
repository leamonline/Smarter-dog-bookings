import { useState } from "react";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";

/**
 * ConfirmDeleteModal — small confirm dialog for destructive actions.
 *
 * Props:
 *   - title          (string)        e.g. "Delete Bella?"
 *   - message        (string|node)   primary explanatory copy
 *   - cascadeWarning (string|null)   optional second paragraph for cascade impact
 *                                    (e.g. "This will also delete 3 bookings.")
 *                                    When set, the user must tick an
 *                                    acknowledgement checkbox before confirming.
 *   - confirmLabel   (string)        button text (default "Delete")
 *   - onConfirm      (async () => void)
 *   - onClose        (() => void)
 */
export function ConfirmDeleteModal({
  title,
  message,
  cascadeWarning = null,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
}) {
  const [acknowledged, setAcknowledged] = useState(!cascadeWarning);
  const [submitting, setSubmitting] = useState(false);

  const canConfirm = acknowledged && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AccessibleModal
      onClose={submitting ? () => {} : onClose}
      titleId="confirm-delete-title"
      className="bg-white rounded-2xl shadow-xl mx-4 p-5 max-w-sm w-full animate-[toastIn_0.15s_ease-out]"
      zIndex={1300}
    >
      <h2
        id="confirm-delete-title"
        className="text-base font-bold text-slate-800 m-0 mb-1"
      >
        {title}
      </h2>

      <div className="text-sm text-slate-600 leading-relaxed">{message}</div>

      {cascadeWarning && (
        <div className="mt-3 p-3 rounded-lg bg-brand-coral/10 border border-brand-coral/30 text-[13px] text-brand-coral font-semibold leading-snug">
          {cascadeWarning}
        </div>
      )}

      {cascadeWarning && (
        <label className="mt-3 flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 w-4 h-4 cursor-pointer accent-brand-coral"
          />
          <span className="text-[13px] text-slate-700 select-none">
            I understand and want to delete anyway.
          </span>
        </label>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="btn btn-ghost"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="btn btn-danger"
        >
          {submitting ? "Deleting..." : confirmLabel}
        </button>
      </div>
    </AccessibleModal>
  );
}
