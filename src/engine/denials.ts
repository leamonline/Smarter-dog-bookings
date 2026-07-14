// ============================================================
// Booking-denial helpers — pure TS, zero React.
//
// mapDenialReason turns a P0001 gate message into a stable reason code for the
// booking_denials log; computeDenialStats aggregates the log for the
// capacity-prevented-demand report (2F). The frontend is the source of truth
// for the mapper; the WhatsApp Flow edge function keeps a small Deno copy.
// ============================================================

export const DENIAL_REASON_LABELS: Record<string, string> = {
  capacity_2_2_1: "2-2-1 capacity rule",
  daily_cap: "Daily dog limit",
  slot_full: "Slot full",
  seat_blocked: "Seat blocked",
  large_dog_ineligible: "Large-dog rule",
  calendar_closed: "Day/slot closed",
  past_date: "Date in the past",
  past_cutoff: "Past the last-minute cutoff",
  pregnant: "Pregnant dog",
  customer_slot_blocked: "Blocked time for this customer",
  double_booked: "Dog already booked",
  unavailable: "No availability",
  unknown: "Other",
};

/**
 * Best-effort categorisation of a booking-gate rejection message into a reason
 * code. The full message is stored separately (reason_detail), so an "unknown"
 * here still preserves the raw text — this only drives the ranked breakdown.
 * Order matters: more specific patterns first.
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
  if (/large dog|large dogs|back-to-back|small\/medium dog can share|early close/.test(m)) return "large_dog_ineligible";
  if (m.includes("same-day")) return "past_cutoff";
  if (m.includes("in the past")) return "past_date";
  if (m.includes("blocked")) return "seat_blocked";
  if (m.includes("closed")) return "calendar_closed";
  if (m.includes("twice") || m.includes("already booked") || m.includes("duplicate")) return "double_booked";
  if (m.includes("invalid slot")) return "unavailable";
  return "unknown";
}

/**
 * Warm, customer-facing copy for a booking-gate rejection.
 *
 * The capacity/calendar/large-dog triggers raise engineer-facing messages
 * ("Capped at 1 (2-2-1 rule)", "Back-to-back large dogs only allowed at
 * 12:30 + 13:00", "13:00 is closed — large dog at 12:00 triggered early
 * close"). Those are perfect for the denial log and staff, but a customer
 * whose booking just failed should never see them. We route the raw message
 * through the SAME `mapDenialReason` categoriser used for logging — so the
 * message a customer reads and the reason we record can never drift — then
 * hand back reassuring, actionable copy (Reassure → Inform → Close warmly).
 *
 * The raw message is still logged verbatim elsewhere (reason_detail); only the
 * on-screen text changes here. `unknown` falls back to a safe generic rather
 * than leaking whatever string arrived.
 */
export function friendlyDenialMessage(message?: string | null): string {
  switch (mapDenialReason(message)) {
    case "pregnant":
      // Kept close to the trigger's own wording — this one is a clinical/policy
      // message, not capacity jargon, so we don't soften its meaning.
      return "We can’t book a pregnant dog online — please call the salon so we can look after her properly.";
    case "daily_cap":
      return "That day’s now fully booked. Try another day, or join the waitlist and we’ll text you the moment a space opens up.";
    case "past_cutoff":
      return "That slot’s a bit too close to its start time to book online now — we need a little notice. Please pick a later time or another day.";
    case "past_date":
      return "That date has already passed. Please choose an upcoming day.";
    case "calendar_closed":
      return "Sorry, the salon’s closed at that time. Please choose another day or slot.";
    case "large_dog_ineligible":
      return "That time isn’t available for a larger dog. Please pick another slot, or give us a call and we’ll find one that works.";
    case "double_booked":
      return "That dog’s already booked in for that time. Check “My appointments”, or pick a different slot.";
    case "customer_slot_blocked":
      // Keep the meaning (this time is off the menu for THEM, not full)
      // rather than pretending the slot was taken.
      return "That time isn’t available for your account — please pick a different time, or message the salon and we’ll help.";
    case "capacity_2_2_1":
    case "slot_full":
    case "seat_blocked":
    case "unavailable":
      return "That time’s just been taken. Please choose another slot — there’s usually one free close by.";
    default:
      return "Sorry, that slot isn’t available anymore. Please choose another time, or message us if it keeps happening.";
  }
}

export interface DenialRow {
  requested_date?: string | null;
  slot?: string | null;
  size?: string | null;
  service?: string | null;
  dog_count?: number | null;
  reason_code: string;
  source?: string | null;
  alternative_shown?: boolean | null;
  alternative_taken?: boolean | null;
  created_at: string;
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function slotLabel(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  if (Number.isNaN(h)) return slot;
  const suffix = h < 12 ? "am" : "pm";
  const hh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hh}:${String(m).padStart(2, "0")}${suffix}`;
}

export interface DenialStats {
  total: number;
  byReason: Array<{ code: string; label: string; n: number; pct: number }>;
  bySize: Array<{ size: string; n: number }>;
  bySlot: Array<{ slot: string; label: string; n: number }>;
  bySource: Array<{ source: string; n: number }>;
  alternativeShownN: number;
  alternativeTakenN: number;
  firstSeen: string | null;
}

export function computeDenialStats(rows: DenialRow[], days: number, today: Date = new Date()): DenialStats {
  const todayStr = ymd(today);
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffStr = ymd(cutoff);

  const inWindow = rows.filter((r) => {
    if (!r.created_at) return false;
    const d = ymd(new Date(r.created_at));
    return d > cutoffStr && d <= todayStr;
  });

  const total = inWindow.length;
  const reasonAcc: Record<string, number> = {};
  const sizeAcc: Record<string, number> = {};
  const slotAcc: Record<string, number> = {};
  const sourceAcc: Record<string, number> = {};
  let alternativeShownN = 0;
  let alternativeTakenN = 0;
  let firstSeen: string | null = null;

  for (const r of inWindow) {
    const code = r.reason_code || "unknown";
    reasonAcc[code] = (reasonAcc[code] || 0) + 1;
    if (r.size) sizeAcc[r.size] = (sizeAcc[r.size] || 0) + 1;
    if (r.slot) slotAcc[r.slot] = (slotAcc[r.slot] || 0) + 1;
    sourceAcc[r.source || "unknown"] = (sourceAcc[r.source || "unknown"] || 0) + 1;
    if (r.alternative_shown) alternativeShownN++;
    if (r.alternative_taken) alternativeTakenN++;
    if (!firstSeen || r.created_at < firstSeen) firstSeen = r.created_at;
  }

  const byReason = Object.entries(reasonAcc)
    .map(([code, n]) => ({ code, label: DENIAL_REASON_LABELS[code] || code, n, pct: total > 0 ? (n / total) * 100 : 0 }))
    .sort((a, b) => b.n - a.n);
  const bySize = Object.entries(sizeAcc).map(([size, n]) => ({ size, n })).sort((a, b) => b.n - a.n);
  const bySlot = Object.entries(slotAcc).map(([slot, n]) => ({ slot, label: slotLabel(slot), n })).sort((a, b) => b.n - a.n);
  const bySource = Object.entries(sourceAcc).map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n);

  return { total, byReason, bySize, bySlot, bySource, alternativeShownN, alternativeTakenN, firstSeen };
}
