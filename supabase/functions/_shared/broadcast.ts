// Pure logic for the broadcast-message function (day-closure broadcast).
// Kept free of Deno/HTTP imports so it runs under `deno test` (and Vitest).

import { recipientIdsForBooking, type RecipientHuman } from "./recipients.ts";

export interface BroadcastBookingRow {
  id: string;
  notify_human_ids: string[] | null;
  dogs: { human_id: string; name: string } | { human_id: string; name: string }[] | null;
}

// WhatsApp → SMS only (no email). Channel-appropriate fallback: WhatsApp if
// usable and not opted out, else SMS if usable and not opted out, else null
// (opted out of both / no number) — the caller surfaces those to staff.
export function pickChannelWaSms(human: RecipientHuman): "whatsapp" | "sms" | null {
  if (human.whatsapp && human.phone && !human.whatsapp_opted_out) return "whatsapp";
  if (human.sms && human.phone && !human.sms_opted_out) return "sms";
  return null;
}

// The SMS / inbox text. WhatsApp uses the Meta template with [firstName, reason]
// as the body variables; this mirrors that wording for SMS and the audit log.
// Keep in sync with the day_closure_v1 template body (whatsapp_templates row,
// seeded/updated by migration) and the modal caption.
export function renderMessage(firstName: string, reason: string): string {
  return `Hi ${firstName}, an important update about your grooming appointment at Smarter Dog Grooming Salon: ${reason}. Please reply to this message and we'll help with whatever you need.`;
}

// One message per recipient per day: union each booking's notify list (owner by
// default), keeping a DETERMINISTIC representative booking id per recipient
// (smallest uuid) so the (booking_id, trigger_type, human_id) idempotency claim
// is stable across re-runs. Bookings whose dog has no owner are skipped.
export function buildRepByHuman(rows: BroadcastBookingRow[]): Map<string, string> {
  const repByHuman = new Map<string, string>();
  for (const r of rows) {
    const dog = Array.isArray(r.dogs) ? r.dogs[0] : r.dogs;
    const ownerId = dog?.human_id;
    if (!ownerId) continue;
    for (const hid of recipientIdsForBooking(r.notify_human_ids, ownerId)) {
      const cur = repByHuman.get(hid);
      if (!cur || r.id < cur) repByHuman.set(hid, r.id);
    }
  }
  return repByHuman;
}
