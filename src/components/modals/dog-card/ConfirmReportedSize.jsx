// One-tap size confirmation for a dog that has no size yet but whose owner
// gave an estimate in the portal.
//
// A dog with no size can't be booked online, and the customer has usually just
// been told "we're confirming their size" (a "Confirm size" to-do sits on the
// dashboard). Most of the time the owner's estimate is right, so this saves
// staff opening the edit form for the common case. It is still a staff
// decision: the button writes dogs.size through the ordinary staff update, the
// same as the edit form, and the owner's estimate alone never does. Setting the
// size ticks the to-do off in the database.
//
// The write is guarded: it only lands if the dog still has no size and the
// owner's estimate is still the one on screen. If someone else set a size, or
// the customer changed the breed or estimate since the card opened, the newer
// value wins and staff are told to look again rather than overwriting it.
import { useState } from "react";
import { titleCase } from "../../../utils/text";

export function ConfirmReportedSize({ dog, onUpdateDog, onConfirmed, onFailed }) {
  const [saving, setSaving] = useState(false);
  const reported = dog?.reportedSize;
  if (!onUpdateDog || !dog || dog.size || !["small", "medium", "large"].includes(reported)) {
    return null;
  }

  const label = titleCase(reported);
  const handleConfirm = async () => {
    setSaving(true);
    try {
      const saved = await onUpdateDog(dog.id, { size: reported }, { onlyIfUnsizedWithReported: reported });
      if (saved) onConfirmed?.(reported);
      else onFailed?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="group"
      aria-label="Confirm size"
      className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-brand-paper-line bg-brand-paper/60 px-3 py-2"
    >
      <p className="m-0 min-w-0 flex-1 text-[12px] font-semibold text-slate-700">
        No size recorded. The owner thinks <strong className="text-brand-purple">{reported}</strong>.
        <span className="block text-[11px] font-medium text-ink-muted">
          They can’t book online until it’s set. Use Edit to choose a different size.
        </span>
      </p>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={saving}
        className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-brand-purple/30 bg-white px-3 text-[12px] font-bold text-brand-purple outline-none hover:bg-brand-purple hover:text-white focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {saving ? "Saving…" : `Confirm ${label}`}
      </button>
    </div>
  );
}
