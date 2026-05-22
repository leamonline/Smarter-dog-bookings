import { MapPin } from "lucide-react";
import { PanelShell } from "./PanelShell.jsx";

// Address + email shown as "tiny uppercase caption above, value below"
// — the same hierarchy the DayHeader and dashboard panels use.
// Replaces the previous label/value table that read as a settings dialog.

function FieldStack({ caption, value, placeholder = "Not on file" }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        {caption}
      </div>
      <div
        className={`text-sm mt-0.5 ${value ? "text-brand-purple font-semibold" : "text-slate-400 italic font-normal"} break-words`}
      >
        {value || placeholder}
      </div>
    </div>
  );
}

function FieldInput({ caption, value, onChange, type = "text", placeholder }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
        {caption}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={caption}
        className="mt-1 w-full py-1.5 px-2.5 rounded-control border border-slate-200 text-sm font-semibold font-inherit outline-none text-brand-purple bg-white focus:border-brand-teal transition-colors"
      />
    </label>
  );
}

export function ContactPanel({
  isEditing,
  human,
  editAddress,
  setEditAddress,
  editEmail,
  setEditEmail,
}) {
  return (
    <PanelShell eyebrow="Contact" icon={MapPin} accent="slate">
      {isEditing ? (
        <div className="flex flex-col gap-3">
          <FieldInput
            caption="Address"
            value={editAddress}
            onChange={setEditAddress}
            placeholder="Street, town, postcode"
          />
          <FieldInput
            caption="Email"
            type="email"
            value={editEmail}
            onChange={setEditEmail}
            placeholder="name@example.com"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <FieldStack caption="Address" value={human.address} />
          <FieldStack caption="Email" value={human.email} />
        </div>
      )}
    </PanelShell>
  );
}
