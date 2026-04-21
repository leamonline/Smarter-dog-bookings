import { useMemo, useState } from "react";
import { useToast } from "../../contexts/ToastContext.jsx";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { IconSearch } from "../icons/index.jsx";
import { titleCase } from "../../utils/text.js";
import { getHumanByIdOrName } from "../../engine/bookingRules.js";

export function AddHumanModal({ onClose, onAdd, dogs, humans, onUpdateDog }) {
  const toast = useToast();

  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [sms, setSms] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [dogQuery, setDogQuery] = useState("");
  const [selectedDogIds, setSelectedDogIds] = useState([]);

  const dogList = useMemo(() => {
    if (!dogs) return [];
    return Object.values(dogs);
  }, [dogs]);

  const selectedDogs = useMemo(() => {
    if (!dogs) return [];
    return selectedDogIds
      .map((id) => dogList.find((d) => (d.id || d.name) === id))
      .filter(Boolean);
  }, [selectedDogIds, dogList, dogs]);

  const dogSearchResults = useMemo(() => {
    if (!dogQuery.trim()) return [];
    const q = dogQuery.toLowerCase().trim();
    return dogList
      .filter((d) => !selectedDogIds.includes(d.id || d.name))
      .filter((d) => {
        const name = (d.name || "").toLowerCase();
        const breed = (d.breed || "").toLowerCase();
        return name.includes(q) || breed.includes(q);
      })
      .slice(0, 6);
  }, [dogQuery, dogList, selectedDogIds]);

  const addDog = (dog) => {
    setSelectedDogIds((ids) => [...ids, dog.id || dog.name]);
    setDogQuery("");
  };

  const removeDog = (id) => {
    setSelectedDogIds((ids) => ids.filter((x) => x !== id));
  };

  const ownerLabelFor = (dog) => {
    if (!humans) return "";
    const owner = getHumanByIdOrName(humans, dog._humanId || dog.humanId);
    if (!owner) return "";
    return owner.fullName || `${owner.name || ""} ${owner.surname || ""}`.trim();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !surname.trim() || !phone.trim()) {
      setError("First name, surname, and phone number are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    const result = await onAdd({
      name: name.trim(),
      surname: surname.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      sms,
      whatsapp,
      notes: notes.trim(),
    });
    const newHumanId = result?.id || result?.[0]?.id;
    if (result && newHumanId && onUpdateDog && selectedDogs.length > 0) {
      await Promise.all(
        selectedDogs.map((dog) =>
          onUpdateDog(dog.id || dog.name, { humanId: newHumanId }),
        ),
      );
    }
    setSubmitting(false);
    if (result) {
      const fullName = [name.trim(), surname.trim()].filter(Boolean).join(" ");
      const suffix = selectedDogs.length > 0
        ? ` with ${selectedDogs.length} dog${selectedDogs.length === 1 ? "" : "s"}`
        : "";
      toast.show(fullName ? `${fullName} added${suffix}` : `Customer added${suffix}`, "success");
      onClose();
    } else {
      toast.show("Could not add customer", "error");
      setError("Failed to add human. They may already exist.");
    }
  };

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="add-human-title"
      className="bg-white rounded-2xl w-[min(400px,95vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
    >
        {/* Header */}
        <div
          className="px-6 py-5 rounded-t-2xl flex justify-between items-center"
          style={{ background: "linear-gradient(135deg, #2D8B7A, #236b5d)" }}
        >
          <div id="add-human-title" className="text-lg font-extrabold text-white">Add New Human</div>
          <button onClick={onClose} className="bg-white/20 border-none rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer text-sm font-bold text-white shrink-0">{"\u00D7"}</button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="px-6 py-5 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">First Name *</label>
              <input value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="Sarah"
                autoComplete="off"
                className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
                autoFocus />
            </div>
            <div>
              <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">Surname *</label>
              <input value={surname} onChange={e => { setSurname(e.target.value); setError(""); }} placeholder="Jones"
                autoComplete="off"
                className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">Phone *</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 900111"
              autoComplete="off"
              className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal" />
          </div>

          <div>
            <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="sarah@example.com"
              autoComplete="off"
              className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal" />
          </div>

          <div>
            <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St"
              autoComplete="off"
              className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal" />
          </div>

          <div className="flex gap-5">
            <label className="flex items-center gap-1.5 text-[13px] cursor-pointer font-medium">
              <input type="checkbox" checked={sms} onChange={e => setSms(e.target.checked)}
                className="accent-brand-teal w-[18px] h-[18px] cursor-pointer" />
              SMS
            </label>
            <label className="flex items-center gap-1.5 text-[13px] cursor-pointer font-medium">
              <input type="checkbox" checked={whatsapp} onChange={e => setWhatsapp(e.target.checked)}
                className="accent-brand-teal w-[18px] h-[18px] cursor-pointer" />
              WhatsApp
            </label>
          </div>

          {/* Link dogs */}
          {dogs && onUpdateDog && (
            <div>
              <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">
                Dogs they own
                <span className="font-medium normal-case tracking-normal text-slate-400 ml-1.5">optional</span>
              </label>
              {selectedDogs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {selectedDogs.map((dog) => (
                    <span
                      key={dog.id || dog.name}
                      className="inline-flex items-center gap-1.5 bg-brand-cyan-light/20 text-brand-cyan-dark border border-brand-cyan-light px-2 py-1 rounded-full text-[12px] font-bold"
                    >
                      {titleCase(dog.name)}
                      <button
                        type="button"
                        onClick={() => removeDog(dog.id || dog.name)}
                        aria-label={`Remove ${dog.name}`}
                        className="w-4 h-4 flex items-center justify-center rounded-full bg-brand-cyan-dark/10 hover:bg-brand-cyan-dark/25 text-brand-cyan-dark text-[11px] font-bold cursor-pointer border-none"
                      >
                        {"\u00D7"}
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex pointer-events-none">
                  <IconSearch size={14} colour="#6B7280" />
                </div>
                <input
                  type="text"
                  value={dogQuery}
                  onChange={(e) => setDogQuery(e.target.value)}
                  placeholder="Search dogs by name or breed..."
                  autoComplete="off"
                  className="w-full px-3.5 py-2.5 pl-[34px] rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
                />
                {dogSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg overflow-hidden bg-white z-10 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
                    {dogSearchResults.map((dog) => {
                      const ownerLabel = ownerLabelFor(dog);
                      return (
                        <div
                          key={dog.id || dog.name}
                          onMouseDown={() => addDog(dog)}
                          className="px-3.5 py-2 cursor-pointer border-b border-slate-200 transition-colors hover:bg-slate-50"
                        >
                          <div className="text-[13px] font-semibold text-slate-800">
                            {titleCase(dog.name)}
                            {dog.breed && (
                              <span className="font-normal text-slate-400 ml-1">
                                ({titleCase(dog.breed)})
                              </span>
                            )}
                          </div>
                          {ownerLabel && (
                            <div className="text-[11px] text-brand-coral font-semibold">
                              Currently owned by {titleCase(ownerLabel)} — will transfer
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes about this person..." rows={2}
              className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal resize-y" />
          </div>

          {error && (
            <div className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-2.5 mt-1">
            <button type="submit" disabled={submitting}
              className="flex-1 py-3 rounded-[10px] border-none bg-brand-teal text-white text-sm font-bold cursor-pointer font-inherit transition-all hover:bg-[#236b5d] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed">
              {submitting ? "Adding..." : "Add Human"}
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
