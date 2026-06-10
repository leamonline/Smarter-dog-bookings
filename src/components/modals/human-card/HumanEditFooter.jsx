// Edit-mode footer bar: Cancel / Save changes, plus an optional Delete…
// link when the parent wired a delete handler. Rendered only while the
// card is in edit mode.
import { Check } from "lucide-react";

export function HumanEditFooter({ dirty, saving, onCancel, onSave, onDelete }) {
  return (
    <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3 flex items-center gap-2.5">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="px-4 py-2 rounded-control border-[1.5px] border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving}
        className="ml-auto py-2 px-5 rounded-full border-none text-sm font-bold font-inherit cursor-pointer transition-colors bg-action text-on-action hover:bg-brand-yellow-dark disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
      >
        <Check size={14} strokeWidth={2.4} aria-hidden="true" />{" "}
        {saving ? "Saving…" : "Save changes"}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={saving}
          className="text-xs font-bold text-brand-coral underline cursor-pointer bg-transparent border-none p-0 font-[inherit] hover:text-brand-coral-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Delete…
        </button>
      )}
    </div>
  );
}
