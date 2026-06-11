import { Copy, MapPin } from "lucide-react";
import { PanelShell } from "../shell/PanelShell.jsx";
import { useToast } from "../../../contexts/ToastContext.jsx";

// Compact contact rows: small uppercase prefix label inline with the
// value rather than stacked as its own block. Each populated row carries
// a hover-revealed copy button (mirrors the header's copy-phone). When both
// fields are empty in view mode the panel collapses to a single "Add
// contact details" link that drops the modal into edit mode focused on the
// address input.

function InlineRow({ caption, value, onCopy }) {
  return (
    <div className="group flex items-center gap-2 min-w-0">
      <span className="text-xs uppercase tracking-wide font-semibold text-slate-400 shrink-0">
        {caption}
      </span>
      <span
        className={`text-sm break-words min-w-0 ${value ? "text-brand-purple font-semibold" : "text-slate-400 italic"}`}
      >
        {value || "Not on file"}
      </span>
      {value && onCopy && (
        <button
          type="button"
          onClick={() => onCopy(value, caption)}
          aria-label={`Copy ${caption.toLowerCase()}`}
          title="Copy to clipboard"
          className="ml-auto shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-transparent border-none cursor-pointer text-slate-400 hover:text-brand-purple hover:bg-slate-100 transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Copy size={12} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
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
  const toast = useToast();
  const hasAddress = !!human.address;
  const hasEmail = !!human.email;
  const hasAny = hasAddress || hasEmail;

  // Mirror handleCopyPhone's toast pattern from the modal header.
  const handleCopy = (value, label) => {
    if (!value) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value);
      toast.show(`Copied ${label.toLowerCase()}`, "success");
    } else {
      toast.show("Clipboard not available", "error");
    }
  };

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
          <InlineRow caption="Address" value={human.address} onCopy={handleCopy} />
          <InlineRow caption="Email" value={human.email} onCopy={handleCopy} />
        </div>
      )}
    </PanelShell>
  );
}
