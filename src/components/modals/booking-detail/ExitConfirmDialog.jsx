import { AccessibleModal } from "../../shared/AccessibleModal.tsx";

export function ExitConfirmDialog({ onDiscard, onKeepEditing }) {
  return (
    <AccessibleModal
      onClose={onKeepEditing}
      titleId="exit-confirm-title"
      className="bg-white rounded-2xl shadow-xl mx-4 p-5 max-w-sm w-full animate-[toastIn_0.15s_ease-out]"
      zIndex={1100}
      // Unsaved-changes guard: Escape must NOT silently dismiss — the user
      // has to choose Discard or Keep editing explicitly.
      dismissOnEscape={false}
    >
      <h2 id="exit-confirm-title" className="text-base font-bold text-slate-800 m-0 mb-1">
        Discard changes?
      </h2>
      <p className="text-sm text-slate-600 m-0 mb-4 leading-relaxed">
        You have unsaved changes. Are you sure you want to close?
      </p>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onKeepEditing}
          autoFocus
          className="btn btn-ghost"
        >
          Keep editing
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="btn btn-danger"
        >
          Discard
        </button>
      </div>
    </AccessibleModal>
  );
}
