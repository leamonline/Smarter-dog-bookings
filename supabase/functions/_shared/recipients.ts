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

export interface BookingConfirmationRecord {
  confirmation_channel?: unknown;
  deposit_required?: unknown;
  deposit_received_at?: unknown;
  payment?: unknown;
}

/**
 * After the caller has checked the booking is active, decide whether the
 * ordinary "booked in / see you then" confirmation is truthful. Deposit-held
 * appointments must wait for the dedicated deposit message project rather
 * than receive the ordinary confirmation template.
 */
export function bookingConfirmationSkipReason(
  booking: BookingConfirmationRecord,
): string | null {
  if (booking.confirmation_channel === "none") {
    return "confirmation suppressed for this booking";
  }
  const awaitingDeposit =
    booking.deposit_required === true &&
    booking.deposit_received_at == null &&
    booking.payment !== "Deposit Paid" &&
    booking.payment !== "Paid in Full";
  return awaitingDeposit ? "booking is awaiting deposit" : null;
}

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

export type NotifyChannel = "whatsapp" | "sms" | "email";

// Can this customer be reached on a specific channel right now? Encodes the
// per-channel rule once: the channel must be set up, have the contact detail it
// needs, and not be opted out (PECR). Used when staff force a specific channel
// (confirmation_channel = 'whatsapp'|'sms'|'email') so an opt-out still wins.
export function channelAvailableFor(
  human: RecipientHuman,
  channel: NotifyChannel,
): boolean {
  switch (channel) {
    case "whatsapp":
      return !!(human.whatsapp && human.phone && !human.whatsapp_opted_out);
    case "sms":
      return !!(human.sms && human.phone && !human.sms_opted_out);
    case "email":
      return !!(human.email && !human.email_opted_out);
    default:
      return false;
  }
}

// Channel preference: WhatsApp -> SMS -> email, skipping any channel the
// customer has opted out of (PECR). null means no usable channel.
export function pickChannel(human: RecipientHuman): NotifyChannel | null {
  if (channelAvailableFor(human, "whatsapp")) return "whatsapp";
  if (channelAvailableFor(human, "sms")) return "sms";
  if (channelAvailableFor(human, "email")) return "email";
  return null;
}

// Resolve the channel a confirmation should go out on for ONE recipient, given
// the booking-level staff choice (bookings.confirmation_channel):
//   'auto' (or anything unexpected) -> best available channel (pickChannel)
//   'whatsapp'/'sms'/'email'        -> that channel ONLY if reachable + not
//                                      opted out — no silent fallback, because
//                                      staff made an explicit choice and an
//                                      opt-out is a hard stop.
// 'none' is a booking-level suppression handled by the caller before the
// recipient loop; if passed here it resolves to a skip.
export function resolveConfirmationChannel(
  choice: string,
  human: RecipientHuman,
): { channel: NotifyChannel } | { channel: null; skip: string } {
  if (choice === "none") return { channel: null, skip: "confirmation suppressed" };
  if (choice === "whatsapp" || choice === "sms" || choice === "email") {
    return channelAvailableFor(human, choice)
      ? { channel: choice }
      : { channel: null, skip: `cannot reach on ${choice}` };
  }
  const channel = pickChannel(human);
  return channel ? { channel } : { channel: null, skip: "no contact method" };
}
