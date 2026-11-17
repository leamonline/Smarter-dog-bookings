// ============================================================
// A reminder that never reached the owner still needs confirming.
//
// `needsConfirmation` (engine/today.ts) only counts a reminder that was SENT
// and is waiting on a reply. A reminder whose send failed fell through to
// "nothing to wait for", so the card read as a calm, neutral Expected while
// the owner had not been told about the appointment at all. Staff asked for
// that case to read as unconfirmed too (November 2026).
//
// "Failed" is not redefined here. It is whatever the delivery-failure store
// (supabase/hooks/useDeliveryFailures.ts) already calls a LIVE failure: the
// newest row for that (booking, trigger, recipient) is `failed`, Meta's later
// verdict applied, and a resend clears it. An SMS fallback reading `sent` does
// not clear it, because delivery is never inferred from an attempted provider
// call (AGENTS.md). Ambiguity therefore fails towards "needs confirming",
// which is the safe direction.
//
// Applied to the built feed, before `applyChatConfirmations`. What clears it:
// a recorded confirmation (the owner tapping Confirm), or a successful resend,
// which ends the live failure and gives the booking a sent reminder whose
// typed replies are then read. A typed "yes" after a reminder that only ever
// failed is NOT read — the reply lookup starts from a sent reminder, and
// staff chose to keep it that way (November 2026). Display-level only —
// nothing here writes.
// ============================================================

import { BOOKING_STATUS } from "../constants/index";
import type { NeedActionReason } from "./today";

/** The trigger a failure row is about, ignoring the SMS-fallback suffix. */
function baseTrigger(triggerType: string | null | undefined): string {
  return String(triggerType || "").replace(/_sms_fallback$/, "");
}

/**
 * The booking ids that have a live failed REMINDER. A failed booking
 * confirmation, ready message or cancellation is a delivery problem the card
 * already shows in its own words; it is not a confirmation question.
 */
export function failedReminderBookingIds(
  failuresByBooking: ReadonlyMap<string, ReadonlyArray<{ trigger_type?: string | null }>> | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (!failuresByBooking) return ids;
  for (const [bookingId, failures] of failuresByBooking) {
    if (failures.some((failure) => baseTrigger(failure.trigger_type) === "reminder")) {
      ids.add(String(bookingId));
    }
  }
  return ids;
}

/** The subset of a feed entry this module reads and rewrites. */
export interface ReminderFailureEntry {
  booking: {
    id?: string | null;
    status?: string | null;
    reminderState?: string | null;
    reminderConfirmedAt?: string | null;
  };
  isUnconfirmed: boolean;
  needsAction: boolean;
  actionReasons: NeedActionReason[];
}

export type WithReminderFailure<T> = T & { reminderFailed: boolean };

/**
 * Mark a Booked entry with a live failed reminder as unconfirmed, with the
 * same "confirmation" reason `needsConfirmation` gives, so the attention
 * strip's "to confirm" count and the card's colour cannot disagree.
 *
 * Only Booked: Reconfirmed and every later status already settle the
 * question, exactly as `needsConfirmation` is gated on rank 0. A recorded
 * confirmation (`reminder_confirmed_at`) always wins.
 */
export function applyReminderFailures<T extends ReminderFailureEntry>(
  entries: T[],
  failedIds: ReadonlySet<string>,
): WithReminderFailure<T>[] {
  return entries.map((entry) => {
    const id = entry.booking?.id == null ? "" : String(entry.booking.id);
    const failed = !!id && failedIds.has(id);
    const eligible = failed
      && entry.booking.status === BOOKING_STATUS.BOOKED
      && entry.booking.reminderState !== "confirmed"
      && !entry.booking.reminderConfirmedAt;
    if (!eligible || entry.isUnconfirmed) {
      return { ...entry, reminderFailed: failed };
    }
    const actionReasons: NeedActionReason[] = [...entry.actionReasons, "confirmation"];
    return {
      ...entry,
      isUnconfirmed: true,
      actionReasons,
      needsAction: true,
      reminderFailed: true,
    };
  });
}
