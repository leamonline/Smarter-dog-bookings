import { AccessibleModal } from "../../shared/AccessibleModal.tsx";

export function ExitConfirmDialog({ onDiscard, onKeepEditing }) {
  return (
    <AccessibleModal
      onClose={onKeepEditing}
      titleId="exit-confirm-title"
      className="bg-white rounded-2xl p-6 w-[min(300px,90vw)] shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
      zIndex={1100}
    >
      <h2 id="exit-confirm-title" className="text-base font-bold text-slate-800 mb-2">
        Discard changes?
      </h2>
      <p className="text-[13px] text-slate-500 mb-5 m-0">
        You have unsaved changes. Are you sure you want to close?
      </p>
      <div className="flex gap-2.5">
        <button
          onClick={onDiscard}
          className="flex-1 py-2.5 rounded-[10px] border-none bg-brand-coral text-white text-[13px] font-bold cursor-pointer font-inherit"
        >
          Discard
        </button>
        <button
          onClick={onKeepEditing}
          autoFocus
          className="flex-1 py-2.5 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-slate-800 text-[13px] font-bold cursor-pointer font-inherit"
        >
          Keep editing
        </button>
      </div>
    </AccessibleModal>
  );
}
