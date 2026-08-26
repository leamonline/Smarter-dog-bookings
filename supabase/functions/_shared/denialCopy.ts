// Customer-facing copy for a booking-gate rejection — Deno mirror.
//
// WHY THIS EXISTS
//
// MIRRORS src/engine/denials.ts (mapDenialReason + friendlyDenialMessage).
// The WhatsApp Flow runs in Deno and cannot import the frontend engine, so the
// mapper and the copy table are hand-mirrored here, guarded by
// src/lib/whatsapp/denialCopyParity.test.ts.
//
// The portal booking wizard has always routed a P0001 gate message through
// friendlyDenialMessage before showing it. The Flow did not: it passed the raw
// message straight to the BOOKING_FAILED / SELECT_TIME_RETRY screens, so a
// WhatsApp customer could read "Capped at 1 (2-2-1 rule)", "Back-to-back large
// dogs only allowed at 12:30 + 13:00", or "Day is fully booked: 2026-08-25
// already has 14 dog(s) (maximum 14 per day)" — engineer text, a 24-hour clock
// the portal never shows a customer, and the salon's daily cap and current
// load. Both Flow screens were designed for friendly copy (their own
// __example__ values in whatsapp-flows/appointment-booking.json are warm
// sentences), so the raw text was a leak, not a decision.
//
// THE WORDING RULE THIS FILE IMPLEMENTS (ADR 008)
//
// A customer is told what to do next, never why the rule exists. No
// customer-facing refusal names a rule, prints a clock time, or quotes a
// capacity number. The raw message is still logged verbatim as reason_detail
// and still drives the reason code — only the on-screen text changes.
//
// The copy matches src/engine/denials.ts except where the channel changes what
// "contact us" means: inside WhatsApp, "message us on WhatsApp" would be odd,
// so those lines say "just reply here" instead.

// The complete reason vocabulary, mirroring the keys of DENIAL_REASON_LABELS in
// src/engine/denials.ts. A code emitted by a gate is validated against this
// before it is trusted, so a DETAIL carrying anything else falls through to the
// prose patterns rather than inventing a category.
export const KNOWN_DENIAL_CODES: ReadonlySet<string> = new Set([
  "capacity_2_2_1", "daily_cap", "slot_full", "seat_blocked",
  "large_dog_ineligible", "calendar_closed", "past_date", "past_cutoff",
  "pregnant", "customer_slot_blocked", "double_booked", "unavailable", "unknown",
]);

/**
 * Categorise a booking-gate rejection into a reason code.
 * MIRRORS mapDenialReason in src/engine/denials.ts, which is the source of
 * truth.
 *
 * Since migration 20260825120000 the gates EMIT their code in DETAIL (#665),
 * so `details` is used directly when it names a known code. The message
 * patterns remain the documented fallback — for a gate deliberately left bare,
 * and for a database not yet carrying that migration. Order matters: more
 * specific patterns first.
 */
export function mapDenialReason(
  message?: string | null,
  details?: string | null,
): string {
  // Emitted beats inferred. Guarded against a DETAIL used for anything else:
  // only a value that is one of our codes is trusted.
  const emitted = (details || "").trim();
  if (emitted && KNOWN_DENIAL_CODES.has(emitted)) {
    return emitted;
  }
  const m = (message || "").toLowerCase();
  if (!m) return "unknown";
  if (m.includes("pregnant")) return "pregnant";
  // enforce_human_slot_blocks (migration 20260714120000): the owner's
  // blocked_slots gate. "for your account" is unique to that message.
  if (m.includes("for your account")) return "customer_slot_blocked";
  if (m.includes("2-2-1")) return "capacity_2_2_1";
  if (m.includes("fully booked") && m.includes("per day")) return "daily_cap";
  if (m.includes("slot is full")) return "slot_full";
  if (/large dog|large dogs|back-to-back|small\/medium dog can share|early close|conditional:/.test(m)) {
    return "large_dog_ineligible";
  }
  // Both same-day refusals from validate_booking_calendar. "too close to the
  // start time" is the 30-minute cutoff and used to match nothing here, so it
  // fell through to "unknown" — which #681 makes fail closed, denying those
  // customers the alternative times that past_cutoff exists to offer.
  if (m.includes("same-day") || m.includes("too close to the start time")) return "past_cutoff";
  if (m.includes("in the past")) return "past_date";
  if (m.includes("blocked")) return "seat_blocked";
  if (m.includes("closed")) return "calendar_closed";
  if (m.includes("twice") || m.includes("already booked") || m.includes("duplicate")) {
    return "double_booked";
  }
  if (m.includes("invalid slot")) return "unavailable";
  return "unknown";
}

/**
 * Reason codes that a DIFFERENT TIME ON THE SAME DAY could actually resolve.
 *
 * The Flow's only recovery offer is SELECT_TIME_RETRY — a list of other slots
 * on the date the customer already picked. Whether that helps depends entirely
 * on which gate refused, and `P0001` does not distinguish them: it is
 * Postgres' generic raise_exception code, shared by the capacity trigger, the
 * pregnancy gate, the per-customer slot block and the dog-integrity check
 * (issue #680). Keying the retry on the SQLSTATE alone offered a pregnant dog's
 * owner a list of times, every one of which fails identically.
 *
 * Flow-only, so deliberately NOT mirrored in src/engine/denials.ts: the portal
 * wizard shows a message and lets the customer navigate, it has no equivalent
 * retry screen to gate.
 *
 * Excluded, and why another time cannot help:
 *   pregnant        — the dog cannot be booked online at all
 *   daily_cap       — the whole DAY is full, so every slot on it fails
 *   calendar_closed — the salon is closed that day
 *   past_date       — the date has already gone
 *   unknown         — unrecognised refusal; fail closed rather than loop the
 *                     customer through slots that may all reject
 */
export const RETRYABLE_DENIAL_REASONS: ReadonlySet<string> = new Set([
  // Per-slot capacity: a different slot may well have room.
  "capacity_2_2_1",
  "slot_full",
  "seat_blocked",
  "large_dog_ineligible",
  // Invalid slot — picking a real one is exactly the fix.
  "unavailable",
  // Same-day cutoff: a later slot today can still be far enough out.
  "past_cutoff",
  // The unique constraint is (dog_id, booking_date, slot), so the same dog at
  // a different slot on the same day is allowed.
  "double_booked",
  // The owner's blocked_slots gate is per-slot, not per-day.
  "customer_slot_blocked",
]);

/** Whether the Flow should offer other times on the same day for this refusal. */
export function canRetryAnotherTime(
  message?: string | null,
  details?: string | null,
): boolean {
  return RETRYABLE_DENIAL_REASONS.has(mapDenialReason(message, details));
}

/**
 * Warm, customer-facing copy for a gate rejection, for the WhatsApp Flow.
 *
 * Routes the raw message through the SAME mapDenialReason categoriser used for
 * the denial log, so the sentence a customer reads and the reason recorded
 * against it can never drift — the property the portal wizard already relies
 * on. `unknown` falls back to a safe generic rather than leaking whatever
 * string arrived.
 */
export function friendlyDenialMessage(
  message?: string | null,
  details?: string | null,
): string {
  switch (mapDenialReason(message, details)) {
    case "pregnant":
      // Clinical/policy, not capacity jargon — keep the meaning intact.
      return "Pregnant dogs need a quick chat first — just reply here and we’ll look after her properly. 🐾";
    case "daily_cap":
      return "That day’s now fully booked. Please try another day, or reply here and we’ll let you know as soon as a space opens up.";
    case "past_cutoff":
      return "That slot’s a bit too close to its start time to book now — we need a little notice. Please pick a later time or another day.";
    case "past_date":
      return "That date has already passed. Please choose an upcoming day.";
    case "calendar_closed":
      return "Sorry, the salon’s closed at that time. Please choose another day or time.";
    case "large_dog_ineligible":
      return "That time isn’t available for a larger dog. Please pick another time, or reply here and we’ll find one that works.";
    case "double_booked":
      return "That dog’s already booked in for that time. Please pick a different time, or reply here and we’ll check for you.";
    case "customer_slot_blocked":
      // Keep the meaning (this time is off the menu for THEM, not full)
      // rather than pretending the slot was taken.
      return "That time isn’t available for your account — please pick a different time, or reply here and we’ll help.";
    case "capacity_2_2_1":
    case "slot_full":
    case "seat_blocked":
    case "unavailable":
      return "That time’s just been taken. Please choose another — there’s usually one free close by.";
    default:
      return "Sorry, that time isn’t available anymore. Please choose another, or reply here and we’ll help.";
  }
}
