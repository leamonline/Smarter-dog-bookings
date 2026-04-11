import { ALERT_OPTIONS } from "../../../constants/index.js";
import { IconSearch } from "../../icons/index.jsx";
import { titleCase, waLink } from "./helpers.js";

const SECTION_LABEL_CLS = "font-extrabold text-xs uppercase tracking-wide";
const INPUT_CLS = "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border";

export function DogDetailsSection({
  isEditing,
  resolvedDog,
  sizeAccent,
  // Owner display (view mode)
  ownerLabel,
  ownerOpenValue,
  owner,
  onClose,
  onOpenHuman,
  // Owner edit
  editOwnerLabel,
  showOwnerSearch,
  setShowOwnerSearch,
  ownerSearchQuery,
  setOwnerSearchQuery,
  ownerSearchResults,
  setEditOwnerId,
  // Groom notes
  editNotes,
  setEditNotes,
  // Alerts
  displayAlerts,
  editAlerts,
  setEditAlerts,
  hasAllergy,
  setHasAllergy,
  allergyInput,
  setAllergyInput,
  // Price
  editPrice,
  setEditPrice,
}) {
  const detailRow = (label, value) => (
    <div className="py-2 border-b border-slate-200">
      <span className={SECTION_LABEL_CLS} style={{ color: sizeAccent }}>{label}</span>
      <div className="text-[13px] font-semibold text-slate-800 mt-1">
        {value || "\u2014"}
      </div>
    </div>
  );

  return (
    <div className="px-6 pt-4">
      {/* Owner */}
      {isEditing ? (
        <div className="py-2 border-b border-slate-200">
          <div className={`${SECTION_LABEL_CLS} mb-1.5`} style={{ color: sizeAccent }}>Owner</div>
          <div
            onClick={() => setShowOwnerSearch(!showOwnerSearch)}
            className={`${INPUT_CLS} cursor-pointer flex justify-between items-center ${showOwnerSearch ? "bg-blue-50" : "bg-white"}`}
          >
            <span className="font-semibold">{editOwnerLabel || "Select owner..."}</span>
            <span className="text-[11px] text-slate-500">
              {showOwnerSearch ? "\u25b2" : "\u25bc"}
            </span>
          </div>
          {showOwnerSearch && (
            <div className="mt-1.5">
              <div className="relative">
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex">
                  <IconSearch size={14} colour="#6B7280" />
                </div>
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={ownerSearchQuery}
                  onChange={(e) => setOwnerSearchQuery(e.target.value)}
                  autoFocus
                  className={`${INPUT_CLS} pl-8 border-brand-blue`}
                />
              </div>
              {ownerSearchResults.length > 0 && (
                <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden">
                  {ownerSearchResults.map((candidate) => {
                    const fullName = candidate.fullName || `${candidate.name || ""} ${candidate.surname || ""}`.trim();
                    return (
                      <div
                        key={candidate.id}
                        onClick={() => {
                          setEditOwnerId(candidate.id);
                          setOwnerSearchQuery("");
                          setShowOwnerSearch(false);
                        }}
                        className="px-3 py-2 cursor-pointer border-b border-slate-200 transition-colors hover:bg-blue-50"
                      >
                        <div className="text-[13px] font-semibold text-slate-800">{fullName}</div>
                        {candidate.phone && (
                          <div className="text-xs text-slate-500">{candidate.phone}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {ownerSearchQuery.trim() && ownerSearchResults.length === 0 && (
                <div className="text-xs text-slate-500 mt-1.5 text-center">
                  No matching humans found
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="py-2 border-b border-slate-200">
          <div className={SECTION_LABEL_CLS} style={{ color: sizeAccent }}>Owner</div>
          <div className="flex items-baseline gap-2 mt-1">
            <div
              onClick={() => {
                if (ownerOpenValue) {
                  onClose();
                  onOpenHuman && onOpenHuman(ownerOpenValue);
                }
              }}
              className="text-[13px] font-semibold text-brand-teal"
              style={{ cursor: ownerOpenValue ? "pointer" : "default" }}
            >
              {titleCase(ownerLabel) || "\u2014"}
            </div>
            {owner?.phone && (
              <a
                href={waLink(owner.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-500 no-underline hover:text-brand-teal"
                onClick={(e) => e.stopPropagation()}
              >
                {owner.phone}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Groom Notes */}
      {isEditing ? (
        <div className="py-2 border-b border-slate-200">
          <div className={`${SECTION_LABEL_CLS} mb-1.5`} style={{ color: sizeAccent }}>
            Groom Notes
          </div>
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            className={`${INPUT_CLS} resize-y min-h-[60px]`}
          />
        </div>
      ) : (
        detailRow("Groom Notes", resolvedDog.groomNotes)
      )}

      {/* Alerts */}
      {isEditing ? (
        <div className="mt-4">
          <div
            className={`${SECTION_LABEL_CLS} mb-2.5 text-center`}
            style={{ color: sizeAccent }}
          >
            Alerts
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {ALERT_OPTIONS.map((opt) => {
              const active = editAlerts.includes(opt.label);
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    if (active)
                      setEditAlerts(
                        editAlerts.filter((a) => a !== opt.label),
                      );
                    else setEditAlerts([...editAlerts, opt.label]);
                  }}
                  className="px-3 py-1.5 rounded-2xl text-xs font-bold cursor-pointer transition-all"
                  style={{
                    background: active ? opt.color : "#FFFFFF",
                    color: active ? "#FFFFFF" : opt.color,
                    border: `2px solid ${opt.color}`,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setHasAllergy(!hasAllergy)}
              className="px-3 py-1.5 rounded-2xl text-xs font-bold cursor-pointer transition-all"
              style={{
                background: hasAllergy ? "#E8567F" : "#FFFFFF",
                color: hasAllergy ? "#FFFFFF" : "#E8567F",
                border: "2px solid #E8567F",
              }}
            >
              Allergy
            </button>
          </div>
          {hasAllergy && (
            <div className="mt-2.5 flex justify-center">
              <input
                type="text"
                placeholder="Allergic to..."
                value={allergyInput}
                onChange={(e) => setAllergyInput(e.target.value)}
                className={`${INPUT_CLS} text-center border-2 border-brand-coral`}
              />
            </div>
          )}
        </div>
      ) : (
        displayAlerts.length > 0 && (
          <>
            <div
              className={`${SECTION_LABEL_CLS} mt-4 mb-2`}
              style={{ color: sizeAccent }}
            >
              Alerts
            </div>
            <div className="flex flex-wrap gap-1.5">
              {displayAlerts.map((alert) => (
                <span
                  key={alert}
                  className="bg-brand-coral-light text-brand-coral px-3 py-1.5 rounded-lg text-xs font-bold"
                >
                  {alert}
                </span>
              ))}
            </div>
          </>
        )
      )}

      {/* Price */}
      {isEditing ? (
        <div className="py-2 border-b border-slate-200">
          <div className={`${SECTION_LABEL_CLS} mb-1.5`} style={{ color: sizeAccent }}>
            Price ({"\u00a3"})
          </div>
          <input
            type="number"
            min="0"
            step="1"
            value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)}
            placeholder="e.g. 42"
            className={`${INPUT_CLS} w-[120px]`}
          />
        </div>
      ) : (
        detailRow("Price", resolvedDog.customPrice != null ? `\u00a3${resolvedDog.customPrice}` : null)
      )}
    </div>
  );
}
