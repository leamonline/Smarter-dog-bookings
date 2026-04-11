import { IconSearch } from "../../icons/index.jsx";
import { titleCase } from "./helpers.js";

const SECTION_LABEL_CLS = "font-extrabold text-xs uppercase tracking-wide";
const INPUT_CLS = "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border";

export function TrustedHumansSection({
  isEditing,
  sizeAccent,
  trustedIds,
  humans,
  owner,
  onClose,
  onOpenHuman,
  onUpdateHuman,
  onAddHuman,
  // Search state
  showTrustedSearch,
  setShowTrustedSearch,
  trustedSearchQuery,
  setTrustedSearchQuery,
  trustedSearchResults,
  handleAddTrusted,
  handleRemoveTrusted,
  // New trusted form state
  showNewTrustedForm,
  setShowNewTrustedForm,
  newTrustedName,
  setNewTrustedName,
  newTrustedSurname,
  setNewTrustedSurname,
  newTrustedPhone,
  setNewTrustedPhone,
  handleAddNewTrusted,
  getHumanByIdOrName,
}) {
  return (
    <div className="px-6 mt-3">
      <div className={`${SECTION_LABEL_CLS} mb-2`} style={{ color: sizeAccent }}>
        Trusted Humans
      </div>
      {trustedIds.length > 0 ? (
        trustedIds.map((trustedId) => {
          const trustedHuman = getHumanByIdOrName(humans, trustedId);
          const trustedLabel =
            trustedHuman?.fullName ||
            `${trustedHuman?.name || ""} ${trustedHuman?.surname || ""}`.trim() ||
            trustedId;
          return (
            <div
              key={trustedId}
              className="py-2 border-b border-slate-200 flex items-center justify-between"
            >
              <span
                onClick={() => {
                  onClose();
                  onOpenHuman && onOpenHuman(trustedHuman?.id || trustedId);
                }}
                className="text-[13px] font-semibold text-brand-teal cursor-pointer"
              >
                {titleCase(trustedLabel)}
              </span>
              {isEditing && onUpdateHuman && (
                <button
                  onClick={() => handleRemoveTrusted(trustedId)}
                  className="bg-transparent border-none text-brand-coral text-base font-bold cursor-pointer px-1 leading-none font-inherit"
                  title="Remove trusted human"
                >
                  ×
                </button>
              )}
            </div>
          );
        })
      ) : (
        <div className="text-[13px] text-slate-500 italic">
          None listed
        </div>
      )}

      {isEditing && onUpdateHuman && (
        <>
          <button
            onClick={() => setShowTrustedSearch(!showTrustedSearch)}
            className="w-full mt-2.5 py-2 rounded-[10px] border-[1.5px] border-dashed border-brand-teal text-[13px] font-bold cursor-pointer font-inherit transition-all"
            style={{
              background: showTrustedSearch ? "#2D8B7A" : "#E6F5F2",
              color: showTrustedSearch ? "#FFFFFF" : "#2D8B7A",
            }}
          >
            {showTrustedSearch ? "Cancel" : "+ Add a trusted human"}
          </button>

          {showTrustedSearch && (
            <div className="mt-2">
              <div className="relative">
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex">
                  <IconSearch size={14} colour="#6B7280" />
                </div>
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={trustedSearchQuery}
                  onChange={(e) => setTrustedSearchQuery(e.target.value)}
                  autoFocus
                  className={`${INPUT_CLS} pl-8 border-brand-teal`}
                />
              </div>
              {trustedSearchResults.length > 0 && (
                <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden">
                  {trustedSearchResults.map((candidate) => {
                    const fullName = candidate.fullName || `${candidate.name || ""} ${candidate.surname || ""}`.trim();
                    return (
                      <div
                        key={candidate.id}
                        onClick={() => handleAddTrusted(candidate.id)}
                        className="px-3 py-2 cursor-pointer border-b border-slate-200 transition-colors hover:bg-[#E6F5F2]"
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
              {trustedSearchQuery.trim() && trustedSearchResults.length === 0 && !showNewTrustedForm && (
                <div className="text-xs text-slate-500 mt-1.5 text-center">
                  No matching humans found
                </div>
              )}
              {onAddHuman && !showNewTrustedForm && (
                <button
                  onClick={() => setShowNewTrustedForm(true)}
                  className="w-full mt-2 py-2 rounded-lg border-[1.5px] border-brand-teal bg-white text-brand-teal text-xs font-bold cursor-pointer font-inherit transition-all"
                >
                  + Add new human
                </button>
              )}
              {showNewTrustedForm && (
                <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide mb-2">New Trusted Human</div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="First name"
                      value={newTrustedName}
                      onChange={(e) => setNewTrustedName(e.target.value)}
                      autoFocus
                      className={`${INPUT_CLS} flex-1`}
                    />
                    <input
                      type="text"
                      placeholder="Surname"
                      value={newTrustedSurname}
                      onChange={(e) => setNewTrustedSurname(e.target.value)}
                      className={`${INPUT_CLS} flex-1`}
                    />
                  </div>
                  <input
                    type="tel"
                    placeholder="Phone number"
                    value={newTrustedPhone}
                    onChange={(e) => setNewTrustedPhone(e.target.value)}
                    className={`${INPUT_CLS} w-full mb-2`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddNewTrusted}
                      disabled={!newTrustedName.trim() || !newTrustedSurname.trim() || !newTrustedPhone.trim()}
                      className="flex-1 py-2 rounded-lg border-none bg-brand-teal text-white text-xs font-bold cursor-pointer font-inherit disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowNewTrustedForm(false);
                        setNewTrustedName("");
                        setNewTrustedSurname("");
                        setNewTrustedPhone("");
                      }}
                      className="flex-1 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-bold cursor-pointer font-inherit"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
