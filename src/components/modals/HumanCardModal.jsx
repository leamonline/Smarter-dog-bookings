import { useState, useMemo, useEffect } from "react";
import { SIZE_THEME, getSizeForBreed } from "../../constants/index.js";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { IconSearch, IconEdit, IconTick } from "../icons/index.jsx";
import {
  getDogByIdOrName,
  getHumanByIdOrName,
} from "../../engine/bookingRules.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { titleCase } from "../../utils/text.js";
import { waLink, telLink, normalisePhoneDigits } from "./dog-card/helpers.js";
import { HumanBookingHistory } from "./human-card/index.js";

export function HumanCardModal({
  humanId,
  onClose,
  onOpenHuman,
  onOpenDog,
  humans,
  dogs,
  onUpdateHuman,
  onAddHuman,
  onDeleteHuman,
  bookingsByDate,
  fetchHumanById,
  findHumanByFullName,
  searchHumansByTerm,
}) {
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState(false);

  // If the requested human isn't in the local map (e.g. their row
  // sits past the initial PAGE_SIZE pagination boundary), fetch
  // them on demand so the card doesn't fall back to showing the
  // raw UUID. Re-fires whenever the lookup key changes.
  useEffect(() => {
    if (!humanId || !fetchHumanById) return;
    if (humans?.[humanId]) return;
    fetchHumanById(humanId);
  }, [humanId, humans, fetchHumanById]);

  const human = getHumanByIdOrName(humans, humanId) || {
    id: humanId,
    fullName: "",
    name: "",
    surname: "",
    phone: "",
    sms: false,
    whatsapp: false,
    email: "",
    fb: "",
    insta: "",
    tiktok: "",
    address: "",
    notes: "",
    trustedIds: [],
    trustedContacts: [],
    historyFlag: "",
  };

  const humanFullName =
    human.fullName || `${human.name || ""} ${human.surname || ""}`.trim();

  const humanDogs = useMemo(() => {
    return Object.values(dogs || {})
      .filter((dog) => {
        const dogOwnerId = dog._humanId || null;
        const dogOwnerName = dog.humanId || "";
        return dogOwnerId === human.id || dogOwnerName === humanFullName;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dogs, human.id, humanFullName]);

  // Dogs this human is trusted to drop off / pick up (owned by their trusted humans)
  const trustedDogs = useMemo(() => {
    const trustedIds = human.trustedIds || [];
    if (trustedIds.length === 0) return [];

    const trustedSet = new Set(trustedIds);
    return Object.values(dogs || {})
      .filter((dog) => {
        const ownerId = dog._humanId || null;
        const ownerName = dog.humanId || "";
        // Must belong to a trusted human, not to this human
        if (ownerId === human.id || ownerName === humanFullName) return false;
        return trustedSet.has(ownerId) || trustedSet.has(ownerName);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dogs, human.id, humanFullName, human.trustedIds]);

  const [showTrustedSearch, setShowTrustedSearch] = useState(false);
  const [trustedSearchQuery, setTrustedSearchQuery] = useState("");
  const [showNewTrustedForm, setShowNewTrustedForm] = useState(false);
  const [newTrustedName, setNewTrustedName] = useState("");
  const [newTrustedSurname, setNewTrustedSurname] = useState("");
  const [newTrustedPhone, setNewTrustedPhone] = useState("");
  const [newTrustedRelationship, setNewTrustedRelationship] = useState("");

  // --- Edit state ---
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(human.name || "");
  const [editSurname, setEditSurname] = useState(human.surname || "");
  const [editPhone, setEditPhone] = useState(human.phone || "");
  const [editEmail, setEditEmail] = useState(human.email || "");
  const [editAddress, setEditAddress] = useState(human.address || "");
  const [editFb, setEditFb] = useState(human.fb || "");
  const [editInsta, setEditInsta] = useState(human.insta || "");
  const [editTiktok, setEditTiktok] = useState(human.tiktok || "");
  const [editNotes, setEditNotes] = useState(human.notes || "");
  const [editSms, setEditSms] = useState(!!human.sms);
  const [editWhatsapp, setEditWhatsapp] = useState(!!human.whatsapp);
  const [editHistoryFlag, setEditHistoryFlag] = useState(human.historyFlag || "");

  useEffect(() => {
    if (!isEditing) {
      setEditName(human.name || "");
      setEditSurname(human.surname || "");
      setEditPhone(human.phone || "");
      setEditEmail(human.email || "");
      setEditAddress(human.address || "");
      setEditFb(human.fb || "");
      setEditInsta(human.insta || "");
      setEditTiktok(human.tiktok || "");
      setEditNotes(human.notes || "");
      setEditSms(!!human.sms);
      setEditWhatsapp(!!human.whatsapp);
      setEditHistoryFlag(human.historyFlag || "");
    }
  }, [human.id]);  

  const handleSaveHuman = async () => {
    // Phone validation: a non-empty phone must reduce to at least 10
    // digits, otherwise we'd persist a value that breaks wa.me/tel: links
    // and the reminder pipeline. Empty phones are allowed (the customer
    // may not have shared one yet).
    const trimmedPhone = editPhone.trim();
    if (trimmedPhone && normalisePhoneDigits(trimmedPhone).length < 10) {
      toast.show("Please enter a valid phone number (at least 10 digits).", "error");
      return;
    }
    const updates = {
      name: editName.trim(),
      surname: editSurname.trim(),
      fullName: `${editName.trim()} ${editSurname.trim()}`.trim(),
      phone: trimmedPhone,
      email: editEmail.trim(),
      address: editAddress.trim(),
      fb: editFb.trim(),
      insta: editInsta.trim(),
      tiktok: editTiktok.trim(),
      notes: editNotes.trim(),
      sms: editSms,
      whatsapp: editWhatsapp,
      historyFlag: editHistoryFlag.trim(),
    };
    await onUpdateHuman(human.id || humanId, updates);
    setIsEditing(false);
    toast.show("Profile saved", "success");
  };

  const handleCancelEdit = () => {
    setEditName(human.name || "");
    setEditSurname(human.surname || "");
    setEditPhone(human.phone || "");
    setEditEmail(human.email || "");
    setEditAddress(human.address || "");
    setEditFb(human.fb || "");
    setEditInsta(human.insta || "");
    setEditTiktok(human.tiktok || "");
    setEditNotes(human.notes || "");
    setEditSms(!!human.sms);
    setEditWhatsapp(!!human.whatsapp);
    setEditHistoryFlag(human.historyFlag || "");
    setIsEditing(false);
  };

  // Server-side fallback for humans past the paginated PAGE_SIZE=50
  // window — see the DogCardModal copy of this effect for context.
  useEffect(() => {
    const query = trustedSearchQuery.trim();
    if (!query || !searchHumansByTerm) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      searchHumansByTerm(query).catch((err) => {
        console.error("trusted-human server search failed:", err);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trustedSearchQuery, searchHumansByTerm]);

  const trustedSearchResults = useMemo(() => {
    if (!trustedSearchQuery.trim()) return [];

    const query = trustedSearchQuery.toLowerCase().trim();
    const currentContacts = human.trustedContacts || [];
    const linkedIds = new Set(currentContacts.map((c) => c.id).filter(Boolean));
    const linkedNames = new Set(currentContacts.map((c) => c.fullName).filter(Boolean));

    return Object.values(humans || {})
      .filter((candidate) => candidate.id !== human.id)
      .filter((candidate) => {
        const candidateFullName =
          candidate.fullName ||
          `${candidate.name || ""} ${candidate.surname || ""}`.trim();
        return !linkedIds.has(candidate.id) && !linkedNames.has(candidateFullName);
      })
      .filter((candidate) => {
        const fullName =
          candidate.fullName ||
          `${candidate.name || ""} ${candidate.surname || ""}`.trim();
        return `${fullName} ${candidate.phone || ""}`
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 5);
  }, [trustedSearchQuery, humans, human.id, human.trustedContacts]);

  const handleAddTrusted = async (selectedHumanId) => {
    const currentContacts = human.trustedContacts || [];
    const myId = human.id || humanId;

    // Step 1: Add them to our trusted list (relationship blank initially)
    await onUpdateHuman(myId, {
      trustedContacts: [...currentContacts, { id: selectedHumanId, relationship: "" }],
    });

    // Step 2: Add us to their trusted list (reciprocal, relationship blank)
    const selectedHuman = getHumanByIdOrName(humans, selectedHumanId);
    if (selectedHuman) {
      const theirContacts = selectedHuman.trustedContacts || [];
      if (!theirContacts.some((c) => c.id === myId || c.fullName === humanFullName)) {
        try {
          await onUpdateHuman(selectedHuman.id || selectedHumanId, {
            trustedContacts: [...theirContacts, { id: myId, relationship: "" }],
          });
        } catch {
          // Step 2 failed — roll back step 1 to prevent one-directional trust
          onUpdateHuman(myId, {
            trustedContacts: currentContacts,
          });
          console.error("Failed to create bidirectional trust; rolled back.");
        }
      }
    }

    setTrustedSearchQuery("");
    setShowTrustedSearch(false);
    toast.show("Trusted human linked", "success");
  };

  const handleAddNewTrusted = async () => {
    if (!newTrustedName.trim() || !onAddHuman) return;
    const trimmedTrustedPhone = newTrustedPhone.trim();
    if (trimmedTrustedPhone && normalisePhoneDigits(trimmedTrustedPhone).length < 10) {
      toast.show("Please enter a valid phone number (at least 10 digits).", "error");
      return;
    }
    const relationship = (newTrustedRelationship || "").trim();
    const linkAsTrusted = async (trustedHuman, successMessage) => {
      const myId = human.id || humanId;
      const currentContacts = human.trustedContacts || [];
      await onUpdateHuman(myId, {
        trustedContacts: [
          ...currentContacts,
          { id: trustedHuman.id, relationship },
        ],
      });
      try {
        const theirContacts = trustedHuman.trustedContacts || [];
        if (!theirContacts.some((c) => c.id === myId || c.fullName === humanFullName)) {
          await onUpdateHuman(trustedHuman.id, {
            trustedContacts: [
              ...theirContacts,
              { id: myId, relationship: "" },
            ],
          });
        }
      } catch {
        console.error("Failed to add bidirectional trust for new human");
      }
      setShowNewTrustedForm(false);
      setNewTrustedName("");
      setNewTrustedSurname("");
      setNewTrustedPhone("");
      setNewTrustedRelationship("");
      setShowTrustedSearch(false);
      toast.show(successMessage, "success");
    };

    try {
      const result = await onAddHuman({
        name: newTrustedName.trim(),
        surname: newTrustedSurname.trim(),
        phone: trimmedTrustedPhone,
      });
      const newId = result?.id || result?.[0]?.id;
      if (newId) {
        await linkAsTrusted(result, "Trusted human added");
      }
    } catch (err) {
      console.error("Failed to create new trusted human:", err);
      // Mirror DogCardModal: the unique constraint on (name, surname)
      // fires when the directory already has a row with this name. Look
      // it up server-side and link the existing record instead of
      // failing the user out.
      const isDuplicate =
        typeof err?.message === "string" && err.message.includes("already exists");
      if (isDuplicate && findHumanByFullName) {
        try {
          const existing = await findHumanByFullName(
            newTrustedName.trim(),
            newTrustedSurname.trim(),
          );
          if (existing) {
            await linkAsTrusted(
              existing,
              `Linked existing ${existing.fullName} as trusted human`,
            );
            return;
          }
        } catch (lookupErr) {
          console.error("findHumanByFullName failed:", lookupErr);
        }
      }
      toast.show(err?.message || "Could not add trusted human.", "error");
    }
  };

  const handleUpdateTrustedRelationship = async (trustedIdOrName, relationship) => {
    const currentContacts = human.trustedContacts || [];
    const nextContacts = currentContacts.map((c) =>
      c.id === trustedIdOrName || c.fullName === trustedIdOrName
        ? { ...c, relationship }
        : c,
    );
    await onUpdateHuman(human.id || humanId, { trustedContacts: nextContacts });
  };

  const detailRow = (label, value) => (
    <div className="flex justify-between py-2 border-b border-slate-200">
      <span className="text-[13px] text-slate-500">{label}</span>
      <span className="text-[13px] font-semibold text-slate-800 text-right">
        {value || "\u2014"}
      </span>
    </div>
  );

  const editableRow = (label, value, setter, { type = "text", placeholder = "" } = {}) => (
    <label className="flex justify-between items-center gap-3 py-2 border-b border-slate-200">
      <span className="text-[13px] text-slate-500 shrink-0">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => setter(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="flex-1 max-w-[65%] py-1 px-2 rounded-md border border-slate-200 text-[13px] font-semibold font-inherit outline-none text-slate-800 text-right focus:border-brand-teal"
      />
    </label>
  );

  const contactRow = (label, active) => (
    <div className="flex justify-between py-2 border-b border-slate-200">
      <span className="text-[13px] text-slate-500">{label}</span>
      <span
        className="text-[13px] font-semibold"
        style={{ color: active ? "var(--color-brand-teal)" : "var(--color-brand-coral)" }}
      >
        {active ? "\u2705 Active" : "\u274C Off"}
      </span>
    </div>
  );

  const editableToggleRow = (label, active, setter) => (
    <div className="flex items-center justify-between py-2 border-b border-slate-200">
      <span className="text-[13px] text-slate-500">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={label}
        onClick={() => setter(!active)}
        className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer border-none p-0 ${active ? "bg-brand-teal" : "bg-slate-300"}`}
      >
        <span aria-hidden="true" className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${active ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );

  const PILL_FALLBACK = { light: "#E5E7EB", primary: "#6B7280" };

  const DogPill = ({ dog }) => {
    const dogSize = dog.size || getSizeForBreed(dog.breed);
    const theme = SIZE_THEME[dogSize] || PILL_FALLBACK;
    const colours = { bg: theme.light, text: theme.primary };
    const hasAlerts = dog.alerts && dog.alerts.length > 0;
    return (
      <button
        type="button"
        onClick={() => { onClose(); onOpenDog && onOpenDog(dog.id || dog.name); }}
        aria-label={`Open ${dog.name}${hasAlerts ? " (has alerts)" : ""}`}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full cursor-pointer text-xs font-bold transition-opacity hover:opacity-80 border-none font-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/60"
        style={{ background: colours.bg, color: colours.text }}
      >
        {hasAlerts && <span aria-hidden="true">{"\u26A0\uFE0F "}</span>}{titleCase(dog.name)} · {titleCase(dog.breed)}
      </button>
    );
  };

  return (
    <>
    <AccessibleModal
      onClose={onClose}
      titleId="human-card-title"
      className="bg-white rounded-2xl w-[min(380px,95vw)] max-h-[85vh] overflow-auto shadow-modal"
    >
        <div
          className="px-6 py-5 rounded-t-2xl flex justify-between items-start"
          style={{ background: "linear-gradient(135deg, var(--color-brand-teal), var(--color-brand-teal-dark))" }}
        >
          <div className="flex-1 min-w-0 pr-3">
            {isEditing ? (
              <>
                <div className="flex gap-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="First name"
                    className="text-base font-extrabold bg-white/15 border border-white/30 rounded-lg px-2 py-1 w-1/2 box-border outline-none font-inherit text-white placeholder-white/50"
                  />
                  <input
                    value={editSurname}
                    onChange={(e) => setEditSurname(e.target.value)}
                    placeholder="Surname"
                    className="text-base font-extrabold bg-white/15 border border-white/30 rounded-lg px-2 py-1 w-1/2 box-border outline-none font-inherit text-white placeholder-white/50"
                  />
                </div>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="Phone"
                  type="tel"
                  className="mt-2 text-[13px] bg-white/15 border border-white/30 rounded-md px-2 py-1 w-full box-border outline-none font-inherit text-white placeholder-white/50"
                />
              </>
            ) : (
              <>
                <div id="human-card-title" className="text-xl font-extrabold text-white">
                  {titleCase(humanFullName)}
                </div>
                {human.phone ? (
                  <div className="flex items-center gap-2 mt-1">
                    <a
                      href={telLink(human.phone)}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[13px] no-underline transition-colors hover:text-white"
                      style={{ color: "rgba(255,255,255,0.8)" }}
                    >
                      {human.phone}
                    </a>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (navigator.clipboard?.writeText) {
                          navigator.clipboard.writeText(human.phone);
                          toast.show(`Copied ${human.phone}`, "success");
                        } else {
                          toast.show("Clipboard not available", "error");
                        }
                      }}
                      aria-label={`Copy phone number ${human.phone}`}
                      title="Copy to clipboard"
                      className="text-[10px] font-bold bg-white/20 hover:bg-white/30 text-white border-none rounded px-1.5 py-0.5 cursor-pointer transition-colors font-[inherit]"
                    >
                      Copy
                    </button>
                    <a
                      href={waLink(human.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] font-bold no-underline transition-colors hover:text-white"
                      style={{ color: "rgba(255,255,255,0.6)" }}
                      title="WhatsApp"
                    >
                      WA
                    </a>
                  </div>
                ) : (
                  <div className="text-[13px] text-white/50 mt-1 italic">
                    No phone
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isEditing && onUpdateHuman && (
              <button
                onClick={() => setIsEditing(true)}
                className="bg-white/20 border-none rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer text-white shrink-0"
                aria-label="Edit profile"
                title="Edit profile"
              >
                <IconEdit size={14} colour="#FFFFFF" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="bg-white/20 border-none rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer text-sm text-white font-bold shrink-0"
            >
              <span aria-hidden="true">{"\u00D7"}</span>
            </button>
          </div>
        </div>

        <div className="px-6 pt-4 pb-5">
          {isEditing ? (
            <>
              {editableRow("Address", editAddress, setEditAddress, { placeholder: "Address" })}
              {editableRow("Email", editEmail, setEditEmail, { type: "email", placeholder: "name@example.com" })}
              {editableToggleRow("SMS", editSms, setEditSms)}
              {editableToggleRow("WhatsApp", editWhatsapp, setEditWhatsapp)}
              {editableRow("Facebook", editFb, setEditFb, { placeholder: "@handle or URL" })}
              {editableRow("Instagram", editInsta, setEditInsta, { placeholder: "@handle" })}
              {editableRow("TikTok", editTiktok, setEditTiktok, { placeholder: "@handle" })}
              <div className="flex flex-col py-2 border-b border-slate-200">
                <span className="text-[13px] text-slate-500 mb-1">Notes</span>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Anything worth remembering..."
                  rows={2}
                  className="w-full py-1.5 px-2 rounded-md border border-slate-200 text-[13px] font-inherit outline-none text-slate-800 resize-y focus:border-brand-teal"
                />
              </div>
              <div className="flex flex-col py-2">
                <span className="text-[13px] text-slate-500 mb-1">History flag</span>
                <input
                  value={editHistoryFlag}
                  onChange={(e) => setEditHistoryFlag(e.target.value)}
                  placeholder="Warning to show on the card"
                  className="w-full py-1.5 px-2 rounded-md border border-slate-200 text-[13px] font-inherit outline-none text-slate-800 focus:border-brand-coral"
                />
              </div>
            </>
          ) : (
            <>
              {detailRow("Address", human.address)}
              {detailRow("Email", human.email)}
              {contactRow("SMS", human.sms)}
              {contactRow("WhatsApp", human.whatsapp)}
              {detailRow("Facebook", human.fb)}
              {detailRow("Instagram", human.insta)}
              {detailRow("TikTok", human.tiktok)}
              {detailRow("Notes", human.notes)}

              {human.historyFlag && (
                <div className="text-[13px] text-brand-coral font-bold bg-brand-coral-light px-3 py-2 rounded-lg mt-3">
                  {"\u26A0\uFE0F"} {human.historyFlag}
                </div>
              )}
            </>
          )}

          {/* DOGS (own dogs) */}
          {humanDogs.length > 0 && (
            <>
              <div className="mt-5 font-extrabold text-xs text-brand-teal-text uppercase tracking-wide mb-2">
                Dogs
              </div>
              <div className="flex flex-wrap gap-1.5">
                {humanDogs.map(dog => <DogPill key={dog.id} dog={dog} />)}
              </div>
            </>
          )}

          {/* DOGS TRUSTED WITH */}
          {trustedDogs.length > 0 && (
            <>
              <div className="mt-5 font-extrabold text-xs text-brand-teal-text uppercase tracking-wide mb-2">
                Dogs Trusted With
              </div>
              <div className="flex flex-wrap gap-1.5">
                {trustedDogs.map(dog => <DogPill key={dog.id} dog={dog} />)}
              </div>
            </>
          )}

          {/* If neither section has dogs */}
          {humanDogs.length === 0 && trustedDogs.length === 0 && (
            <>
              <div className="mt-5 font-extrabold text-xs text-brand-teal-text uppercase tracking-wide mb-2">
                Dogs
              </div>
              <div className="text-[13px] text-slate-500 italic">
                No dogs linked
              </div>
            </>
          )}

          <div className="mt-5 font-extrabold text-xs text-brand-teal-text uppercase tracking-wide mb-2">
            Trusted Humans
          </div>
          {human.trustedContacts && human.trustedContacts.length > 0 ? (
            human.trustedContacts.map((contact) => {
              const trustedHuman =
                getHumanByIdOrName(humans, contact.id) ||
                getHumanByIdOrName(humans, contact.fullName);
              const trustedLabel =
                trustedHuman?.fullName ||
                contact.fullName ||
                `${trustedHuman?.name || ""} ${trustedHuman?.surname || ""}`.trim() ||
                contact.id;
              const rowKey = contact.id || contact.fullName || trustedLabel;

              return (
                <div key={rowKey} className="py-2 border-b border-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenHuman && onOpenHuman(trustedHuman?.id || contact.id);
                      }}
                      className="text-[13px] font-semibold text-brand-teal-text cursor-pointer bg-transparent border-none p-0 text-left flex-1 min-w-0 truncate font-inherit"
                    >
                      {titleCase(trustedLabel)}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Relationship (e.g. husband, dog walker)"
                    defaultValue={contact.relationship || ""}
                    onBlur={(e) => {
                      const nextValue = e.target.value.trim();
                      if (nextValue === (contact.relationship || "")) return;
                      handleUpdateTrustedRelationship(
                        contact.id || contact.fullName,
                        nextValue,
                      );
                    }}
                    className="w-full mt-1 px-2 py-1 rounded-md border border-slate-200 text-[12px] outline-none font-inherit text-slate-800"
                    aria-label={`Relationship for ${titleCase(trustedLabel)}`}
                  />
                </div>
              );
            })
          ) : (
            <div className="text-[13px] text-slate-500 italic">
              None listed
            </div>
          )}

          <button
            onClick={() => setShowTrustedSearch(!showTrustedSearch)}
            className="w-full mt-3 py-2.5 rounded-control border-[1.5px] border-dashed border-brand-teal text-[13px] font-bold cursor-pointer font-inherit transition-all"
            style={{
              background: showTrustedSearch ? "var(--color-brand-teal)" : "#E6F5F2",
              color: showTrustedSearch ? "#FFFFFF" : "var(--color-brand-teal)",
            }}
          >
            {showTrustedSearch ? "Cancel" : "+ Add a trusted Human"}
          </button>

          {/* Reminder Preferences */}
          <div className="mt-5 font-extrabold text-xs text-brand-teal-text uppercase tracking-wide mb-2">
            Reminder Preferences
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[13px] text-slate-600">Timing</span>
              <select
                value={human.reminderHours ?? 24}
                onChange={(e) => onUpdateHuman(human.id, { reminderHours: Number(e.target.value) })}
                className="py-1 px-2 rounded-md border border-slate-200 text-[13px] font-inherit cursor-pointer"
              >
                <option value={24}>24 hours before</option>
                <option value={12}>12 hours before</option>
                <option value={2}>2 hours before</option>
              </select>
            </div>
            {[
              { key: "whatsapp", label: "WhatsApp" },
              { key: "sms", label: "SMS" },
              { key: "email", label: "Email" },
            ].map(({ key, label }) => {
              const channels = human.reminderChannels || ["whatsapp"];
              const active = channels.includes(key);
              return (
                <div key={key} className="flex items-center justify-between py-1.5">
                  <span className="text-[13px] text-slate-600">{label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    aria-label={`Reminders via ${label}`}
                    onClick={() => {
                      const next = active ? channels.filter((c) => c !== key) : [...channels, key];
                      onUpdateHuman(human.id, { reminderChannels: next.length > 0 ? next : ["whatsapp"] });
                    }}
                    className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer border-none p-0 ${active ? "bg-brand-teal" : "bg-slate-300"}`}
                  >
                    <span aria-hidden="true" className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${active ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </div>
              );
            })}
          </div>

          <HumanBookingHistory
            human={human}
            dogs={dogs}
            bookingsByDate={bookingsByDate}
          />

          {showTrustedSearch && (
            <div className="mt-2.5">
              <div className="relative">
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex pointer-events-none">
                  <IconSearch size={14} colour="#6B7280" />
                </div>
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={trustedSearchQuery}
                  onChange={(e) => setTrustedSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full py-2 px-2.5 pl-8 rounded-lg border-[1.5px] border-brand-teal text-[13px] font-inherit box-border outline-none text-slate-800"
                />
              </div>

              {trustedSearchResults.length > 0 && (
                <div className="mt-1.5 border border-slate-200 rounded-lg overflow-hidden">
                  {trustedSearchResults.map((candidate) => {
                    const fullName =
                      candidate.fullName ||
                      `${candidate.name || ""} ${candidate.surname || ""}`.trim();

                    return (
                      <button
                        type="button"
                        key={candidate.id}
                        onClick={() => handleAddTrusted(candidate.id)}
                        className="w-full text-left bg-transparent px-3 py-2.5 cursor-pointer border-x-0 border-t-0 border-b border-slate-200 transition-colors hover:bg-[#E6F5F2] focus:outline-none focus-visible:bg-[#E6F5F2]"
                      >
                        <div className="text-[13px] font-semibold text-slate-800">
                          {titleCase(fullName)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {candidate.phone}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {trustedSearchQuery.trim() &&
                trustedSearchResults.length === 0 && (
                  <div className="text-xs text-slate-500 mt-2 text-center">
                    No matching humans found
                  </div>
                )}

              {onAddHuman && !showNewTrustedForm && (
                <button
                  onClick={() => setShowNewTrustedForm(true)}
                  className="w-full mt-2.5 py-2.5 rounded-control border-[1.5px] border-dashed border-brand-teal bg-[#E6F5F2] text-brand-teal text-[13px] font-bold cursor-pointer font-inherit transition-all hover:bg-brand-teal hover:text-white"
                >
                  + Create new human
                </button>
              )}

              {showNewTrustedForm && (
                <div className="mt-2.5 p-3.5 bg-slate-50 rounded-control border border-slate-200">
                  <div className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide mb-2.5">
                    New Trusted Human
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="First name"
                      value={newTrustedName}
                      onChange={(e) => setNewTrustedName(e.target.value)}
                      autoFocus
                      className="flex-1 py-2 px-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit outline-none text-slate-800 transition-colors focus:border-brand-teal"
                    />
                    <input
                      type="text"
                      placeholder="Surname"
                      value={newTrustedSurname}
                      onChange={(e) => setNewTrustedSurname(e.target.value)}
                      className="flex-1 py-2 px-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit outline-none text-slate-800 transition-colors focus:border-brand-teal"
                    />
                  </div>
                  <input
                    type="tel"
                    placeholder="Phone number"
                    value={newTrustedPhone}
                    onChange={(e) => setNewTrustedPhone(e.target.value)}
                    className="w-full py-2 px-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit outline-none box-border text-slate-800 mb-2.5 transition-colors focus:border-brand-teal"
                  />
                  <input
                    type="text"
                    placeholder="Relationship (e.g. husband, dog walker)"
                    value={newTrustedRelationship}
                    onChange={(e) => setNewTrustedRelationship(e.target.value)}
                    className="w-full py-2 px-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit outline-none box-border text-slate-800 mb-2.5 transition-colors focus:border-brand-teal"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddNewTrusted}
                      disabled={!newTrustedName.trim()}
                      className="flex-1 py-2.5 rounded-control border-none text-[13px] font-bold cursor-pointer font-inherit transition-colors disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed bg-brand-teal text-white"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowNewTrustedForm(false);
                        setNewTrustedName("");
                        setNewTrustedSurname("");
                        setNewTrustedPhone("");
                        setNewTrustedRelationship("");
                      }}
                      className="flex-1 py-2.5 rounded-control border-[1.5px] border-slate-200 text-[13px] font-bold cursor-pointer font-inherit bg-white text-slate-500 transition-colors hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {isEditing && (
          <div className="px-6 py-4 pb-5 flex gap-2.5 bg-slate-50 border-t border-slate-200">
            <button
              onClick={handleSaveHuman}
              className="flex-1 py-3 rounded-control border-none text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-colors text-white"
              style={{ background: "var(--color-brand-teal)" }}
            >
              <IconTick size={16} colour="#FFFFFF" /> Save Changes
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex-1 py-3 rounded-control border-[1.5px] border-slate-200 bg-white text-slate-500 text-[13px] font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Delete moved here in task 4 of the May 2026 review pass —
            bulk delete from the /humans grid was too easy to mis-fire. */}
        {isEditing && onDeleteHuman && (
          <div className="px-6 pb-5 -mt-2 bg-slate-50">
            <button
              type="button"
              onClick={() => setPendingDelete(true)}
              className="text-[12px] font-bold text-brand-coral underline cursor-pointer bg-transparent border-none p-0 font-[inherit]"
            >
              Delete this person…
            </button>
          </div>
        )}
    </AccessibleModal>

    {pendingDelete && (
      <ConfirmDialog
        title="Delete this person?"
        message="They will be removed from the directory. Any dogs registered to them, their booking history, and groom photos will be deleted. WhatsApp threads stay but lose their link to this person. Cannot be undone."
        confirmLabel="Delete person"
        variant="danger"
        onConfirm={async () => {
          const result = await onDeleteHuman?.(humanId);
          setPendingDelete(false);
          if (result?.ok) {
            toast.show("Deleted", "success");
            onClose?.();
          } else if (result?.error) {
            toast.show(result.error, "error");
          }
        }}
        onCancel={() => setPendingDelete(false)}
      />
    )}
    </>
  );
}
