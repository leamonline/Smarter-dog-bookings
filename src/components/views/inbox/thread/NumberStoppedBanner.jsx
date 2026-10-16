// ============================================================
// src/components/views/inbox/thread/NumberStoppedBanner.jsx
//
// Sits under the conversation header, where WindowClosedBanner goes, when
// WhatsApp sends in this chat are refused because of an opt-out:
//   - the number itself said STOP (rose), which covers a number with no
//     customer record: the re-enable is keyed on the chat's own number;
//   - the linked customer is switched off on this number (slate);
//   - the linked customer is switched off under another number (slate):
//     this number's re-enable cannot reach them, so it points to their
//     profile instead.
// Each button renders only when its handler is passed, so the read-only
// Booking Desk shows the status alone. The dialog stays mounted while it is
// open, even once a refresh clears the status it was opened from. A linked
// record with no name is "the linked customer", never the chat's own number.
// ============================================================

import { useState } from "react";
import { Button } from "../../../ui/index.js";
import {
  conversationWhatsappStop,
  optOutReasonLabel,
  optOutTimeLabel,
} from "../../../../engine/whatsappReenable";
import { ReenableWhatsAppDialog } from "../../../modals/whatsapp-reenable/ReenableWhatsAppDialog.jsx";
import { titleCase } from "../../../../utils/text";

/** WhatsApp sends in this chat are refused because of an opt-out. */
export function isThreadWhatsappStopped(conversation) {
  return conversationWhatsappStop(conversation).kind !== "none";
}

export function NumberStoppedBanner({ conversation, onReenabled, onOpenHuman }) {
  const [open, setOpen] = useState(false);
  const stop = conversationWhatsappStop(conversation);
  const name = stop.name ? titleCase(stop.name) : null;
  const numberStopped = stop.kind === "number_stop";

  let lead = null;
  let followOn = null;
  if (numberStopped) {
    const again =
      stop.lastStopAt && stop.lastStopAt !== stop.firstStopAt
        ? ` It said STOP again on ${optOutTimeLabel(stop.lastStopAt)}.`
        : "";
    lead = `This number said STOP on ${optOutTimeLabel(stop.firstStopAt)}.${again}`;
    followOn =
      "Nothing can be sent to it on WhatsApp — replies, templates and reminders are all blocked — until the customer gives permission again.";
  } else if (stop.kind !== "none") {
    lead = `WhatsApp is switched off for ${name ?? "the linked customer"}.`;
    followOn =
      stop.kind === "record_off"
        ? `${optOutReasonLabel(stop.reason)} · since ${optOutTimeLabel(stop.since)}. Nothing can be sent in this chat until it’s switched back on.`
        : "This chat is linked to them, but their record has a different number, so sends here are blocked too. Review it on their profile.";
  }
  const canReenable = Boolean(onReenabled) && (numberStopped || stop.kind === "record_off");
  const canOpenProfile = Boolean(onOpenHuman) && stop.kind === "record_other_number";

  return (
    <>
      {lead && (
        <div
          role="status"
          className={`shrink-0 flex items-start gap-2 px-4 py-2 border-b text-[12px] leading-snug ${
            numberStopped ? "bg-rose-50 border-rose-200 text-rose-900" : "bg-slate-50 border-slate-200 text-slate-800"
          }`}
        >
          <span aria-hidden="true" className="mt-px">⛔</span>
          <div className="min-w-0">
            <p className="m-0">
              <span className="font-bold">{lead}</span> <span>{followOn}</span>
            </p>
            {canReenable && (
              <Button variant="ghost" size="sm" className="mt-1.5" onClick={() => setOpen(true)}>
                Switch WhatsApp back on…
              </Button>
            )}
            {canOpenProfile && (
              <Button variant="ghost" size="sm" className="mt-1.5" onClick={() => onOpenHuman(stop.humanId)}>
                {name ? `Open ${name}’s profile` : "Open their profile"}
              </Button>
            )}
          </div>
        </div>
      )}
      {open && (
        <ReenableWhatsAppDialog
          phone={conversation?.phone_e164 ?? ""}
          context="inbox"
          currentHumanId={conversation?.human_id ?? null}
          observedLastStopAt={conversation?.whatsapp_last_stop_at ?? null}
          linkedElsewhere={stop.linkedElsewhere ? { id: stop.linkedElsewhere.id, name } : null}
          onOpenHuman={onOpenHuman}
          onReenabled={onReenabled}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
