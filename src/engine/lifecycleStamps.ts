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
import { BOOKING_STATUS } from "../constants/index";

const RANK: Record<string, number> = {
  [BOOKING_STATUS.BOOKED]: 0,
  [BOOKING_STATUS.CHECKED_IN]: 1,
  [BOOKING_STATUS.IN_BATH]: 2,
  [BOOKING_STATUS.READY_FOR_PICKUP]: 3,
  [BOOKING_STATUS.COMPLETED]: 4,
};

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
  // Cancelled and any unknown status: preserve whatever history exists. A
  // no-show that arrived and was then cancelled still arrived.
  if (rank === undefined) return booking;

  const wasOnProgression = RANK[previousStatus ?? ""] !== undefined;

  return {
    ...booking,
    checkedInAt: rank >= 1 ? booking.checkedInAt ?? nowIso : null,
    readyAt: rank >= 3 ? booking.readyAt ?? nowIso : null,
    // Overwrites on re-entry, and clears on leaving, exactly as the trigger
    // does. Only touched when one side of the change is Completed, which is
    // the trigger's own WHEN clause.
    completedAt:
      rank === 4
        ? nowIso
        : wasOnProgression && RANK[previousStatus ?? ""] === 4
          ? null
          : booking.completedAt ?? null,
  };
}
