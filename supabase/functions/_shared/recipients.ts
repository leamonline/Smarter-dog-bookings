// Shared recipient resolution for the notify-booking-* functions.
//
// A booking can now carry an explicit `notify_human_ids` list (the owner plus
// any trusted humans staff ticked at booking time). When it's set we notify
// exactly those people; when it's null/empty we fall back to the dog's owner —
// the behaviour every booking had before this feature. Each recipient gets
// their own channel choice, message personalisation and notification_log row
// (the idempotency index is keyed on (booking_id, trigger_type, human_id)).

// deno-lint-ignore-file no-explicit-any

export interface RecipientHuman {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: boolean | null;
  sms: boolean | null;
  email: string | null;
  whatsapp_opted_out: boolean | null;
  sms_opted_out: boolean | null;
  email_opted_out: boolean | null;
}

export const HUMAN_CONTACT_COLUMNS =
  "id, name, phone, whatsapp, sms, email, whatsapp_opted_out, sms_opted_out, email_opted_out";

// Resolve the human ids to notify for a booking: the explicit notify_human_ids
// list when present, else just the owner. De-duped; preserves the requested
// order (so a list staff built owner-first stays owner-first).
export function recipientIdsForBooking(
  notifyHumanIds: unknown,
  ownerHumanId: string,
): string[] {
  const explicit = Array.isArray(notifyHumanIds)
    ? (notifyHumanIds.filter((v) => typeof v === "string" && v) as string[])
    : [];
  const ids = explicit.length ? explicit : [ownerHumanId];
  return Array.from(new Set(ids));
}

// Fetch the contact rows for a set of human ids, keyed by id.
export async function fetchHumansByIds(
  supabase: any,
  ids: string[],
): Promise<Map<string, RecipientHuman>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from("humans")
    .select(HUMAN_CONTACT_COLUMNS)
    .in("id", unique);
  if (error || !data) return new Map();
  return new Map((data as RecipientHuman[]).map((h) => [h.id, h]));
}

// Channel preference: WhatsApp -> SMS -> email, skipping any channel the
// customer has opted out of (PECR). null means no usable channel.
export function pickChannel(
  human: RecipientHuman,
): "whatsapp" | "sms" | "email" | null {
  if (human.whatsapp && human.phone && !human.whatsapp_opted_out) return "whatsapp";
  if (human.sms && human.phone && !human.sms_opted_out) return "sms";
  if (human.email && !human.email_opted_out) return "email";
  return null;
}
