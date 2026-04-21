import { ALERT_OPTIONS } from "../../../constants/index.js";
import { IconSearch } from "../../icons/index.jsx";
import { titleCase, waLink, telLink } from "./helpers.js";
import { SectionCard, CardRow } from "../booking-detail/shared.jsx";

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
  /* ── Alerts (shown above cards, like BookingAlerts) ── */
  const alertsView = !isEditing && displayAlerts.length > 0 && (
    <div className="flex flex-wrap gap-1.5 justify-center mb-3">
      {displayAlerts.map((alert) => (
        <span
          key={alert}
          className="px-3 py-1.5 rounded-full text-xs font-bold text-white"
          style={{ background: "#C93D63" }}
        >
          {alert}
        </span>
      ))}
    </div>
  );

  const alertsEdit = isEditing && (
    <div className="mb-3">
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
                  setEditAlerts(editAlerts.filter((a) => a !== opt.label));
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
            background: hasAllergy ? "#E7546C" : "#FFFFFF",
            color: hasAllergy ? "#FFFFFF" : "#E7546C",
            border: "2px solid #E7546C",
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
  );

  /* ── Owner row with contact links ── */
  const ownerValue = (
    <span className="inline-flex items-baseline gap-2 flex-wrap justify-end">
      <span>{titleCase(ownerLabel) || "\u2014"}</span>
      {owner?.phone && (
        <>
          <a
            href={telLink(owner.phone)}
            className="text-[11px] text-slate-400 no-underline hover:text-brand-teal"
            onClick={(e) => e.stopPropagation()}
          >
            {owner.phone}
          </a>
          <a
            href={waLink(owner.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-bold text-green-600 no-underline hover:text-green-700"
            onClick={(e) => e.stopPropagation()}
            title="WhatsApp"
          >
            WA
          </a>
        </>
      )}
    </span>
  );

  return (
    <>
      {alertsView}
      {alertsEdit}

      {/* ── Card: Dog Details ── */}
      {isEditing ? (
        <SectionCard title="Dog Details">
          {/* Owner edit */}
          <div className="py-2.5 border-b border-slate-100">
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
                    className={`${INPUT_CLS} pl-8 border-brand-cyan`}
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

          {/* Groom Notes edit */}
          <div className="py-2.5 border-b border-slate-100">
            <div className={`${SECTION_LABEL_CLS} mb-1.5`} style={{ color: sizeAccent }}>
              Groom Notes
            </div>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className={`${INPUT_CLS} resize-y min-h-[60px]`}
            />
          </div>

          {/* Price edit */}
          <div className="py-2.5">
            <div className={`${SECTION_LABEL_CLS} mb-1.5`} style={{ color: sizeAccent }}>
              Custom Price ({"\u00a3"})
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
        </SectionCard>
      ) : (
        <SectionCard title="Dog Details">
          <CardRow
            label="Owner"
            value={ownerValue}
            onClick={ownerOpenValue ? () => {
              onClose();
              onOpenHuman && onOpenHuman(ownerOpenValue);
            } : undefined}
          />
          <CardRow
            label="Groom Notes"
            value={resolvedDog.groomNotes || "\u2014"}
          />
          <CardRow
            label="Custom Price"
            value={resolvedDog.customPrice != null ? `\u00a3${resolvedDog.customPrice}` : "\u2014"}
            last
          />
        </SectionCard>
      )}
    </>
  );
}
