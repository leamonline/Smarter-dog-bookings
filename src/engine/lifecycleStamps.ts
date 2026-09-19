// The booking lifecycle stamps, as a pure function.
//
// In production these are set by two database triggers and never by a client:
//
//   set_booking_lifecycle_timestamps  (migration 20260702180000)
//     checked_in_at and ready_at, set ONCE on reaching a stage or beyond and
//     cleared only on a genuine regression below it.
//   set_booking_completed_at          (migration 20260627160000)
//     completed_at, set on entering Completed and cleared on leaving. Note it
//     OVERWRITES rather than coalescing — re-completing a booking re-stamps it.
//
// Both fire only when the status actually changes, and both leave the stamps
// untouched for Cancelled so a no-show keeps its arrival history.
//
// This mirror exists for offline/sample-data mode, which has no database and
// therefore had no stamps at all — which meant the one thing the day stack is
// for, how long a dog has been here, was invisible in every preview and demo.
// It is a MIRROR, not a second authority: online, the trigger still writes
// these and the client's values are ignored.
import { RANK_ARRIVED, RANK_COMPLETED, RANK_READY, STATUS_RANK } from "../constants/index";

// The progression ranks come from constants/salon.ts so this mirror and the
// database trigger cannot drift apart by editing one of them. Terminal
// statuses (Cancelled, No-show) are absent from STATUS_RANK by design: they
// are exits, not steps, and resolve to undefined below, which preserves the
// stamps exactly as the trigger does.
const RANK = STATUS_RANK;

export interface LifecycleStamps {
  checkedInAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
}

/**
 * The stamps a booking should carry after a status change.
 *
 * Returns the booking unchanged when the status did not move, when the target
 * is off the progression (Cancelled, or anything unrecognised), or when there
 * is nothing to alter — matching the triggers' WHEN clauses rather than
 * approximating them.
 */
export function applyLifecycleStamps<T extends LifecycleStamps & { status?: string | null }>(
  booking: T,
  previousStatus: string | null | undefined,
  nowIso: string = new Date().toISOString(),
): T {
  if (booking.status === previousStatus) return booking;

  const rank = RANK[booking.status ?? ""];
  // Cancelled, No-show and any unknown status: preserve whatever history
  // exists. A dog that arrived and was later marked a no-show by mistake
  // still arrived, and the correction must not erase the evidence.
  if (rank === undefined) return booking;

  const wasOnProgression = RANK[previousStatus ?? ""] !== undefined;

  return {
    ...booking,
    // Named ranks, not literals. Reconfirmed took rank 1 when it was added,
    // so a bare `rank >= 1` here would stamp an arrival time on a booking the
    // customer had merely confirmed by message — a dog recorded as being in
    // the salon when it is still at home.
    checkedInAt: rank >= RANK_ARRIVED ? booking.checkedInAt ?? nowIso : null,
    readyAt: rank >= RANK_READY ? booking.readyAt ?? nowIso : null,
    // Overwrites on re-entry, and clears on leaving, exactly as the trigger
    // does. Only touched when one side of the change is Completed, which is
    // the trigger's own WHEN clause.
    completedAt:
      rank === RANK_COMPLETED
        ? nowIso
        : wasOnProgression && RANK[previousStatus ?? ""] === RANK_COMPLETED
          ? null
          : booking.completedAt ?? null,
  };
}
