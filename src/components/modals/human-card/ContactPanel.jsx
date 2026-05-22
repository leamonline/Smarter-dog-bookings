import { MapPin } from "lucide-react";
import { PanelShell } from "./PanelShell.jsx";

// Compact contact rows: small uppercase prefix label inline with the
// value rather than stacked as its own block. When both fields are
// empty in view mode the panel collapses to a single "Add contact
// details" link that drops the modal into edit mode focused on the
// address input.

function InlineRow({ caption, value }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-xs uppercase tracking-wide font-semibold text-slate-400 shrink-0">
        {caption}
      </span>
      <span
        className={`text-sm break-words min-w-0 ${value ? "text-brand-purple font-semibold" : "text-slate-400 italic"}`}
      >
        {value || "Not on file"}
      </span>
    </div>
  );
}

function FieldInput({ caption, value, onChange, type = "text", placeholder, inputRef }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
        {caption}
      </span>
      <input
        ref={inputRef}
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
  onStartEdit,
  addressInputRef,
  emailInputRef,
}) {
  const hasAddress = !!human.address;
  const hasEmail = !!human.email;
  const hasAny = hasAddress || hasEmail;

  return (
    <PanelShell eyebrow="Contact" icon={MapPin} accent="slate">
      {isEditing ? (
        <div className="flex flex-col gap-2.5">
          <FieldInput
            caption="Address"
            value={editAddress}
            onChange={setEditAddress}
            placeholder="Street, town, postcode"
            inputRef={addressInputRef}
          />
          <FieldInput
            caption="Email"
            type="email"
            value={editEmail}
            onChange={setEditEmail}
            placeholder="name@example.com"
            inputRef={emailInputRef}
          />
        </div>
      ) : !hasAny ? (
        <button
          type="button"
          onClick={onStartEdit}
          className="text-sm font-semibold text-brand-teal-text underline cursor-pointer bg-transparent border-none p-0 font-inherit hover:text-brand-teal transition-colors"
        >
          Add contact details
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <InlineRow caption="Address" value={human.address} />
          <InlineRow caption="Email" value={human.email} />
        </div>
      )}
    </PanelShell>
  );
}
