import { StickyNote, Plus } from "lucide-react";
import { PanelShell } from "../shell/PanelShell.jsx";

// Notes (free-form) + history flag (loud warning). When notes exist the
// panel grows to fill leftover vertical space in the left column so both
// columns end at the same y (capped at ~4 lines by default, with an Expand
// affordance). With no notes it collapses to a compact empty state with an
// inline "Add a note" action that jumps straight into edit mode.

export function NotesPanel({
  isEditing,
  human,
  editNotes,
  setEditNotes,
  editHistoryFlag,
  setEditHistoryFlag,
  expanded,
  onToggleExpanded,
  onStartEdit,
  notesInputRef,
}) {
  const flag = isEditing ? editHistoryFlag : human.historyFlag;
  // Collapse to a compact box when there's nothing to show, so the panel
  // stops reserving a tall empty rectangle in the left column.
  const compact = !isEditing && !human.notes;

  const headerSlot =
    !isEditing && human.notes ? (
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-label={expanded ? "Collapse notes" : "Expand notes"}
        aria-pressed={expanded}
        className="text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:text-brand-purple cursor-pointer bg-transparent border-none px-1 transition-colors"
      >
        {expanded ? "Collapse" : "Expand"}
      </button>
    ) : null;

  return (
    <PanelShell
      eyebrow="Notes"
      icon={StickyNote}
      accent="slate"
      headerSlot={headerSlot}
      className={compact ? "" : "flex-1"}
      bodyClassName={compact ? "" : "flex-1 flex flex-col min-h-0"}
    >
      {flag && !isEditing && (
        <div className="mb-2 text-[12px] font-semibold text-brand-coral-text bg-brand-coral-light border border-brand-coral/20 px-3 py-2 rounded-control shrink-0">
          <span aria-hidden="true">{"⚠️ "}</span>
          {flag}
        </div>
      )}

      {isEditing ? (
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="text-label text-ink-muted block">
              General notes
            </span>
            <textarea
              ref={notesInputRef}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Anything worth remembering..."
              rows={3}
              aria-label="General notes"
              className="mt-1 w-full py-2 px-2.5 rounded-control border border-slate-200 text-sm font-inherit outline-none text-brand-purple resize-y bg-white focus:border-brand-teal transition-colors"
            />
          </label>
          <label className="block">
            <span className="text-label text-ink-muted block">
              History flag
            </span>
            <input
              type="text"
              value={editHistoryFlag}
              onChange={(e) => setEditHistoryFlag(e.target.value)}
              placeholder="Warning to show on the card"
              aria-label="History flag"
              className="mt-1 w-full py-1.5 px-2.5 rounded-control border border-slate-200 text-sm font-inherit outline-none text-brand-purple bg-white focus:border-brand-coral transition-colors"
            />
          </label>
        </div>
      ) : human.notes ? (
        <div
          className={`text-sm whitespace-pre-line text-brand-purple overflow-y-auto ${expanded ? "flex-1 min-h-0" : "max-h-32"}`}
        >
          {human.notes}
        </div>
      ) : onStartEdit ? (
        <button
          type="button"
          onClick={onStartEdit}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-brand-purple transition-colors bg-transparent border-none cursor-pointer font-inherit p-0"
        >
          <Plus size={14} strokeWidth={2.6} aria-hidden="true" />
          Add a note
        </button>
      ) : (
        <div className="text-sm text-slate-400 italic">No notes yet.</div>
      )}
    </PanelShell>
  );
}
