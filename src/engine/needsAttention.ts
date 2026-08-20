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

/** How many days back the view sweeps for unresolved items. */
export const NEEDS_ATTENTION_LOOKBACK_DAYS = 30;

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
  /** Neutral one-line reason, e.g. `Still marked "Checked in"`. */
  detail: string;
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

  if (b.status === BOOKING_STATUS.READY_FOR_PICKUP) return "readyForCollection";

  // Booked / Checked in / In bath — and unknown/missing statuses, which the
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
    return 'Still marked "Ready for pick-up"';
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
    itemsByKind[kind].push({
      kind,
      booking: primary,
      bookings: ordered,
      date: primary._bookingDate || "",
      slot: primary.slot || "",
      detail: attentionDetail(kind, primary),
    });
  }

  for (const kind of SECTION_ORDER) {
    itemsByKind[kind].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1; // newest day first
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
  };
}
