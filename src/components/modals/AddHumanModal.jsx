import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useToast } from "../../contexts/ToastContext.jsx";
import { ModalShell, HeaderIconButton } from "./shell/index.js";
import { IconSearch } from "../icons/index.jsx";
import { InlineError } from "../ui/InlineError.jsx";
import { titleCase, isRealPersonName } from "../../utils/text";
import { getHumanByIdOrName } from "../../engine/bookingRules";
import { validateContactPhone } from "./dog-card/helpers.js";
import { formatPhoneForDisplay } from "../../utils/phone.js";
import { logger } from "../../lib/logger";

export function AddHumanModal({ onClose, onAdd, dogs, humans, onUpdateDog, findHumanByFullName }) {
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
  // Existing customer with the same (name, surname), surfaced as a soft,
  // non-blocking warning before we create a potential duplicate. Null means
  // no clash (or not yet checked); it's cleared whenever the name is edited.
  const [duplicate, setDuplicate] = useState(null);

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
      setError("We need a first name, surname, and phone number.");
      return;
    }
    // A placeholder ("?", "-", "n/a"…) is unfindable later — ask for the
    // real name now rather than leaving a mystery customer in the books.
    if (!isRealPersonName(name)) {
      setError("That first name doesn't look like a name — we need their real one so we can find them again.");
      return;
    }
    // A UK mobile is normalised to E.164; a mobile-shaped number with the wrong
    // digit count is rejected (it would pass a naive digit-count check and then
    // silently fail to deliver on WhatsApp/SMS); landlines/non-UK pass through.
    const { value: normalisedPhone, error: phoneError } = validateContactPhone(phone);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    // Soft duplicate guard. The DB no longer enforces a unique (name, surname),
    // so a same-named customer would otherwise be created silently. Surface any
    // existing match once and let the user decide — two real people can share a
    // name, so this never hard-blocks. A second submit (duplicate already set)
    // goes through as "Add anyway". findHumanByFullName queries the DB directly,
    // so it also catches customers paginated out of the local `humans` map.
    if (!duplicate && findHumanByFullName) {
      try {
        const existing = await findHumanByFullName(name.trim(), surname.trim());
        if (existing) {
          setDuplicate(existing);
          return;
        }
      } catch (lookupErr) {
        // Never block adding on a lookup failure — log and carry on.
        logger.error("findHumanByFullName failed:", lookupErr);
      }
    }
    setSubmitting(true);
    setError("");
    let result;
    try {
      result = await onAdd({
        name: name.trim(),
        surname: surname.trim(),
        phone: normalisedPhone,
        email: email.trim(),
        address: address.trim(),
        sms,
        whatsapp,
        notes: notes.trim(),
      });
    } catch (err) {
      setSubmitting(false);
      const msg = err?.message || "That didn't quite work — let's try again.";
      toast.show(msg, "error");
      setError(msg);
      return;
    }
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
      toast.show(fullName ? `${fullName} saved${suffix}` : `Customer saved${suffix}`, "success");
      onClose();
    } else {
      toast.show("Couldn't save that just now", "error");
      setError("That didn't quite work — let's try again.");
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      titleId="add-human-title"
      accent="var(--color-brand-teal)"
      widthClass="w-[min(420px,95vw)]"
      maxHeightClass="max-h-[90vh]"
      rootClassName="bm-fields"
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex-1 min-w-0">
            <span className="text-label text-ink-muted">
              New customer
            </span>
            <h2
              id="add-human-title"
              className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1"
            >
              Add New Human
            </h2>
          </div>
          <HeaderIconButton label="Close add human" onClick={onClose}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
      footer={
        <div className="border-t border-slate-100 bg-white px-6 py-3 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 max-sm:min-h-[44px] rounded-control border-[1.5px] border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50 inline-flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-human-form"
            disabled={submitting}
            className="ml-auto px-5 py-2 max-sm:min-h-[44px] rounded-full border-none bg-action text-on-action text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-brand-yellow-dark disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed inline-flex items-center justify-center"
          >
            {submitting ? "Adding..." : duplicate ? "Add anyway" : "Add Human"}
          </button>
        </div>
      }
    >
        <form id="add-human-form" onSubmit={handleSubmit} autoComplete="off" className="px-6 py-5 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="add-human-first" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">First Name *</label>
              <input id="add-human-first" value={name} onChange={e => { setName(e.target.value); setError(""); setDuplicate(null); }} placeholder="Sarah"
                autoComplete="off"
                className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
                autoFocus />
            </div>
            <div>
              <label htmlFor="add-human-surname" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Surname *</label>
              <input id="add-human-surname" value={surname} onChange={e => { setSurname(e.target.value); setError(""); setDuplicate(null); }} placeholder="Jones"
                autoComplete="off"
                className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal" />
            </div>
          </div>

          <div>
            <label htmlFor="add-human-phone" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Phone *</label>
            <input id="add-human-phone" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 900111"
              autoComplete="off"
              className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal" />
          </div>

          <div>
            <label htmlFor="add-human-email" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Email</label>
            <input id="add-human-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="sarah@example.com"
              autoComplete="off"
              className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal" />
          </div>

          <div>
            <label htmlFor="add-human-address" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Address</label>
            <input id="add-human-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St"
              autoComplete="off"
              className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal" />
          </div>

          <div className="flex gap-5">
            <label className="flex items-center gap-1.5 min-h-[44px] text-[13px] cursor-pointer font-medium">
              <input type="checkbox" checked={sms} onChange={e => setSms(e.target.checked)}
                className="accent-brand-teal w-[18px] h-[18px] cursor-pointer" />
              SMS
            </label>
            <label className="flex items-center gap-1.5 min-h-[44px] text-[13px] cursor-pointer font-medium">
              <input type="checkbox" checked={whatsapp} onChange={e => setWhatsapp(e.target.checked)}
                className="accent-brand-teal w-[18px] h-[18px] cursor-pointer" />
              WhatsApp
            </label>
          </div>

          {/* Link dogs */}
          {dogs && onUpdateDog && (
            <div>
              <label className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">
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
                  aria-label="Search dogs to link"
                  autoComplete="off"
                  className="w-full px-3.5 py-2.5 pl-[34px] rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
                />
                {dogSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg overflow-hidden bg-white z-10 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
                    {dogSearchResults.map((dog) => {
                      const ownerLabel = ownerLabelFor(dog);
                      return (
                        <button
                          type="button"
                          key={dog.id || dog.name}
                          onMouseDown={() => addDog(dog)}
                          onClick={() => addDog(dog)}
                          className="w-full text-left bg-white px-3.5 py-2 cursor-pointer border-x-0 border-t-0 border-b border-slate-200 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50"
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
                              {titleCase(ownerLabel)}'s dog — we'll move them over if you want.
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes about this person..." rows={2}
              className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal resize-y" />
          </div>

          {duplicate && (
            <div role="alert" className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-900">
              A customer called{" "}
              <strong>{duplicate.fullName || `${duplicate.name} ${duplicate.surname}`.trim()}</strong>
              {duplicate.phone ? ` (${formatPhoneForDisplay(duplicate.phone)})` : ""} already exists.
              Two people can share a name — press <strong>Add anyway</strong> if this is someone new, or tweak the name to be sure.
            </div>
          )}

          <InlineError message={error} />
        </form>
    </ModalShell>
  );
}
