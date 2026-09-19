// ============================================================
// Needs Attention selectors — pure TS business logic, zero React.
//
// The Needs Attention view is a read-only backlog of unfinished work from
// PREVIOUS days, which otherwise disappears when the calendar moves on:
// dogs still marked ready for collection, bookings left in an active
// status after their day passed, and completed grooms whose payment
// record looks incomplete.
//
// Deliberate constraints (mirrors the first-release spec):
//   - Read-only: these selectors classify, they never mutate.
//   - Previous days only — today's live work belongs to the Daily Brief.
//   - Cancelled bookings are excluded.
//   - A missing paid_at does NOT mean unpaid. All payment copy here is
//     about missing INFORMATION ("Payment information missing" /
//     "Payment evidence incomplete") — never "the customer owes money".
//   - Multi-dog bookings (shared group_id) fold into ONE task per reason,
//     so a two-dog appointment never shows as two duplicate items.
// ============================================================

import { BOOKING_STATUS } from "../constants/salon";
import { statusRank } from "./today";
import { slotToMinutes } from "./utilisation";
import type { Booking } from "../types/index";

/**
 * How many days back the view sweeps for unresolved items.
 *
 * DO NOT widen this without re-measuring first. Payment marking was only
 * adopted in early July 2026 (3% of completed bookings carried "Paid in Full"
 * in June, 83% in July, 100% from August). Every completed booking before
 * that cutover therefore classifies as "payment information missing" — a
 * software-wasn't-told gap, not money missing. Measured 20 Aug 2026, a
 * 30-day window showed 0 such items while all-history showed 211. Widening
 * the window past the cutover floods the view with pre-adoption ghosts and
 * trains staff to ignore the whole page.
 */
export const NEEDS_ATTENTION_LOOKBACK_DAYS = 30;

/**
 * At or beyond this age a task is "stale" — it has survived several opening
 * days, so it is real backlog rather than yesterday's not-yet-tidied paperwork.
 * The UI leans on this to mark the rows that genuinely need chasing.
 */
export const NEEDS_ATTENTION_STALE_DAYS = 14;

/** Whole days between two YYYY-MM-DD strings, via UTC so DST can't skew it. */
export function daysBetweenDateStrings(from: string, to: string): number {
  if (!from || !to) return 0;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.round((toMs - fromMs) / 86_400_000);
}

/** Compact age copy for a task's row: "Yesterday", "3 days ago". */
export function ageLabel(ageDays: number): string {
  if (ageDays <= 0) return "Today";
  if (ageDays === 1) return "Yesterday";
  return `${ageDays} days ago`;
}

export type NeedsAttentionKind =
  | "readyForCollection"
  | "pastAppointmentReview"
  | "paymentInformation";

/**
 * The subset of booking fields the classifier reads. The full `Booking`
 * object is structurally assignable, and test fixtures stay small.
 */
export interface AttentionBooking {
  id?: string;
  status?: string | null;
  payment?: string | null;
  paidAt?: string | null;
  slot?: string;
  dogName?: string;
  _bookingDate?: string;
  _groupId?: string | null;
}

export interface NeedsAttentionItem {
  kind: NeedsAttentionKind;
  /** The booking clicking the row opens (earliest slot in the group). */
  booking: Booking;
  /** Every group member sharing this reason — length 1 for single-dog. */
  bookings: Booking[];
  date: string;
  slot: string;
  /** Neutral one-line reason, e.g. `Still marked "Arrived"`. */
  detail: string;
  /** Whole days between the appointment date and today. */
  ageDays: number;
  /** Survived NEEDS_ATTENTION_STALE_DAYS+ — real backlog, not yesterday's lag. */
  isStale: boolean;
}

export interface NeedsAttentionSection {
  kind: NeedsAttentionKind;
  title: string;
  /** One-sentence explainer rendered under the section title. */
  description: string;
  items: NeedsAttentionItem[];
}

export interface NeedsAttentionSummary {
  sections: NeedsAttentionSection[];
  /** Total tasks across every section (post group-dedupe). */
  total: number;
  /** How many of `total` are stale — the number actually worth chasing. */
  staleTotal: number;
}

// Section copy lives here (not in the component) so the payment language
// rule — information missing, never money owed — is unit-testable.
export const NEEDS_ATTENTION_SECTIONS: Record<
  NeedsAttentionKind,
  { title: string; description: string }
> = {
  readyForCollection: {
    title: "Ready for collection",
    description:
      "Marked ready on a previous day and never moved on to Completed.",
  },
  pastAppointmentReview: {
    title: "Past appointment review",
    description:
      "The appointment day has passed but the booking was left in an active state.",
  },
  paymentInformation: {
    title: "Payment information",
    description:
      "Completed appointments where the payment record looks incomplete. " +
      "This flags missing information only, not an outstanding balance.",
  },
};

const SECTION_ORDER: readonly NeedsAttentionKind[] = [
  "readyForCollection",
  "pastAppointmentReview",
  "paymentInformation",
];

/**
 * Classify one booking, or null when it needs nothing. Only previous-day
 * (date < todayStr), non-cancelled rows classify. A booking gets exactly
 * ONE reason — the status backlog wins over payment bookkeeping, since
 * resolving the status is the step that settles what actually happened.
 */
export function classifyNeedsAttention(
  b: AttentionBooking,
  todayStr: string,
): NeedsAttentionKind | null {
  if (b.status === BOOKING_STATUS.CANCELLED) return null;
  if (!b._bookingDate || !todayStr || b._bookingDate >= todayStr) return null;

  if (b.status === BOOKING_STATUS.READY_FOR_COLLECTION) return "readyForCollection";

  // Booked / Reconfirmed / Arrived — and unknown/missing statuses, which the
  // rest of the app renders as "Booked" (STAGE_BY_RANK fallback), so a
  // malformed row surfaces for review rather than silently disappearing.
  const rank = statusRank(b.status);
  if (rank >= 0 && rank <= 2) return "pastAppointmentReview";
  if (rank === -1) return "pastAppointmentReview";

  // Completed: the visit is done, so the only open question is whether the
  // payment RECORD is complete. Neutral evidence checks only.
  if (b.status === BOOKING_STATUS.COMPLETED) {
    const payment = (b.payment || "Due at Pick-up").trim();
    if (payment !== "Paid in Full") return "paymentInformation";
    if (!b.paidAt) return "paymentInformation";
  }
  return null;
}

/**
 * Neutral per-item reason line. Payment wording is information-centric by
 * design: "missing" when the payment state was never settled, "evidence
 * incomplete" when it says Paid in Full but carries no paid_at stamp.
 * Never any variant of "owes".
 */
export function attentionDetail(
  kind: NeedsAttentionKind,
  b: AttentionBooking,
): string {
  if (kind === "readyForCollection") {
    return 'Still marked "Ready for collection"';
  }
  if (kind === "pastAppointmentReview") {
    const status = b.status || BOOKING_STATUS.BOOKED;
    return `Still marked "${status}"`;
  }
  const payment = (b.payment || "Due at Pick-up").trim();
  return payment === "Paid in Full"
    ? "Payment evidence incomplete"
    : "Payment information missing";
}

function sortBookingsInGroup(bookings: Booking[]): Booking[] {
  return [...bookings].sort((a, b) => {
    const am = a.slot ? slotToMinutes(a.slot) : Number.POSITIVE_INFINITY;
    const bm = b.slot ? slotToMinutes(b.slot) : Number.POSITIVE_INFINITY;
    if (am !== bm) return am - bm;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

/**
 * Build the whole read-only summary: classify every booking, fold group
 * members with the same reason into one task, and shape the three fixed
 * sections (kept even when empty so the layout is stable). Items sort
 * most-recent day first, then by slot.
 */
export function buildNeedsAttention(
  bookings: Booking[],
  todayStr: string,
): NeedsAttentionSummary {
  // One task per (group, reason). A dog booked alone groups by its own id.
  const byTask = new Map<string, { kind: NeedsAttentionKind; bookings: Booking[] }>();
  for (const b of bookings) {
    const kind = classifyNeedsAttention(b, todayStr);
    if (!kind) continue;
    const groupKey = `${b._bookingDate}:${b._groupId || b.id}:${kind}`;
    const task = byTask.get(groupKey);
    if (task) task.bookings.push(b);
    else byTask.set(groupKey, { kind, bookings: [b] });
  }

  const itemsByKind: Record<NeedsAttentionKind, NeedsAttentionItem[]> = {
    readyForCollection: [],
    pastAppointmentReview: [],
    paymentInformation: [],
  };
  for (const { kind, bookings: members } of byTask.values()) {
    const ordered = sortBookingsInGroup(members);
    const primary = ordered[0];
    const date = primary._bookingDate || "";
    const ageDays = daysBetweenDateStrings(date, todayStr);
    itemsByKind[kind].push({
      kind,
      booking: primary,
      bookings: ordered,
      date,
      slot: primary.slot || "",
      detail: attentionDetail(kind, primary),
      ageDays,
      isStale: ageDays >= NEEDS_ATTENTION_STALE_DAYS,
    });
  }

  // OLDEST FIRST, deliberately. Measured against production on 20 Aug 2026:
  // of 40 live tasks, 16 were 0-2 days old (yesterday's paperwork, which staff
  // clear as a matter of course) while 18 ready-for-collection items were 15+
  // days old. Sorting newest-first put the self-resolving rows at the top and
  // buried the genuine backlog, so the page led with its least important item.
  for (const kind of SECTION_ORDER) {
    itemsByKind[kind].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1; // oldest day first
      const am = a.slot ? slotToMinutes(a.slot) : Number.POSITIVE_INFINITY;
      const bm = b.slot ? slotToMinutes(b.slot) : Number.POSITIVE_INFINITY;
      if (am !== bm) return am - bm;
      return String(a.booking.id ?? "").localeCompare(String(b.booking.id ?? ""));
    });
  }

  const sections = SECTION_ORDER.map((kind) => ({
    kind,
    ...NEEDS_ATTENTION_SECTIONS[kind],
    items: itemsByKind[kind],
  }));
  return {
    sections,
    total: sections.reduce((sum, s) => sum + s.items.length, 0),
    staleTotal: sections.reduce(
      (sum, s) => sum + s.items.filter((i) => i.isStale).length,
      0,
    ),
  };
}
