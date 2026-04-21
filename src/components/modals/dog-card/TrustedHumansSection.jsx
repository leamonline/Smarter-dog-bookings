import { IconSearch } from "../../icons/index.jsx";
import { titleCase } from "./helpers.js";
import { SectionCard, CardRow } from "../booking-detail/shared.jsx";

const INPUT_CLS = "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border";

export function TrustedHumansSection({
  isEditing,
  sizeAccent,
  trustedContacts,
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
  newTrustedRelationship,
  setNewTrustedRelationship,
  handleAddNewTrusted,
  handleUpdateTrustedRelationship,
  getHumanByIdOrName,
}) {
  const contacts = trustedContacts || [];

  return (
    <SectionCard title="Trusted Humans">
      {contacts.length > 0 ? (
        contacts.map((contact, i) => {
          const trustedHuman = getHumanByIdOrName(humans, contact.id) || getHumanByIdOrName(humans, contact.fullName);
          const trustedLabel =
            trustedHuman?.fullName ||
            contact.fullName ||
            `${trustedHuman?.name || ""} ${trustedHuman?.surname || ""}`.trim() ||
            contact.id;
          const rowKey = contact.id || contact.fullName || trustedLabel;

          if (isEditing && onUpdateHuman) {
            return (
              <div
                key={rowKey}
                className={`py-2.5 ${
                  i === contacts.length - 1 && !showTrustedSearch ? "" : "border-b border-slate-100"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-slate-800 flex-1 min-w-0 truncate">
                    {titleCase(trustedLabel)}
                  </span>
                  <button
                    onClick={() => handleRemoveTrusted(contact.id || contact.fullName)}
                    className="bg-transparent border-none text-brand-coral text-base font-bold cursor-pointer px-1 leading-none font-inherit shrink-0"
                    title="Remove trusted human"
                  >
                    {"\u00D7"}
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Relationship (e.g. husband, dog walker)"
                  defaultValue={contact.relationship || ""}
                  onBlur={(e) => {
                    const nextValue = e.target.value.trim();
                    if (nextValue === (contact.relationship || "")) return;
                    handleUpdateTrustedRelationship &&
                      handleUpdateTrustedRelationship(contact.id || contact.fullName, nextValue);
                  }}
                  className={`${INPUT_CLS} mt-1.5 text-[12px]`}
                  aria-label={`Relationship for ${titleCase(trustedLabel)}`}
                />
              </div>
            );
          }

          return (
            <CardRow
              key={rowKey}
              label={titleCase(trustedLabel)}
              value={contact.relationship || ""}
              onClick={() => {
                onClose();
                onOpenHuman && onOpenHuman(trustedHuman?.id || contact.id);
              }}
              last={i === contacts.length - 1}
            />
          );
        })
      ) : (
        <div className="text-[13px] text-slate-400 italic py-2">
          None listed
        </div>
      )}

      {isEditing && onUpdateHuman && (
        <>
          <button
            onClick={() => setShowTrustedSearch(!showTrustedSearch)}
            className="w-full mt-2 py-2 rounded-lg border-[1.5px] border-dashed text-[13px] font-bold cursor-pointer font-inherit transition-all"
            style={{
              borderColor: sizeAccent,
              background: showTrustedSearch ? sizeAccent : "#FFFFFF",
              color: showTrustedSearch ? "#FFFFFF" : sizeAccent,
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
                  className={`${INPUT_CLS} pl-8`}
                  style={{ borderColor: sizeAccent }}
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
                        className="px-3 py-2 cursor-pointer border-b border-slate-200 transition-colors hover:bg-slate-50"
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
                  className="w-full mt-2 py-2 rounded-lg border-[1.5px] text-xs font-bold cursor-pointer font-inherit transition-all bg-white"
                  style={{ borderColor: sizeAccent, color: sizeAccent }}
                >
                  + Add new human
                </button>
              )}
              {showNewTrustedForm && (
                <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[11px] font-extrabold uppercase tracking-wide mb-2" style={{ color: sizeAccent }}>New Trusted Human</div>
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
                  <input
                    type="text"
                    placeholder="Relationship (e.g. husband, dog walker)"
                    value={newTrustedRelationship || ""}
                    onChange={(e) => setNewTrustedRelationship && setNewTrustedRelationship(e.target.value)}
                    className={`${INPUT_CLS} w-full mb-2`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddNewTrusted}
                      disabled={!newTrustedName.trim() || !newTrustedSurname.trim() || !newTrustedPhone.trim()}
                      className="flex-1 py-2 rounded-lg border-none text-white text-xs font-bold cursor-pointer font-inherit disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
                      style={{ background: sizeAccent }}
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowNewTrustedForm(false);
                        setNewTrustedName("");
                        setNewTrustedSurname("");
                        setNewTrustedPhone("");
                        setNewTrustedRelationship && setNewTrustedRelationship("");
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
    </SectionCard>
  );
}
