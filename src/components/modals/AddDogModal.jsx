import { useState, useMemo } from "react";
import { SIZE_THEME, SIZE_FALLBACK, getSizeForBreed, ALERT_OPTIONS } from "../../constants/index";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { BREED_LIST } from "../../constants/breeds";
import { IconSearch } from "../icons/index.jsx";
import { InlineError } from "../ui/InlineError.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { titleCase, normaliseSurname } from "../../utils/text";
import { normalisePhoneDigits } from "./dog-card/helpers.js";

const SORTED_BREEDS = [
  ...BREED_LIST.small.map(b => ({ name: b, size: "small" })),
  ...BREED_LIST.medium.map(b => ({ name: b, size: "medium" })),
  ...BREED_LIST.large.map(b => ({ name: b, size: "large" })),
].sort((a, b) => a.name.localeCompare(b.name));

export function AddDogModal({ onClose, onAdd, onAddHuman, humans }) {
  const toast = useToast();

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
  const [selectedOwner, setSelectedOwner] = useState(null); // { id, label, phone }
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
  const headerTheme = { from: sizeTheme.gradient[0], to: sizeTheme.gradient[1], text: sizeTheme.headerText };

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalBreed = isOtherBreed ? customBreed.trim() : breed.trim();

    // Aggregate all field-level validation errors in a single pass so
    // the user can see everything that's wrong at once instead of
    // playing whack-a-mole one error at a time.
    const errors = {};
    if (!name.trim()) errors.name = "Dog name is required.";
    if (!finalBreed) errors.breed = "Breed is required.";
    if (!size) errors.size = "Size is required — pick a breed and it will fill in automatically.";
    if (showNewOwner) {
      if (!newOwnerName.trim() || !newOwnerSurname.trim() || !newOwnerPhone.trim()) {
        errors.owner = "New owner needs a first name, surname, and phone number.";
      } else if (normalisePhoneDigits(newOwnerPhone).length < 10) {
        // Same check as AddHumanModal — anything shorter can't be a UK
        // mobile/landline and breaks wa.me/tel: links downstream.
        errors.owner = "Please enter a valid phone number (at least 10 digits).";
      } else if (!onAddHuman) {
        errors.owner = "Cannot create new owners right now.";
      }
    } else if (!selectedOwner?.id) {
      errors.owner = "Please select or add an owner.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    let ownerId = selectedOwner?.id;

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
          phone: newOwnerPhone.trim(),
        });
      } catch (err) {
        setSubmitting(false);
        setFieldErrors({ owner: err?.message || "Failed to create new owner." });
        return;
      }
      if (!newHuman) {
        setSubmitting(false);
        setFieldErrors({ owner: "Failed to create new owner." });
        return;
      }
      ownerId = newHuman.id;
    }

    setSubmitting(true);
    setFieldErrors({});

    const dob = dobMonth && dobYear ? `${dobYear}-${dobMonth}` : "";

    const finalAlerts = [...alerts];
    if (hasAllergy && allergyInput.trim()) {
      finalAlerts.push(`Allergic to ${allergyInput.trim()}`);
    }

    const result = await onAdd({
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
      toast.show(name.trim() ? `${name.trim()} added` : "Dog added", "success");
      onClose();
    } else {
      toast.show("Could not add dog", "error");
      setFieldErrors({ banner: "Failed to add dog. A dog with this name may already exist." });
    }
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
    <AccessibleModal
      onClose={onClose}
      titleId="add-dog-title"
      className="bg-white rounded-2xl w-[min(400px,95vw)] max-h-[90vh] overflow-auto shadow-modal"
    >
        {/* Header */}
        <div
          className="px-6 py-5 rounded-t-2xl flex justify-between items-center"
          style={{ background: `linear-gradient(135deg, ${headerTheme.from}, ${headerTheme.to})` }}
        >
          <div id="add-dog-title" className="text-lg font-extrabold" style={{ color: headerTheme.text }}>Add New Dog</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add dog"
            className="bg-white/20 border-none rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer text-sm font-bold shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            style={{ color: headerTheme.text }}
          ><span aria-hidden="true">{"\u00D7"}</span></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-3">
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
              <label className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Gender</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)}
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
                {sizeAutoSet && !sizeOverridden && (
                  <span className="font-medium normal-case tracking-normal text-brand-green ml-1.5">auto</span>
                )}
                {!size && breed.trim() && (
                  <span className="font-medium normal-case tracking-normal text-brand-coral ml-1.5">unknown breed</span>
                )}
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
                <button type="button" onClick={() => { setSelectedOwner(null); setOwnerQuery(""); }}
                  className="bg-brand-coral-light border-none rounded-lg px-3 py-2 text-brand-coral text-xs font-bold cursor-pointer font-inherit">
                  Change
                </button>
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

          <div className="flex gap-2.5 mt-1">
            <button type="submit" disabled={submitting}
              className="flex-1 py-3 rounded-control border-none text-sm font-bold cursor-pointer font-inherit transition-all disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
              style={{
                background: submitting ? undefined : headerTheme.from,
                color: submitting ? undefined : headerTheme.text,
              }}
              onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = headerTheme.to; }}
              onMouseLeave={(e) => { if (!submitting) e.currentTarget.style.background = headerTheme.from; }}>
              {submitting ? "Adding..." : "Add Dog"}
            </button>
            <button type="button" onClick={onClose}
              className="py-3 px-5 rounded-control border-[1.5px] border-slate-200 bg-white text-slate-500 text-sm font-semibold cursor-pointer font-inherit">
              Cancel
            </button>
          </div>
        </form>
    </AccessibleModal>
  );
}
