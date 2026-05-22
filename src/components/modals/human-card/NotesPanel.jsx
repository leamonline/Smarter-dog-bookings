import { StickyNote } from "lucide-react";
import { PanelShell } from "./PanelShell.jsx";

// Notes (free-form) + history flag (loud warning). History flag is
// rendered as a coral-tinted strip at the top of the panel — same
// pattern the booking card uses for the "attention" tone.

export function NotesPanel({
  isEditing,
  human,
  editNotes,
  setEditNotes,
  editHistoryFlag,
  setEditHistoryFlag,
}) {
  const flag = isEditing ? editHistoryFlag : human.historyFlag;
  return (
    <PanelShell eyebrow="Notes" icon={StickyNote} accent="slate">
      {flag && !isEditing && (
        <div className="mb-3 text-[12px] font-semibold text-brand-coral-text bg-brand-coral-light border border-brand-coral/20 px-3 py-2 rounded-control">
          <span aria-hidden="true">{"⚠️ "}</span>
          {flag}
        </div>
      )}

      {isEditing ? (
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              General notes
            </span>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Anything worth remembering..."
              rows={3}
              aria-label="General notes"
              className="mt-1 w-full py-2 px-2.5 rounded-control border border-slate-200 text-sm font-inherit outline-none text-brand-purple resize-y bg-white focus:border-brand-teal transition-colors"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
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
      ) : (
        <div
          className={`text-sm whitespace-pre-line ${human.notes ? "text-brand-purple" : "text-slate-400 italic"}`}
        >
          {human.notes || "No notes yet."}
        </div>
      )}
    </PanelShell>
  );
}
