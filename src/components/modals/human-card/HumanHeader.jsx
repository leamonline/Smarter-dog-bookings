import { useState } from "react";
import { Copy, Pencil, X } from "lucide-react";
import { titleCase } from "../../../utils/text.js";
import { telLink, waLink } from "../dog-card/helpers.js";

// Quiet dashboard-style header. Replaces the teal-gradient bar that
// made the modal feel like a different product. Visual reference:
// DayHeader (warm-navy heading) + dashboard right-column chip buttons.

export function HumanHeader({
  human,
  humanFullName,
  isEditing,
  editName,
  setEditName,
  editSurname,
  setEditSurname,
  editPhone,
  setEditPhone,
  onStartEdit,
  onClose,
  canEdit,
  onCopyPhone,
}) {
  const [hovering, setHovering] = useState(false);

  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Human profile
        </div>
        {isEditing ? (
          <>
            <div className="flex gap-2 mt-1">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="First name"
                aria-label="First name"
                className="text-lg font-bold font-display text-brand-purple bg-white border border-slate-200 rounded-lg px-2.5 py-1 flex-1 min-w-0 outline-none font-inherit focus:border-brand-teal"
              />
              <input
                value={editSurname}
                onChange={(e) => setEditSurname(e.target.value)}
                placeholder="Surname"
                aria-label="Surname"
                className="text-lg font-bold font-display text-brand-purple bg-white border border-slate-200 rounded-lg px-2.5 py-1 flex-1 min-w-0 outline-none font-inherit focus:border-brand-teal"
              />
            </div>
            <input
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="Phone"
              type="tel"
              aria-label="Phone"
              className="mt-2 text-[13px] bg-white border border-slate-200 rounded-md px-2.5 py-1 w-full max-w-[280px] box-border outline-none font-inherit text-slate-700 focus:border-brand-teal"
            />
          </>
        ) : (
          <>
            <h2
              id="human-card-title"
              className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1 truncate"
            >
              {titleCase(humanFullName) || "Unnamed human"}
            </h2>
            <div
              className="flex items-center gap-2 mt-1.5 min-h-[20px]"
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              {human.phone ? (
                <>
                  <a
                    href={telLink(human.phone)}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[13px] text-slate-500 font-semibold no-underline hover:text-brand-purple transition-colors"
                  >
                    {human.phone}
                  </a>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopyPhone();
                    }}
                    onFocus={() => setHovering(true)}
                    onBlur={() => setHovering(false)}
                    aria-label={`Copy phone number ${human.phone}`}
                    title="Copy to clipboard"
                    className={`w-6 h-6 rounded-md flex items-center justify-center bg-transparent border-none cursor-pointer text-slate-400 hover:text-brand-purple hover:bg-slate-100 transition-all ${hovering ? "opacity-100" : "opacity-0 focus-visible:opacity-100"}`}
                  >
                    <Copy size={12} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                  <a
                    href={waLink(human.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Open in WhatsApp"
                    className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md no-underline hover:bg-emerald-100 transition-colors"
                  >
                    WA
                  </a>
                </>
              ) : (
                <span className="text-[13px] text-slate-400 italic">No phone</span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {!isEditing && canEdit && (
          <button
            type="button"
            onClick={onStartEdit}
            aria-label="Edit profile"
            title="Edit profile"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-slate-200 cursor-pointer text-slate-500 hover:text-brand-purple hover:border-brand-purple/30 hover:bg-brand-purple/5 transition-colors shrink-0"
          >
            <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-slate-200 cursor-pointer text-slate-500 hover:text-brand-purple hover:border-brand-purple/30 hover:bg-brand-purple/5 transition-colors shrink-0"
        >
          <X size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
