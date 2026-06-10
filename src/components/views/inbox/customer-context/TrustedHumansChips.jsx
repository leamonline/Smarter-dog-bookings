// ============================================================
// src/components/views/inbox/customer-context/TrustedHumansChips.jsx
//
// Tiny pills listing who else is allowed to collect / drop off this
// customer's dog(s). Renders nothing when the list is empty so the
// section header can disappear with it.
// ============================================================

import { titleCase } from "../../../../utils/text";

export function TrustedHumansChips({ contacts, onOpenHuman }) {
  if (!Array.isArray(contacts) || contacts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {contacts.map((c) => {
        const name = titleCase(c.fullName || "");
        const relationship = c.relationship?.trim() || "";
        const label = relationship ? `${name} (${relationship})` : name;
        const clickable = !!onOpenHuman;
        return (
          <button
            key={c.id}
            type="button"
            onClick={clickable ? () => onOpenHuman(c.id) : undefined}
            disabled={!clickable}
            className={`inline-flex items-center px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-900 text-[11px] font-semibold transition-colors font-[inherit] ${
              clickable ? "cursor-pointer hover:bg-sky-100" : "cursor-default"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
