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
      className="bg-white rounded-2xl w-[min(420px,92vw)] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
      zIndex={1300}
    >
      <div className="px-5 py-5">
        <div
          id="confirm-delete-title"
          className="text-base font-extrabold text-slate-800 mb-2"
        >
          {title}
        </div>

        <div className="text-sm text-slate-600 leading-snug">{message}</div>

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
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold cursor-pointer transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 rounded-lg border-none bg-brand-coral text-white text-sm font-semibold cursor-pointer transition-colors hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}
