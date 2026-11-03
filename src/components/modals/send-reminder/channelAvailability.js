// ============================================================
// src/components/modals/send-reminder/channelAvailability.js
//
// Which channels the staff reminder modal offers for a customer, and why not.
// Pure, so the consent rules here are unit-tested without rendering the modal.
// ============================================================

import { normaliseUkMobile } from "../../../utils/phone.js";
import { blockReason, blockText } from "../../../../supabase/functions/_shared/channelPolicy";

// The same rules the server applies in reminder-send (and every notification
// function): the shared messaging policy, supabase/functions/_shared/channelPolicy.ts.
// SMS is a required operational channel, so the optional "SMS reminders" tickbox
// isn't needed; an opt-out, or a STOP staff haven't yet clarified, still blocks
// it. The server re-checks; this is so the pills say why up front.
export function computeAvailability(human) {
  if (!human) {
    const reason = "No customer linked to this booking";
    return {
      whatsapp: { ok: false, reason },
      sms: { ok: false, reason },
      email: { ok: false, reason },
    };
  }
  const phoneValid = !!normaliseUkMobile(human.phone || "");
  const contact = { ...human, phone: phoneValid ? human.phone : null };
  const check = (channel) => {
    const reason = blockReason(contact, channel);
    return reason ? { ok: false, reason: blockText(channel, reason) } : { ok: true, reason: "" };
  };
  return { whatsapp: check("whatsapp"), sms: check("sms"), email: check("email") };
}
