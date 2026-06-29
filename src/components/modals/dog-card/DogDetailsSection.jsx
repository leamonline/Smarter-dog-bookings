import { Dog as DogIcon } from "lucide-react";
import { ALERT_OPTIONS } from "../../../constants/index";
import { IconSearch } from "../../icons/index.jsx";
import { titleCase, waLink, telLink } from "./helpers.js";
import { CardRow } from "../booking-detail/shared.jsx";
import { PanelShell } from "../shell/index.js";
import { alertTint } from "../shell/alertTints.js";

const SECTION_LABEL_CLS = "font-extrabold text-xs uppercase tracking-wide text-slate-400";
const INPUT_CLS = "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border";

// "YYYY-MM-DD" → "Mon 1 Jun 2026" (noon-anchored to dodge TZ rollover).
function formatGroomDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function DogDetailsSection({
  isEditing,
  resolvedDog,
  // Owner display (view mode)
  ownerLabel,
  ownerOpenValue,
  owner,
  hasLinkedOwner,
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
  // Optional profile fields (staff-only)
  editSex,
  setEditSex,
  editColour,
  setEditColour,
  editNeutered,
  setEditNeutered,
  editIsPregnant,
  setEditIsPregnant,
  editMicrochip,
  setEditMicrochip,
  editVet,
  setEditVet,
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
  // Size (staff-only — modal is only mounted in the staff app)
  editSize,
  setEditSize,
  sizeAutoSet,
  sizeOverridden,
}) {
  /* ── Alerts (shown above cards, like BookingAlerts) ── */
  const alertsView = !isEditing && displayAlerts.length > 0 && (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {displayAlerts.map((alert) => (
        <span
          key={alert}
          className={`px-3 py-1.5 rounded-full text-xs font-bold ${alertTint(alert)}`}
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
            background: hasAllergy ? "var(--color-brand-coral)" : "#FFFFFF",
            color: hasAllergy ? "#FFFFFF" : "var(--color-brand-coral)",
            border: "2px solid var(--color-brand-coral)",
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
  // Three states matter:
  //   1. No owner linked (humanId null in DB): "No owner assigned"
  //   2. Owner linked but row not in the map (deleted human, or the
  //      hydration race that motivated the useHumans merge fix): the
  //      formatOwnerLabel helper returns "Unknown owner" - show it
  //      italic so it reads as a placeholder, not a real name.
  //   3. Owner resolved: name + phone WA links, row is clickable.
  const ownerNameNode = !hasLinkedOwner ? (
    <span className="italic text-slate-400">No owner assigned</span>
  ) : !owner ? (
    <span className="italic text-slate-400">{ownerLabel || "Unknown owner"}</span>
  ) : (
    <span>{titleCase(ownerLabel)}</span>
  );

  const ownerValue = (
    <span className="inline-flex items-baseline gap-2 flex-wrap justify-end">
      {ownerNameNode}
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
        <PanelShell eyebrow="Dog details" icon={DogIcon} accent="slate" className="mb-3">
          {/* Owner edit */}
          <div className="py-2.5 border-b border-slate-100">
            <div className={`${SECTION_LABEL_CLS} mb-1.5`}>Owner</div>
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

          {/* Size edit (staff-only — controls grooming workflow + pricing) */}
          <div className="py-2.5 border-b border-slate-100">
            <div className={`${SECTION_LABEL_CLS} mb-1.5 flex items-center gap-1.5`}>
              <span>Size</span>
              {sizeAutoSet && !sizeOverridden && (
                <span className="font-medium normal-case tracking-normal text-brand-green text-[11px]">
                  auto
                </span>
              )}
            </div>
            <select
              value={editSize}
              onChange={(e) => setEditSize(e.target.value)}
              aria-label="Dog size"
              className={`${INPUT_CLS} cursor-pointer w-[140px]`}
            >
              {!editSize && <option value="">Select size</option>}
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>

          {/* Sex & Neutered edit */}
          <div className="py-2.5 border-b border-slate-100 grid grid-cols-2 gap-2.5">
            <div>
              <div className={`${SECTION_LABEL_CLS} mb-1.5`}>Sex</div>
              <select
                value={editSex}
                onChange={(e) => setEditSex(e.target.value)}
                aria-label="Dog sex"
                className={`${INPUT_CLS} cursor-pointer`}
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <div className={`${SECTION_LABEL_CLS} mb-1.5`}>Neutered</div>
              <select
                value={editNeutered}
                onChange={(e) => setEditNeutered(e.target.value)}
                aria-label="Neutered"
                className={`${INPUT_CLS} cursor-pointer`}
              >
                <option value="">Select</option>
                <option value="yes">Neutered</option>
                <option value="no">Not neutered</option>
              </select>
            </div>
          </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editIsPregnant}
                onChange={(e) => setEditIsPregnant(e.target.checked)}
                aria-label="Pregnant"
              />
              <span className={SECTION_LABEL_CLS}>Pregnant</span>
            </label>

          {/* Colour edit */}
          <div className="py-2.5 border-b border-slate-100">
            <div className={`${SECTION_LABEL_CLS} mb-1.5`}>
              Colour / Markings
            </div>
            <input
              type="text"
              value={editColour}
              onChange={(e) => setEditColour(e.target.value)}
              placeholder="Black &amp; tan"
              className={INPUT_CLS}
            />
          </div>

          {/* Microchip edit */}
          <div className="py-2.5 border-b border-slate-100">
            <div className={`${SECTION_LABEL_CLS} mb-1.5`}>
              Microchip
            </div>
            <input
              type="text"
              value={editMicrochip}
              onChange={(e) => setEditMicrochip(e.target.value)}
              placeholder="985..."
              className={INPUT_CLS}
            />
          </div>

          {/* Vet edit */}
          <div className="py-2.5 border-b border-slate-100">
            <div className={`${SECTION_LABEL_CLS} mb-1.5`}>
              Vet
            </div>
            <input
              type="text"
              value={editVet}
              onChange={(e) => setEditVet(e.target.value)}
              placeholder="Vet practice"
              className={INPUT_CLS}
            />
          </div>

          {/* Groom Notes edit */}
          <div className="py-2.5 border-b border-slate-100">
            <div className={`${SECTION_LABEL_CLS} mb-1.5`}>
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
            <div className={`${SECTION_LABEL_CLS} mb-1.5`}>
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
        </PanelShell>
      ) : (
        <PanelShell eyebrow="Dog details" icon={DogIcon} accent="slate" className="mb-3">
          <CardRow
            label="Owner"
            value={ownerValue}
            onClick={ownerOpenValue ? () => {
              onClose();
              onOpenHuman?.(ownerOpenValue);
            } : undefined}
          />
          <CardRow
            label="Sex"
            value={resolvedDog.sex ? titleCase(resolvedDog.sex) : "\u2014"}
          />
          <CardRow
            label="Colour / Markings"
            value={resolvedDog.colour || "\u2014"}
          />
          <CardRow
            label="Neutered"
            value={resolvedDog.neutered === true ? "Neutered" : resolvedDog.neutered === false ? "Not neutered" : "\u2014"}
          />
          <CardRow
            label="Microchip"
            value={resolvedDog.microchip || "\u2014"}
          />
          <CardRow
            label="Vet"
            value={resolvedDog.vet || "\u2014"}
          />
          <CardRow
            label="Groom Notes"
            value={resolvedDog.groomNotes || "\u2014"}
          />
          <CardRow
            label="Last groomed"
            value={resolvedDog.lastGroomedDate ? formatGroomDate(resolvedDog.lastGroomedDate) : "Never"}
          />
          <CardRow
            label="Custom Price"
            value={resolvedDog.customPrice != null ? `\u00a3${resolvedDog.customPrice}` : "\u2014"}
            last
          />
        </PanelShell>
      )}
    </>
  );
}
