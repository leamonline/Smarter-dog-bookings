import { IconTick } from "../../icons/index.jsx";

// Edit-mode footer. Save is the standard mustard action pill (the old
// size-gradient fill is gone — size colour lives in the shell accent
// bar now). Renders in the ModalShell footer slot so it stays pinned.
export function DogCardActions({ isEditing, onSave, onCancel }) {
  if (!isEditing) return null;

  return (
    <div className="px-6 py-3 flex gap-2.5 bg-white border-t border-slate-100">
      <button
        onClick={onCancel}
        className="px-4 py-2 rounded-control border-[1.5px] border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50"
      >
        Cancel
      </button>
      <button
        onClick={onSave}
        className="ml-auto flex-1 max-w-[220px] py-2 px-5 rounded-full border-none text-sm font-bold font-inherit cursor-pointer transition-colors bg-action text-on-action hover:bg-brand-yellow-dark flex items-center justify-center gap-1.5"
      >
        <IconTick size={15} colour="currentColor" /> Save Changes
      </button>
    </div>
  );
}
