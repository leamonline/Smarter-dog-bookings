import { useState } from "react";
import { useToast } from "../../contexts/ToastContext.jsx";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";

export function AddHumanModal({ onClose, onAdd }) {
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
    setSubmitting(false);
    if (result) {
      const fullName = [name.trim(), surname.trim()].filter(Boolean).join(" ");
      toast.show(fullName ? `${fullName} added` : "Customer added", "success");
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
