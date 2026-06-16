import { useState } from "react";
import { AccessibleModal } from "../../shared/AccessibleModal.tsx";
import { titleCase } from "../../../utils/text";

// Shown at booking time when the dog's owner has trusted humans. The owner is
// pre-ticked as the default recipient; trusted humans are opt-in. Returns the
// chosen human ids to onConfirm (the caller maps owner-only back to the default
// "notify the owner" behaviour).
export function NotifyRecipientsDialog({ owner, trusted, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(() => new Set(owner?.id ? [owner.id] : []));

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const Row = ({ id, label, sub }) => {
    const checked = selected.has(id);
    return (
      <label
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggle(id)}
          className="w-4 h-4 accent-brand-teal cursor-pointer"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold text-slate-800 truncate">
            {titleCase(label)}
          </span>
          {sub && <span className="block text-[11px] text-slate-400">{sub}</span>}
        </span>
      </label>
    );
  };

  return (
    <AccessibleModal
      onClose={onCancel}
      titleId="notify-recipients-title"
      className="bg-white rounded-2xl w-[min(380px,95vw)] max-h-[90vh] overflow-auto shadow-modal"
    >
      <div className="px-5 py-4">
        <div id="notify-recipients-title" className="text-base font-extrabold text-brand-purple">
          Who should we notify?
        </div>
        <p className="text-xs text-slate-500 mt-1 mb-3">
          Booking updates (confirmation, reminder, ready &amp; cancellation) go to
          everyone ticked.
        </p>

        <div className="flex flex-col gap-1.5">
          {owner?.id && <Row id={owner.id} label={owner.fullName} sub="Owner" />}
          {trusted.map((t) => (
            <Row key={t.id} id={t.id} label={t.fullName} sub={t.relationship || "Trusted human"} />
          ))}
        </div>

        <div className="flex gap-2.5 mt-4">
          <button
            type="button"
            onClick={() => onConfirm([...selected])}
            className="flex-1 py-2.5 rounded-full border-none bg-action text-on-action text-sm font-bold cursor-pointer font-inherit hover:bg-brand-yellow-dark transition-colors"
          >
            Confirm booking
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="py-2.5 px-5 rounded-full border-[1.5px] border-slate-200 bg-white text-slate-500 text-sm font-semibold cursor-pointer font-inherit"
          >
            Cancel
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}
