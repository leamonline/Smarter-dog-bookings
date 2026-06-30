import { useState } from "react";
import { AccessibleModal } from "../../shared/AccessibleModal.tsx";

// Shown after staff press "Confirm booking" (always — every new booking). Asks
// whether to send the customer a confirmation and over which method. Returns one
// channel code to onConfirm:
//   "auto"     — send via the customer's best available channel (the default)
//   "whatsapp" / "sms" / "email" — force that method (server still respects
//                opt-outs / reachability)
//   "none"     — don't send a confirmation
// The server (notify-booking-confirmed) is the authority; this only records the
// staff choice onto the booking row.
const OPTIONS = [
  { value: "auto", label: "Auto — best method", sub: "Send via the customer's best available channel" },
  { value: "whatsapp", label: "WhatsApp", sub: "Send the WhatsApp confirmation template" },
  { value: "sms", label: "SMS", sub: "Send a text message" },
  { value: "email", label: "Email", sub: "Send an email confirmation" },
  { value: "none", label: "Don't send", sub: "Book without messaging the customer" },
];

export function ConfirmationMethodDialog({ onConfirm, onCancel }) {
  const [choice, setChoice] = useState("auto");

  const Row = ({ value, label, sub }) => {
    const checked = choice === value;
    return (
      <label
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
      >
        <input
          type="radio"
          name="confirmation-method"
          checked={checked}
          onChange={() => setChoice(value)}
          className="w-4 h-4 accent-brand-teal cursor-pointer"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold text-slate-800 truncate">{label}</span>
          <span className="block text-[11px] text-slate-400">{sub}</span>
        </span>
      </label>
    );
  };

  return (
    <AccessibleModal
      onClose={onCancel}
      titleId="confirmation-method-title"
      className="bg-white rounded-2xl shadow-xl mx-4 p-5 max-w-sm w-full max-h-[90vh] overflow-auto animate-[toastIn_0.15s_ease-out]"
      zIndex={1100}
    >
      <h2
        id="confirmation-method-title"
        className="text-base font-bold text-slate-800 m-0 mb-1"
      >
        Send a booking confirmation?
      </h2>
      <p className="text-sm text-slate-600 m-0 mb-3 leading-relaxed">
        Choose how to let the customer know. Auto picks their best contact method.
      </p>

      <div className="flex flex-col gap-1.5">
        {OPTIONS.map((o) => (
          <Row key={o.value} value={o.value} label={o.label} sub={o.sub} />
        ))}
      </div>

      <div className="flex gap-2 justify-end mt-4">
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
        <button type="button" onClick={() => onConfirm(choice)} className="btn btn-primary">
          Confirm booking
        </button>
      </div>
    </AccessibleModal>
  );
}
