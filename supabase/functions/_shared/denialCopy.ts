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

/**
 * Best-effort categorisation of a booking-gate rejection into a reason code.
 * MIRRORS mapDenialReason in src/engine/denials.ts, which is the source of
 * truth. Order matters: more specific patterns first.
 */
export function mapDenialReason(message?: string | null): string {
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
  if (m.includes("same-day")) return "past_cutoff";
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
 * Warm, customer-facing copy for a gate rejection, for the WhatsApp Flow.
 *
 * Routes the raw message through the SAME mapDenialReason categoriser used for
 * the denial log, so the sentence a customer reads and the reason recorded
 * against it can never drift — the property the portal wizard already relies
 * on. `unknown` falls back to a safe generic rather than leaking whatever
 * string arrived.
 */
export function friendlyDenialMessage(message?: string | null): string {
  switch (mapDenialReason(message)) {
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
