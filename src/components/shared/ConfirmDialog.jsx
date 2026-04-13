/**
 * ConfirmDialog — reusable confirmation modal built on AccessibleModal.
 *
 * Usage:
 *   <ConfirmDialog
 *     title="Remove from waitlist?"
 *     message="This person will be removed from today's waitlist."
 *     confirmLabel="Remove"
 *     variant="danger"
 *     onConfirm={() => leaveWaitlist(id)}
 *     onCancel={() => setShowConfirm(false)}
 *   />
 */
import { AccessibleModal } from "./AccessibleModal.tsx";

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}) {
  const isDanger = variant === "danger";

  return (
    <AccessibleModal
      onClose={onCancel}
      titleId="confirm-dialog-title"
      className="bg-white rounded-2xl shadow-xl mx-4 p-5 max-w-sm w-full animate-[toastIn_0.15s_ease-out]"
      zIndex={1100}
    >
      <h2
        id="confirm-dialog-title"
        className="text-base font-bold text-slate-800 m-0 mb-1"
      >
        {title}
      </h2>

      {message && (
        <p className="text-sm text-slate-600 m-0 mb-4 leading-relaxed">
          {message}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          autoFocus
          className={`btn ${isDanger ? "btn-danger" : "btn-primary"}`}
        >
          {confirmLabel}
        </button>
      </div>
    </AccessibleModal>
  );
}
