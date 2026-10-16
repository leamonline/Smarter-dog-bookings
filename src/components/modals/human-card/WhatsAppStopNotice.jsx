// The profile's "WhatsApp is off" notice, at the top of the card so staff
// see it before they message or book. Rose for a STOP (the customer asked),
// slate for an opt-out with any other reason. Its button opens the audited
// re-enable dialog; there is no plain untick anywhere in the app.
//
// The dialog stays mounted while it is open even once the notice itself has
// gone: a successful re-enable patches this human straight away, and the
// dialog must still finish (toast, then close) rather than vanish mid-flow.
import { useState } from "react";
import { Button } from "../../ui/index.js";
import { STOP_REASON, optOutReasonLabel, optOutTimeLabel } from "../../../engine/whatsappReenable";
import { titleCase } from "../../../utils/text";
import { ReenableWhatsAppDialog } from "../whatsapp-reenable/ReenableWhatsAppDialog.jsx";

export function WhatsAppStopNotice({ human, onOpenHuman, onReenabled }) {
  const [open, setOpen] = useState(false);
  const optedOut = human?.whatsappOptedOut === true;
  const stopped = human?.whatsappOptedOutReason === STOP_REASON;
  const since = optOutTimeLabel(human?.whatsappOptedOutAt);
  const canReenable = Boolean(human?.id) && (human?.phone || "").trim() !== "";

  return (
    <>
      {optedOut && (
        <div
          role="status"
          className={`mb-3 rounded-xl border px-3.5 py-2.5 text-[13px] leading-snug ${
            stopped ? "border-rose-200 bg-rose-50 text-rose-900" : "border-slate-200 bg-slate-50 text-slate-800"
          }`}
        >
          <p className="m-0 font-bold">
            {stopped ? "WhatsApp is off — they said STOP." : "WhatsApp is switched off for this customer."}
          </p>
          <p className="m-0 mt-0.5">
            {stopped
              ? `On ${since}. Nothing can be sent to this number on WhatsApp — replies, templates or reminders — until they give permission again.`
              : `${optOutReasonLabel(human.whatsappOptedOutReason)} · since ${since}. Nothing can be sent to this number on WhatsApp until it’s switched back on.`}
          </p>
          {canReenable ? (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOpen(true)}>
              Switch WhatsApp back on…
            </Button>
          ) : (
            <p className="m-0 mt-1.5">
              There’s no phone number on this record, so WhatsApp can’t be switched back on from here. Add their
              number first.
            </p>
          )}
        </div>
      )}
      {open && (
        <ReenableWhatsAppDialog
          phone={human.phone}
          context="profile"
          currentHumanId={human.id}
          currentHumanName={titleCase(human.fullName || "")}
          onOpenHuman={onOpenHuman}
          onReenabled={(result) => onReenabled?.(result.humanIds)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
