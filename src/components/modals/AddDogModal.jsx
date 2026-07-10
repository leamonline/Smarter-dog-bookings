import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { SIZE_THEME, SIZE_FALLBACK, getSizeForBreed, ALERT_OPTIONS } from "../../constants/index";
import { ModalShell, HeaderIconButton } from "./shell/index.js";
import { BREED_LIST } from "../../constants/breeds";
import { IconSearch } from "../icons/index.jsx";
import { InlineError } from "../ui/InlineError.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { titleCase, normaliseSurname, isRealPersonName } from "../../utils/text";
import { validateContactPhone } from "./dog-card/helpers.js";

const SORTED_BREEDS = [
  ...BREED_LIST.small.map(b => ({ name: b, size: "small" })),
  ...BREED_LIST.medium.map(b => ({ name: b, size: "medium" })),
  ...BREED_LIST.large.map(b => ({ name: b, size: "large" })),
].sort((a, b) => a.name.localeCompare(b.name));

// presetOwner ({ id, label, phone }) locks the owner to a known human — used
// when the modal is opened from a human's card ("add a dog they own"), so the
// owner picker is replaced by a fixed, non-editable owner.
// onAddAnother (booking flow only) enables "Save & add another dog": it persists
// the dog without closing, so staff can register several dogs for one customer
// in a single sitting. Other call sites (human card, Dogs directory) don't pass
// it, so the button stays hidden there.
export function AddDogModal({ onClose, onAdd, onAddAnother, onAddHuman, humans, presetOwner = null }) {
  const toast = useToast();
  // The owner is fixed when opened from a human's card (presetOwner) OR once the
  // first dog in a "Save & add another" batch sets the owner for the rest of the
  // session — every dog in a batch belongs to the same customer.
  const [sessionOwnerLocked, setSessionOwnerLocked] = useState(false);
  const ownerLocked = Boolean(presetOwner) || sessionOwnerLocked;

  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [customBreed, setCustomBreed] = useState("");
  const isOtherBreed = breed === "__other__";
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [size, setSize] = useState("");
  const [sizeAutoSet, setSizeAutoSet] = useState(false);
  const [sizeOverridden, setSizeOverridden] = useState(false);
  const [ownerQuery, setOwnerQuery] = useState("");
  const [selectedOwner, setSelectedOwner] = useState(presetOwner); // { id, label, phone }
  const [gender, setGender] = useState("");
  const [colour, setColour] = useState("");
  const [neutered, setNeutered] = useState(""); // "" | "yes" | "no" → boolean true/false/undefined
  const [microchip, setMicrochip] = useState("");
  const [vet, setVet] = useState("");
  const [groomNotes, setGroomNotes] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [hasAllergy, setHasAllergy] = useState(false);
  const [allergyInput, setAllergyInput] = useState("");
  // Field-level errors so missing fields can be surfaced all at once
  // and announced to screen readers via aria-describedby. The `banner`
  // slot is reserved for cross-field / server-side errors that don't
  // belong on any one field.
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // New owner form
  const [showNewOwner, setShowNewOwner] = useState(false);
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newOwnerSurname, setNewOwnerSurname] = useState("");
  const [newOwnerPhone, setNewOwnerPhone] = useState("");

  const sizeTheme = SIZE_THEME[size] || SIZE_FALLBACK;

  const ownerResults = useMemo(() => {
    if (!ownerQuery.trim() || selectedOwner) return [];
    const query = ownerQuery.toLowerCase().trim();
    return Object.values(humans)
      .filter((h) => {
        if (!h) return false;
        const fullName = (h.fullName || `${h.name || ""} ${normaliseSurname(h.surname)}`).toLowerCase();
        const phone = (h.phone || "").toLowerCase();
        return fullName.includes(query) || phone.includes(query);
      })
      .slice(0, 5);
  }, [ownerQuery, humans, selectedOwner]);

  // Clear the dog-specific fields (but NOT the owner) so a batch "add another"
  // leaves staff a fresh form for the next dog of the same customer.
  const resetDogFields = () => {
    setName("");
    setBreed("");
    setCustomBreed("");
    setDobMonth("");
    setDobYear("");
    setSize("");
    setSizeAutoSet(false);
    setSizeOverridden(false);
    setGender("");
    setColour("");
    setNeutered("");
    setMicrochip("");
    setVet("");
    setGroomNotes("");
    setAlerts([]);
    setHasAllergy(false);
    setAllergyInput("");
    setFieldErrors({});
  };

  // Shared create path. addAnother=false finishes and closes (the default
  // "Add Dog"); addAnother=true persists the dog, locks the owner and keeps the
  // modal open for the next one (booking-flow "Save & add another").
  const submitDog = async ({ addAnother }) => {
    const finalBreed = isOtherBreed ? customBreed.trim() : breed.trim();

    // Aggregate all field-level validation errors in a single pass so
    // the user can see everything that's wrong at once instead of
    // playing whack-a-mole one error at a time.
    const errors = {};
    if (!name.trim()) errors.name = "Give this dog a name so we know who's coming in.";
    if (!finalBreed) errors.breed = "We'll need a breed (or 'Mixed' if you're not sure).";
    if (!size) errors.size = "Pick a size — we can guess from the breed, or you set it manually.";
    // Normalise the new owner's phone (UK mobile → E.164) and reject a
    // mobile-shaped number with the wrong digit count, same as AddHumanModal.
    let newOwnerPhoneE164 = "";
    if (showNewOwner) {
      const ownerPhone = validateContactPhone(newOwnerPhone);
      newOwnerPhoneE164 = ownerPhone.value;
      if (!newOwnerName.trim() || !newOwnerSurname.trim() || !newOwnerPhone.trim()) {
        errors.owner = "We need a first name, surname, and phone number for the new owner.";
      } else if (!isRealPersonName(newOwnerName)) {
        // "?" / "-" / "n/a" owners are unfindable later — insist on the real name.
        errors.owner = "That owner name doesn't look like a name — we need their real first name.";
      } else if (ownerPhone.error) {
        errors.owner = ownerPhone.error;
      } else if (!onAddHuman) {
        errors.owner = "Cannot create new owners right now.";
      }
    } else if (!selectedOwner?.id) {
      errors.owner = "We need to know who owns this dog — pick an owner or add a new one.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    let ownerId = selectedOwner?.id;
    // The owner we actually used — so a batch "add another" can lock to it.
    let usedOwner = selectedOwner;

    // Create the new owner (if needed) once all client-side validation
    // has passed so we don't leave orphan rows behind on field errors.
    if (showNewOwner) {
      setSubmitting(true);
      setFieldErrors({});
      let newHuman;
      try {
        newHuman = await onAddHuman({
          name: newOwnerName.trim(),
          surname: newOwnerSurname.trim(),
          phone: newOwnerPhoneE164,
        });
      } catch (err) {
        setSubmitting(false);
        setFieldErrors({ owner: err?.message || "Couldn't save the new owner — give it another go." });
        return;
      }
      if (!newHuman) {
        setSubmitting(false);
        setFieldErrors({ owner: "Couldn't save the new owner — give it another go." });
        return;
      }
      ownerId = newHuman.id;
      usedOwner = {
        id: newHuman.id,
        label: `${newOwnerName.trim()} ${newOwnerSurname.trim()}`.trim(),
        phone: newOwnerPhoneE164,
      };
    }

    setSubmitting(true);
    setFieldErrors({});

    const dob = dobMonth && dobYear ? `${dobYear}-${dobMonth}` : "";

    const finalAlerts = [...alerts];
    if (hasAllergy && allergyInput.trim()) {
      finalAlerts.push(`Allergic to ${allergyInput.trim()}`);
    }

    const submit = addAnother && onAddAnother ? onAddAnother : onAdd;
    const result = await submit({
      name: name.trim(),
      breed: finalBreed,
      age: "",
      dob,
      size,
      gender: gender || undefined,
      colour: colour.trim() || undefined,
      neutered: neutered === "yes" ? true : neutered === "no" ? false : undefined,
      microchip: microchip.trim() || undefined,
      vet: vet.trim() || undefined,
      humanId: ownerId,
      groomNotes: groomNotes.trim(),
      alerts: finalAlerts.length > 0 ? finalAlerts : undefined,
    });
    setSubmitting(false);
    if (result) {
      toast.show(name.trim() ? `${name.trim()} saved` : "Dog saved", "success");
      if (addAnother && onAddAnother) {
        // Keep the modal open for the next dog: pin the owner and clear the
        // dog-specific fields so staff just type the next name + breed.
        setSelectedOwner(usedOwner);
        setSessionOwnerLocked(true);
        setShowNewOwner(false);
        resetDogFields();
      } else {
        onClose();
      }
    } else {
      toast.show("Couldn't save that dog just now", "error");
      setFieldErrors({ banner: "That didn't quite work — there might already be a dog with that name. Try again or pick a different name." });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submitDog({ addAnother: false });
  };

  // Clear a single field's error when the user edits it — feedback
  // shouldn't outlive the mistake.
  const clearFieldError = (field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  return (
    <ModalShell
      onClose={onClose}
      titleId="add-dog-title"
      accent={sizeTheme.primary}
      widthClass="w-[min(420px,95vw)]"
      maxHeightClass="max-h-[90vh]"
      rootClassName="bm-fields"
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex-1 min-w-0">
            <span className="text-label text-ink-muted">
              New dog
            </span>
            <h2
              id="add-dog-title"
              className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1"
            >
              Add New Dog
            </h2>
          </div>
          <HeaderIconButton label="Close add dog" onClick={onClose}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
      footer={
        <div className="border-t border-slate-100 bg-white px-6 py-3 flex flex-col gap-2.5">
          {onAddAnother && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => submitDog({ addAnother: true })}
              className="w-full min-h-[44px] rounded-full border-[1.5px] border-slate-200 bg-white text-brand-purple text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
            >
              {submitting ? "Saving..." : "Save & add another dog"}
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 max-sm:min-h-[44px] rounded-control border-[1.5px] border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50 inline-flex items-center justify-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-dog-form"
              disabled={submitting}
              className="ml-auto px-5 py-2 max-sm:min-h-[44px] rounded-full border-none bg-action text-on-action text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-brand-yellow-dark disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed inline-flex items-center justify-center"
            >
              {submitting ? "Adding..." : "Add Dog"}
            </button>
          </div>
        </div>
      }
    >
        <form id="add-dog-form" onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-3">
          {/* Name, Gender & Breed */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="add-dog-name" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Dog Name *</label>
              <input
                id="add-dog-name"
                value={name}
                onChange={(e) => { setName(e.target.value); clearFieldError("name"); }}
                placeholder="Bella"
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "add-dog-name-error" : undefined}
                className={`w-full px-3.5 py-2.5 rounded-lg border-[1.5px] text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal ${fieldErrors.name ? "border-brand-coral" : "border-slate-200"}`}
                autoFocus
              />
              {fieldErrors.name && (
                <p id="add-dog-name-error" role="alert" className="text-[12px] text-brand-coral font-semibold mt-1">{fieldErrors.name}</p>
              )}
            </div>
            <div>
              <label htmlFor="add-dog-gender" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Gender</label>
              <select id="add-dog-gender" value={gender} onChange={(e) => setGender(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal cursor-pointer">
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>
          {/* Breed & Size */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="add-dog-breed" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Breed *</label>
              <select
                id="add-dog-breed"
                value={breed}
                onChange={(e) => {
                  const val = e.target.value;
                  setBreed(val);
                  clearFieldError("breed");
                  if (val === "__other__") {
                    if (!sizeOverridden) { setSize(""); setSizeAutoSet(false); }
                  } else {
                    const detected = getSizeForBreed(val);
                    if (detected && !sizeOverridden) {
                      setSize(detected);
                      setSizeAutoSet(true);
                      clearFieldError("size");
                    }
                  }
                }}
                aria-invalid={Boolean(fieldErrors.breed)}
                aria-describedby={fieldErrors.breed ? "add-dog-breed-error" : undefined}
                className={`w-full px-3.5 py-2.5 rounded-lg border-[1.5px] text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal cursor-pointer ${fieldErrors.breed ? "border-brand-coral" : "border-slate-200"}`}>
                <option value="">Select breed</option>
                {SORTED_BREEDS.map(b => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
                <option value="__other__">Other</option>
              </select>
              {isOtherBreed && (
                <input
                  value={customBreed}
                  onChange={(e) => { setCustomBreed(e.target.value); clearFieldError("breed"); }}
                  placeholder="Enter breed..."
                  aria-label="Custom breed"
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
                  autoFocus
                />
              )}
              {fieldErrors.breed && (
                <p id="add-dog-breed-error" role="alert" className="text-[12px] text-brand-coral font-semibold mt-1">{fieldErrors.breed}</p>
              )}
            </div>
            <div>
              <label htmlFor="add-dog-size" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">
                Size
                <span role="status" aria-live="polite" aria-atomic="true">
                  {sizeAutoSet && !sizeOverridden && (
                    <span className="font-medium normal-case tracking-normal text-brand-green ml-1.5">auto</span>
                  )}
                  {!size && breed.trim() && (
                    <span className="font-medium normal-case tracking-normal text-brand-coral ml-1.5">unknown breed</span>
                  )}
                </span>
              </label>
              <select
                id="add-dog-size"
                value={size}
                onChange={(e) => {
                  setSize(e.target.value);
                  setSizeOverridden(true);
                  setSizeAutoSet(false);
                  clearFieldError("size");
                }}
                aria-invalid={Boolean(fieldErrors.size)}
                aria-describedby={fieldErrors.size ? "add-dog-size-error" : undefined}
                className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal cursor-pointer"
                style={{
                  borderColor: fieldErrors.size ? "var(--color-brand-coral)" : sizeAutoSet && !sizeOverridden ? "#16A34A" : !size && breed.trim() ? "var(--color-brand-coral)" : undefined,
                }}>
                <option value="">Select size</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
              {fieldErrors.size && (
                <p id="add-dog-size-error" role="alert" className="text-[12px] text-brand-coral font-semibold mt-1">{fieldErrors.size}</p>
              )}
            </div>
          </div>

          {/* DOB */}
          <div>
            <label className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Date of Birth</label>
            <div className="flex gap-1.5">
              <select value={dobMonth} onChange={(e) => setDobMonth(e.target.value)}
                className="flex-1 w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal cursor-pointer">
                <option value="">Month</option>
                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
                ))}
              </select>
              <select value={dobYear} onChange={(e) => setDobYear(e.target.value)}
                className="flex-1 w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal cursor-pointer">
                <option value="">Year</option>
                {Array.from({ length: 26 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Colour & Neutered */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="add-dog-colour" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Colour / Markings</label>
              <input
                id="add-dog-colour"
                value={colour}
                onChange={(e) => setColour(e.target.value)}
                placeholder="Black &amp; tan"
                className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal" />
            </div>
            <div>
              <label htmlFor="add-dog-neutered" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Neutered</label>
              <select id="add-dog-neutered" value={neutered} onChange={(e) => setNeutered(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal cursor-pointer">
                <option value="">Select</option>
                <option value="yes">Neutered</option>
                <option value="no">Not neutered</option>
              </select>
            </div>
          </div>

          {/* Microchip & Vet */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="add-dog-microchip" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Microchip</label>
              <input
                id="add-dog-microchip"
                value={microchip}
                onChange={(e) => setMicrochip(e.target.value)}
                placeholder="985..."
                className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal" />
            </div>
            <div>
              <label htmlFor="add-dog-vet" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Vet</label>
              <input
                id="add-dog-vet"
                value={vet}
                onChange={(e) => setVet(e.target.value)}
                placeholder="Vet practice"
                className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal" />
            </div>
          </div>

          {/* Owner */}
          <div>
            <label htmlFor="add-dog-owner" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Owner *</label>
            {selectedOwner && !showNewOwner ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#E6F5F2] px-3.5 py-2.5 rounded-lg">
                  <div className="text-sm font-bold text-brand-teal">{titleCase(selectedOwner.label)}</div>
                  {selectedOwner.phone && (
                    <div className="text-xs text-slate-500 mt-0.5">{selectedOwner.phone}</div>
                  )}
                </div>
                {!ownerLocked && (
                  <button type="button" onClick={() => { setSelectedOwner(null); setOwnerQuery(""); }}
                    className="bg-brand-coral-light border-none rounded-lg px-3 py-2 text-brand-coral text-xs font-bold cursor-pointer font-inherit">
                    Change
                  </button>
                )}
              </div>
            ) : !showNewOwner ? (
              <div>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 flex pointer-events-none">
                    <IconSearch size={14} colour="#6B7280" />
                  </div>
                  <input
                    id="add-dog-owner"
                    value={ownerQuery}
                    onChange={(e) => { setOwnerQuery(e.target.value); clearFieldError("owner"); }}
                    placeholder="Search by name or phone..."
                    aria-invalid={Boolean(fieldErrors.owner)}
                    aria-describedby={fieldErrors.owner ? "add-dog-owner-error" : undefined}
                    className={`w-full px-3.5 py-2.5 pl-[34px] rounded-lg border-[1.5px] text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal ${fieldErrors.owner ? "border-brand-coral" : "border-slate-200"}`}
                  />
                  {ownerResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg overflow-hidden bg-white z-10 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
                      {ownerResults.map((h) => {
                        const fullName = h.fullName || `${h.name || ""} ${normaliseSurname(h.surname)}`.trim();
                        const selectOwner = () => {
                          setSelectedOwner({ id: h.id || fullName, label: fullName, phone: h.phone || "" });
                          setOwnerQuery(fullName);
                          clearFieldError("owner");
                        };
                        return (
                          <button
                            type="button"
                            key={h.id || fullName}
                            onMouseDown={selectOwner}
                            onClick={selectOwner}
                            className="w-full text-left bg-white px-3.5 py-2.5 cursor-pointer border-x-0 border-t-0 border-b border-slate-200 transition-colors hover:bg-[#E6F5F2] focus:outline-none focus-visible:bg-[#E6F5F2]"
                          >
                            <div className="text-[13px] font-semibold text-slate-800">{titleCase(fullName)}</div>
                            {h.phone && <div className="text-xs text-slate-500">{h.phone}</div>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* "No matches" inline CTA — mirrors the booking-flow dog
                    search pattern so the user doesn't have to abandon
                    the form to add a brand-new human. */}
                {onAddHuman && ownerQuery.trim().length >= 2 && ownerResults.length === 0 && (
                  <div className="mt-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="text-[12px] text-slate-500 mb-1.5">
                      No humans found matching "{ownerQuery.trim()}".
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowNewOwner(true); setOwnerQuery(""); setSelectedOwner(null); clearFieldError("owner"); }}
                      className="w-full py-2 rounded-lg border-none bg-brand-teal text-white text-xs font-bold cursor-pointer font-inherit"
                    >
                      + New Human
                    </button>
                  </div>
                )}
                {onAddHuman && (
                  <button type="button" onClick={() => { setShowNewOwner(true); setOwnerQuery(""); setSelectedOwner(null); clearFieldError("owner"); }}
                    className="w-full mt-2 py-2 rounded-lg border-[1.5px] border-brand-teal bg-white text-brand-teal-text text-xs font-bold cursor-pointer font-inherit transition-all">
                    + Add new owner
                  </button>
                )}
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide mb-2">New Owner</div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text" placeholder="First name" value={newOwnerName}
                    onChange={(e) => { setNewOwnerName(e.target.value); clearFieldError("owner"); }}
                    autoFocus
                    aria-label="Owner first name"
                    className="flex-1 w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
                  />
                  <input
                    type="text" placeholder="Surname" value={newOwnerSurname}
                    onChange={(e) => { setNewOwnerSurname(e.target.value); clearFieldError("owner"); }}
                    aria-label="Owner surname"
                    className="flex-1 w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
                  />
                </div>
                <input
                  type="tel" placeholder="Phone number" value={newOwnerPhone}
                  onChange={(e) => { setNewOwnerPhone(e.target.value); clearFieldError("owner"); }}
                  aria-label="Owner phone number"
                  className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal mb-2"
                />
                <button type="button" onClick={() => {
                  setShowNewOwner(false);
                  setNewOwnerName(""); setNewOwnerSurname(""); setNewOwnerPhone("");
                  clearFieldError("owner");
                }}
                className="bg-transparent border-none text-slate-500 text-xs font-semibold cursor-pointer font-inherit p-0">
                  Cancel — search existing instead
                </button>
              </div>
            )}
            {fieldErrors.owner && (
              <p id="add-dog-owner-error" role="alert" className="text-[12px] text-brand-coral font-semibold mt-1">{fieldErrors.owner}</p>
            )}
          </div>

          {/* Groom Notes */}
          <div>
            <label className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Groom Notes</label>
            <textarea value={groomNotes} onChange={(e) => setGroomNotes(e.target.value)}
              placeholder="Teddy bear cut, short on ears..." rows={2}
              className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal resize-y" />
          </div>

          {/* Alerts */}
          <div>
            <label className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1.5">Alerts</label>
            <div className="flex flex-wrap gap-1.5">
              {ALERT_OPTIONS.map((opt) => {
                const active = alerts.includes(opt.label);
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      if (active) setAlerts(alerts.filter((a) => a !== opt.label));
                      else setAlerts([...alerts, opt.label]);
                    }}
                    className="px-2.5 py-1.5 rounded-2xl text-[11px] font-bold cursor-pointer transition-all"
                    style={{
                      background: active ? opt.color : "#FFFFFF",
                      color: active ? "#FFFFFF" : opt.color,
                      border: `1.5px solid ${opt.color}`,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setHasAllergy(!hasAllergy)}
                className="px-2.5 py-1.5 rounded-2xl text-[11px] font-bold cursor-pointer transition-all"
                style={{
                  background: hasAllergy ? "var(--color-brand-coral)" : "#FFFFFF",
                  color: hasAllergy ? "#FFFFFF" : "var(--color-brand-coral)",
                  border: "1.5px solid var(--color-brand-coral)",
                }}
              >
                Allergy
              </button>
            </div>
            {hasAllergy && (
              <input
                type="text"
                placeholder="Allergic to..."
                value={allergyInput}
                onChange={(e) => setAllergyInput(e.target.value)}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-lg border-[1.5px] border-brand-coral text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-coral"
              />
            )}
          </div>

          <InlineError message={fieldErrors.banner} />
        </form>
    </ModalShell>
  );
}
