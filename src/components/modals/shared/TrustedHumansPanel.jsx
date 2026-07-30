import { useEffect, useMemo, useState } from "react";
import { Users, Plus, X } from "lucide-react";
import { PanelShell } from "../shell/PanelShell.jsx";
import { IconSearch } from "../../icons/index.jsx";
import { titleCase } from "../../../utils/text";
import { getHumanByIdOrName } from "../../../engine/bookingRules";
import { validateContactPhone } from "../dog-card/helpers.js";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { logger } from "../../../lib/logger";
import { ConfirmDialog } from "../../shared/ConfirmDialog.jsx";

const EMPTY_TRUSTED_CONTACTS = [];

// Shared trusted-humans editor for appointment, dog and human cards.
// Trusted Humans = informational (sky/blue accent on the dashboard
// palette). Each row carries the trusted human's name in navy, an
// inline relationship input, and a remove icon in coral (destructive).
// The "+ Add a trusted Human" entry uses a teal-outline ghost style
// to match every other dashed-edge ghost button across the dashboard.

function TrustedRow({
  contact,
  trustedHuman,
  onOpenHuman,
  onClose,
  onUpdateRelationship,
  onRemove,
}) {
  const trustedLabel =
    trustedHuman?.fullName ||
    contact.fullName ||
    `${trustedHuman?.name || ""} ${trustedHuman?.surname || ""}`.trim() ||
    contact.id ||
    "Unnamed";

  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            onClose?.();
            onOpenHuman?.(trustedHuman?.id || contact.id);
          }}
          className="text-sm font-semibold text-brand-purple cursor-pointer bg-transparent border-none p-0 text-left flex-1 min-w-0 truncate font-inherit hover:text-brand-teal-text transition-colors"
        >
          {titleCase(trustedLabel)}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${titleCase(trustedLabel)} as trusted human`}
            title="Remove"
            className="w-6 h-6 max-sm:w-11 max-sm:h-11 rounded-md flex items-center justify-center bg-transparent border-none cursor-pointer text-slate-300 hover:text-brand-coral hover:bg-brand-coral-light/60 transition-colors"
          >
            <X size={12} strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
      </div>
      <input
        type="text"
        placeholder="Relationship (e.g. husband, dog walker)"
        defaultValue={contact.relationship || ""}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (!onUpdateRelationship || next === (contact.relationship || "")) {
            return;
          }
          onUpdateRelationship(next);
        }}
        disabled={!onUpdateRelationship}
        className="w-full mt-1 px-2 py-1 rounded-md border border-slate-200 text-xs outline-none font-inherit text-brand-purple focus:border-brand-teal transition-colors"
        aria-label={`Relationship for ${titleCase(trustedLabel)}`}
      />
    </div>
  );
}

export function TrustedHumansPanel({
  human,
  humans,
  onClose,
  onOpenHuman,
  onUpdateHuman,
  onAddHuman,
  findHumanByFullName,
  searchHumansByTerm,
  className = "",
  missingHumanMessage = "No owner linked",
}) {
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSurname, setNewSurname] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRelationship, setNewRelationship] = useState("");
  const [trustedToRemove, setTrustedToRemove] = useState(null);

  const myId = human?.id || null;
  const contacts = human?.trustedContacts || EMPTY_TRUSTED_CONTACTS;
  const canManage = Boolean(myId && onUpdateHuman);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || !searchHumansByTerm) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      searchHumansByTerm(q).catch((err) => {
        logger.error("trusted-human server search failed:", err);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery, searchHumansByTerm]);

  const searchResults = useMemo(() => {
    if (!human || !searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    const linked = new Set(
      contacts.map((c) => c.id || c.fullName).filter(Boolean),
    );
    return Object.values(humans || {})
      .filter((c) => c.id !== human.id)
      .filter((c) => {
        const full = c.fullName || `${c.name || ""} ${c.surname || ""}`.trim();
        return !linked.has(c.id) && !linked.has(full);
      })
      .filter((c) => {
        const full = c.fullName || `${c.name || ""} ${c.surname || ""}`.trim();
        return `${full} ${c.phone || ""}`.toLowerCase().includes(q);
      })
      .slice(0, 5);
  }, [searchQuery, humans, human, contacts]);

  const handleAddTrusted = async (selectedHumanId) => {
    if (!canManage) return;
    const current = contacts;
    const saved = await onUpdateHuman(myId, {
      trustedContacts: [...current, { id: selectedHumanId, relationship: "" }],
    });
    if (!saved) {
      toast.show("Couldn't add trusted human — please try again.", "error");
      return;
    }

    setSearchQuery("");
    setShowAdd(false);
    toast.show("Trusted human linked", "success");
  };

  const handleRemoveTrusted = (target) => {
    setTrustedToRemove(target);
  };

  const confirmRemoveTrusted = async () => {
    const target = trustedToRemove;
    setTrustedToRemove(null);
    if (!target || !human || !canManage) return;

    const current = contacts;
    const targetKey = target.id || target.fullName;
    const next = current.filter(
      (c) => (c.id || c.fullName) !== targetKey,
    );
    const saved = await onUpdateHuman(myId, { trustedContacts: next });
    if (!saved) {
      toast.show("Couldn't remove trusted human — please try again.", "error");
      return;
    }

    toast.show("Trusted human removed", "success");
  };

  const linkAsTrusted = async (trustedHuman, successMessage, relationship) => {
    if (!canManage) return;
    const current = contacts;
    const saved = await onUpdateHuman(myId, {
      trustedContacts: [
        ...current,
        { id: trustedHuman.id, relationship: relationship || "" },
      ],
    });
    if (!saved) {
      toast.show("Couldn't add trusted human — please try again.", "error");
      return;
    }
    setShowNewForm(false);
    setNewName("");
    setNewSurname("");
    setNewPhone("");
    setNewRelationship("");
    setShowAdd(false);
    toast.show(successMessage, "success");
  };

  const handleAddNewTrusted = async () => {
    if (!newName.trim() || !onAddHuman) return;
    // Phone is optional here; when given, a UK mobile is normalised to E.164 and
    // a mobile-shaped number with the wrong digit count is rejected (the
    // "131026 undeliverable" class) rather than stored.
    const { value: normalisedPhone, error: phoneError } = validateContactPhone(newPhone);
    if (phoneError) {
      toast.show(phoneError, "error");
      return;
    }
    const relationship = (newRelationship || "").trim();
    try {
      // Reuse an existing customer with this name rather than creating a
      // duplicate. The humans directory no longer enforces a unique
      // (name, surname), so onAddHuman would otherwise insert a second
      // record; and the existing row may be paginated out of the local
      // map, so the search above never offered it. A direct lookup links
      // the real person instead.
      const existing = findHumanByFullName
        ? await findHumanByFullName(newName.trim(), newSurname.trim())
        : null;
      if (existing) {
        await linkAsTrusted(
          existing,
          `Linked existing ${existing.fullName} as trusted human`,
          relationship,
        );
        return;
      }
      const result = await onAddHuman({
        name: newName.trim(),
        surname: newSurname.trim(),
        phone: normalisedPhone,
      });
      const newId = result?.id || result?.[0]?.id;
      if (newId) {
        await linkAsTrusted(result, "Trusted human added", relationship);
      }
    } catch (err) {
      logger.error("Failed to create new trusted human:", err);
      toast.show(err?.message || "Could not add trusted human.", "error");
    }
  };

  const hasTrusted = contacts.length > 0;

  return (
    <>
      <PanelShell
        eyebrow="Trusted humans"
        icon={Users}
        accent="sky"
        className={className}
      >
        {!human ? (
          <div className="text-sm text-slate-400 italic">
            {missingHumanMessage}
          </div>
        ) : hasTrusted ? (
          <>
            <div className="divide-y divide-slate-100">
              {contacts.map((contact, index) => {
                const trustedHuman =
                  getHumanByIdOrName(humans, contact.id) ||
                  getHumanByIdOrName(humans, contact.fullName);
                const rowKey =
                  contact.id ||
                  contact.fullName ||
                  trustedHuman?.id ||
                  `trusted-${index}`;
                return (
                  <TrustedRow
                    key={rowKey}
                    contact={contact}
                    trustedHuman={trustedHuman}
                    onOpenHuman={onOpenHuman}
                    onClose={onClose}
                    onUpdateRelationship={
                      canManage
                        ? (rel) => {
                            const next = contacts.map((currentContact) =>
                              (currentContact.id || currentContact.fullName) ===
                              (contact.id || contact.fullName)
                                ? { ...currentContact, relationship: rel }
                                : currentContact,
                            );
                            onUpdateHuman(myId, { trustedContacts: next });
                          }
                        : undefined
                    }
                    onRemove={
                      canManage
                        ? () => handleRemoveTrusted(contact)
                        : undefined
                    }
                  />
                );
              })}
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowAdd((v) => !v)}
                className={[
                  "w-full mt-3 py-2 rounded-control border-[1.5px] border-dashed text-xs font-bold cursor-pointer font-inherit transition-colors inline-flex items-center justify-center gap-1.5",
                  showAdd
                    ? "border-brand-teal bg-brand-teal text-white"
                    : "border-brand-teal/60 bg-transparent text-brand-teal-text hover:bg-[#E6F5F2]",
                ].join(" ")}
              >
                {showAdd ? (
                  "Cancel"
                ) : (
                  <>
                    <Plus size={12} strokeWidth={2.6} aria-hidden="true" /> Add a trusted Human
                  </>
                )}
              </button>
            )}
          </>
        ) : (
          <div className="text-sm text-slate-500 flex items-center flex-wrap gap-1.5">
            <span className="text-slate-400 italic">No trusted humans</span>
            {canManage && (
              <span aria-hidden="true" className="text-slate-300">·</span>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => setShowAdd((v) => !v)}
                className="text-brand-teal-text font-semibold underline cursor-pointer bg-transparent border-none p-0 font-inherit hover:text-brand-teal transition-colors"
              >
                {showAdd ? "Cancel" : "Add"}
              </button>
            )}
          </div>
        )}

        {canManage && showAdd && (
          <div className="mt-3">
            <div className="relative">
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex pointer-events-none">
                <IconSearch size={14} colour="#6B7280" />
              </div>
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full py-2 px-2.5 pl-8 rounded-control border-[1.5px] border-brand-teal/60 text-sm font-inherit box-border outline-none text-brand-purple focus:border-brand-teal transition-colors"
              />
            </div>

            {searchResults.length > 0 && (
              <div className="mt-1.5 border border-slate-200 rounded-lg overflow-hidden">
                {searchResults.map((c) => {
                  const full =
                    c.fullName || `${c.name || ""} ${c.surname || ""}`.trim();
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => handleAddTrusted(c.id)}
                      className="w-full text-left bg-transparent px-3 py-2 cursor-pointer border-x-0 border-t-0 border-b border-slate-100 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 font-inherit"
                    >
                      <div className="text-sm font-semibold text-brand-purple">
                        {titleCase(full)}
                      </div>
                      <div className="text-xs text-slate-500">{c.phone}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {searchQuery.trim() && searchResults.length === 0 && (
              <div className="text-xs text-slate-500 mt-2 text-center">
                No matching humans found
              </div>
            )}

            {onAddHuman && !showNewForm && (
              <button
                type="button"
                onClick={() => setShowNewForm(true)}
                className="w-full mt-2 py-2 rounded-control border-[1.5px] border-dashed border-brand-teal/60 bg-transparent text-brand-teal-text text-xs font-bold cursor-pointer font-inherit transition-colors hover:bg-[#E6F5F2]"
              >
                + Create new human
              </button>
            )}

            {showNewForm && (
              <div className="mt-2 p-3 bg-slate-50 rounded-control border border-slate-200">
                <div className="text-[10px] font-extrabold text-brand-teal-text uppercase tracking-wide mb-2">
                  New trusted human
                </div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="First name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                    className="flex-1 py-1.5 px-2.5 rounded-control border-[1.5px] border-slate-200 text-xs font-inherit outline-none text-brand-purple transition-colors focus:border-brand-teal"
                  />
                  <input
                    type="text"
                    placeholder="Surname"
                    value={newSurname}
                    onChange={(e) => setNewSurname(e.target.value)}
                    className="flex-1 py-1.5 px-2.5 rounded-control border-[1.5px] border-slate-200 text-xs font-inherit outline-none text-brand-purple transition-colors focus:border-brand-teal"
                  />
                </div>
                <input
                  type="tel"
                  placeholder="Phone number"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full py-1.5 px-2.5 rounded-control border-[1.5px] border-slate-200 text-xs font-inherit outline-none box-border text-brand-purple mb-2 transition-colors focus:border-brand-teal"
                />
                <input
                  type="text"
                  placeholder="Relationship (e.g. husband, dog walker)"
                  value={newRelationship}
                  onChange={(e) => setNewRelationship(e.target.value)}
                  className="w-full py-1.5 px-2.5 rounded-control border-[1.5px] border-slate-200 text-xs font-inherit outline-none box-border text-brand-purple mb-2 transition-colors focus:border-brand-teal"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddNewTrusted}
                    disabled={!newName.trim()}
                    className="flex-1 py-2 rounded-control border-none text-xs font-bold cursor-pointer font-inherit transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed bg-brand-teal text-white hover:bg-brand-teal-dark"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewForm(false);
                      setNewName("");
                      setNewSurname("");
                      setNewPhone("");
                      setNewRelationship("");
                    }}
                    className="flex-1 py-2 rounded-control border-[1.5px] border-slate-200 text-xs font-bold cursor-pointer font-inherit bg-white text-slate-500 transition-colors hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </PanelShell>
      {trustedToRemove && (
        <ConfirmDialog
          title="Unlink trusted human?"
          message="They won't be linked as a trusted human any more."
          confirmLabel="Remove"
          variant="danger"
          onConfirm={confirmRemoveTrusted}
          onCancel={() => setTrustedToRemove(null)}
        />
      )}
    </>
  );
}
