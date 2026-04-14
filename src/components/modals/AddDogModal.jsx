import { useState, useMemo } from "react";
import { SIZE_THEME, SIZE_FALLBACK, getSizeForBreed, ALERT_OPTIONS } from "../../constants/index.js";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { BREED_LIST } from "../../constants/breeds.js";
import { IconSearch } from "../icons/index.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { titleCase } from "../../utils/text.js";

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
  const [groomNotes, setGroomNotes] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [hasAllergy, setHasAllergy] = useState(false);
  const [allergyInput, setAllergyInput] = useState("");
  const [error, setError] = useState("");
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
        const fullName = (h.fullName || `${h.name || ""} ${h.surname || ""}`).toLowerCase();
        const phone = (h.phone || "").toLowerCase();
        return fullName.includes(query) || phone.includes(query);
      })
      .slice(0, 5);
  }, [ownerQuery, humans, selectedOwner]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalBreed = isOtherBreed ? customBreed.trim() : breed.trim();
    if (!name.trim() || !finalBreed) {
      setError("Dog name and breed are required.");
      return;
    }
    if (!size) {
      setError("Please select a size.");
      return;
    }

    let ownerId = selectedOwner?.id;

    // If adding a new owner, create them first
    if (showNewOwner) {
      const oName = newOwnerName.trim();
      const oSurname = newOwnerSurname.trim();
      const oPhone = newOwnerPhone.trim();
      if (!oName || !oSurname || !oPhone) {
        setError("New owner needs a first name, surname, and phone number.");
        return;
      }
      if (!onAddHuman) {
        setError("Cannot create new owners right now.");
        return;
      }
      setSubmitting(true);
      setError("");
      const newHuman = await onAddHuman({ name: oName, surname: oSurname, phone: oPhone });
      if (!newHuman) {
        setSubmitting(false);
        setError("Failed to create new owner.");
        return;
      }
      ownerId = newHuman.id;
    }

    if (!ownerId) {
      setError("Please select or add an owner.");
      return;
    }

    setSubmitting(true);
    setError("");

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
      setError("Failed to add dog. A dog with this name may already exist.");
    }
  };

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="add-dog-title"
      className="bg-white rounded-2xl w-[min(400px,95vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
    >
        {/* Header */}
        <div
          className="px-6 py-5 rounded-t-2xl flex justify-between items-center"
          style={{ background: `linear-gradient(135deg, ${headerTheme.from}, ${headerTheme.to})` }}
        >
          <div id="add-dog-title" className="text-lg font-extrabold" style={{ color: headerTheme.text }}>Add New Dog</div>
          <button
            onClick={onClose}
            className="bg-white/20 border-none rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer text-sm font-bold shrink-0"
            style={{ color: headerTheme.text }}
          >{"\u00D7"}</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-3">
          {/* Name, Gender & Breed */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">Dog Name *</label>
              <input value={name} onChange={(e) => { setName(e.target.value); setError(""); }}
                placeholder="Bella"
                className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
                autoFocus />
            </div>
            <div>
              <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">Gender</label>
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
              <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">Breed *</label>
              <select value={breed} onChange={(e) => {
                const val = e.target.value;
                setBreed(val);
                setError("");
                if (val === "__other__") {
                  if (!sizeOverridden) { setSize(""); setSizeAutoSet(false); }
                } else {
                  const detected = getSizeForBreed(val);
                  if (detected && !sizeOverridden) { setSize(detected); setSizeAutoSet(true); }
                }
              }}
              className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal cursor-pointer">
                <option value="">Select breed</option>
                {SORTED_BREEDS.map(b => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
                <option value="__other__">Other</option>
              </select>
              {isOtherBreed && (
                <input value={customBreed} onChange={(e) => { setCustomBreed(e.target.value); setError(""); }}
                  placeholder="Enter breed..."
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
                  autoFocus />
              )}
            </div>
            <div>
              <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">
                Size *
                {sizeAutoSet && !sizeOverridden && (
                  <span className="font-medium normal-case tracking-normal text-brand-green ml-1.5">auto</span>
                )}
                {!size && breed.trim() && (
                  <span className="font-medium normal-case tracking-normal text-brand-coral ml-1.5">unknown breed</span>
                )}
              </label>
              <select value={size} onChange={(e) => {
                setSize(e.target.value);
                setSizeOverridden(true);
                setSizeAutoSet(false);
              }}
              className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal cursor-pointer"
              style={{
                borderColor: sizeAutoSet && !sizeOverridden ? "#16A34A" : !size && breed.trim() ? "#E8567F" : undefined,
              }}>
                <option value="">Select size</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
          </div>

          {/* DOB */}
          <div>
            <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">Date of Birth</label>
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

          {/* Owner */}
          <div>
            <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">Owner *</label>
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
                    value={ownerQuery}
                    onChange={(e) => { setOwnerQuery(e.target.value); setError(""); }}
                    placeholder="Search by name or phone..."
                    className="w-full px-3.5 py-2.5 pl-[34px] rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
                  />
                  {ownerResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg overflow-hidden bg-white z-10 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
                      {ownerResults.map((h) => {
                        const fullName = h.fullName || `${h.name || ""} ${h.surname || ""}`.trim();
                        return (
                          <div key={h.id || fullName} onMouseDown={() => {
                            setSelectedOwner({ id: h.id || fullName, label: fullName, phone: h.phone || "" });
                            setOwnerQuery(fullName);
                          }}
                          className="px-3.5 py-2.5 cursor-pointer border-b border-slate-200 transition-colors hover:bg-[#E6F5F2]">
                            <div className="text-[13px] font-semibold text-slate-800">{titleCase(fullName)}</div>
                            {h.phone && <div className="text-xs text-slate-500">{h.phone}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {onAddHuman && (
                  <button type="button" onClick={() => { setShowNewOwner(true); setOwnerQuery(""); setSelectedOwner(null); }}
                    className="w-full mt-2 py-2 rounded-lg border-[1.5px] border-brand-teal bg-white text-brand-teal text-xs font-bold cursor-pointer font-inherit transition-all">
                    + Add new owner
                  </button>
                )}
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide mb-2">New Owner</div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text" placeholder="First name" value={newOwnerName}
                    onChange={(e) => setNewOwnerName(e.target.value)} autoFocus
                    className="flex-1 w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
                  />
                  <input
                    type="text" placeholder="Surname" value={newOwnerSurname}
                    onChange={(e) => setNewOwnerSurname(e.target.value)}
                    className="flex-1 w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
                  />
                </div>
                <input
                  type="tel" placeholder="Phone number" value={newOwnerPhone}
                  onChange={(e) => setNewOwnerPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal mb-2"
                />
                <button type="button" onClick={() => {
                  setShowNewOwner(false);
                  setNewOwnerName(""); setNewOwnerSurname(""); setNewOwnerPhone("");
                }}
                className="bg-transparent border-none text-slate-500 text-xs font-semibold cursor-pointer font-inherit p-0">
                  Cancel — search existing instead
                </button>
              </div>
            )}
          </div>

          {/* Groom Notes */}
          <div>
            <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">Groom Notes</label>
            <textarea value={groomNotes} onChange={(e) => setGroomNotes(e.target.value)}
              placeholder="Teddy bear cut, short on ears..." rows={2}
              className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal resize-y" />
          </div>

          {/* Alerts */}
          <div>
            <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1.5">Alerts</label>
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
                  background: hasAllergy ? "#E8567F" : "#FFFFFF",
                  color: hasAllergy ? "#FFFFFF" : "#E8567F",
                  border: "1.5px solid #E8567F",
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

          {error && (
            <div className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-2.5 mt-1">
            <button type="submit" disabled={submitting}
              className="flex-1 py-3 rounded-[10px] border-none text-sm font-bold cursor-pointer font-inherit transition-all disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
              style={{
                background: submitting ? undefined : headerTheme.from,
                color: submitting ? undefined : headerTheme.text,
              }}
              onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = headerTheme.to; }}
              onMouseLeave={(e) => { if (!submitting) e.currentTarget.style.background = headerTheme.from; }}>
              {submitting ? "Adding..." : "Add Dog"}
            </button>
            <button type="button" onClick={onClose}
              className="py-3 px-5 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-slate-500 text-sm font-semibold cursor-pointer font-inherit">
              Cancel
            </button>
          </div>
        </form>
    </AccessibleModal>
  );
}
