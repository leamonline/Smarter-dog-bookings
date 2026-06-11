import { Images, Pencil, X } from "lucide-react";
import { titleCase } from "./helpers.js";
import { BreedCombobox } from "../../shared/BreedCombobox.jsx";
import { HeaderIconButton } from "../shell/index.js";

// Quiet shell header for the dog card — same anatomy as the human
// card's header (eyebrow + badge row, display name, subtitle, icon
// cluster). The old size-coloured gradient bar is gone; the size now
// reads from the ModalShell accent bar plus the tinted pill here.

const SIZE_PILL_TEXT = {
  small: "#5C4600",
  medium: "var(--color-brand-teal-text)",
  large: "var(--color-brand-coral-text)",
};

export function DogCardHeader({
  isEditing,
  resolvedDog,
  displayAge,
  editName,
  setEditName,
  editBreed,
  setEditBreed,
  editDobMonth,
  setEditDobMonth,
  editDobYear,
  setEditDobYear,
  sizeTheme,
  ownerLabel,
  onOpenOwner,
  onClose,
  onEnterEdit,
  onOpenGallery,
  titleId,
  incomplete = false,
}) {
  const subtitleParts = [
    titleCase(resolvedDog.breed),
    displayAge ? displayAge.replace(" yrs", "yo") : "",
  ].filter(Boolean);

  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Dog profile
          </span>
          {resolvedDog.size && (
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
              style={{
                background: sizeTheme.light,
                color: SIZE_PILL_TEXT[resolvedDog.size] || "#475569",
              }}
            >
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: sizeTheme.primary }}
              />
              {titleCase(resolvedDog.size)}
            </span>
          )}
          {incomplete && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300"
              title="Missing size, breed or owner — please complete this profile"
            >
              Incomplete profile
            </span>
          )}
        </div>

        {isEditing ? (
          <>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Dog name"
              aria-label="Dog name"
              className="mt-1 text-lg font-bold font-display text-brand-purple bg-white border border-slate-200 rounded-lg px-2.5 py-1 w-full box-border outline-none font-inherit focus:border-brand-teal"
            />
            <div className="flex gap-2 mt-2 items-center">
              <BreedCombobox
                value={editBreed}
                onChange={setEditBreed}
                ariaLabel="Breed"
                placeholder="Select or search breed"
                wrapperClassName="flex-1"
                inputClassName="text-[13px] bg-white border border-slate-200 rounded-md px-2 py-1 w-full outline-none font-inherit text-slate-700 focus:border-brand-teal"
              />
              <span className="text-xs text-slate-400">Born</span>
              <select
                value={editDobMonth}
                onChange={(e) => setEditDobMonth(e.target.value)}
                aria-label="Birth month"
                className="text-xs bg-white border border-slate-200 rounded-md px-1 py-1 outline-none font-inherit text-slate-700 cursor-pointer focus:border-brand-teal"
              >
                <option value="">Month</option>
                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
                ))}
              </select>
              <select
                value={editDobYear}
                onChange={(e) => setEditDobYear(e.target.value)}
                aria-label="Birth year"
                className="text-xs bg-white border border-slate-200 rounded-md px-1 py-1 outline-none font-inherit text-slate-700 cursor-pointer focus:border-brand-teal"
              >
                <option value="">Year</option>
                {Array.from({ length: 26 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <h2
              id={titleId}
              className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1 truncate"
            >
              {titleCase(resolvedDog.name)}
            </h2>
            {(subtitleParts.length > 0 || ownerLabel) && (
              <div className="text-[13px] text-slate-500 font-semibold mt-1.5 min-w-0">
                {subtitleParts.join(" · ")}
                {ownerLabel && (
                  <>
                    {subtitleParts.length > 0 && " · "}
                    {onOpenOwner ? (
                      <button
                        type="button"
                        onClick={onOpenOwner}
                        className="text-brand-teal-text font-semibold bg-transparent border-none p-0 cursor-pointer font-inherit text-[13px] hover:underline underline-offset-2"
                      >
                        {titleCase(ownerLabel)}
                      </button>
                    ) : (
                      titleCase(ownerLabel)
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {!isEditing && onOpenGallery && (
          <HeaderIconButton label="View groom photos" onClick={onOpenGallery}>
            <Images size={15} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        )}
        {!isEditing && onEnterEdit && (
          <HeaderIconButton
            label={`Edit ${resolvedDog?.name || "dog"}`}
            onClick={onEnterEdit}
          >
            <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        )}
        <HeaderIconButton label="Close" onClick={onClose}>
          <X size={16} strokeWidth={2.2} aria-hidden="true" />
        </HeaderIconButton>
      </div>
    </header>
  );
}
