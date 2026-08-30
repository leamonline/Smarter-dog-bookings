// Why a booking confirm produced no booking — pure TS, zero React.
//
// WHY THIS EXISTS
//
// Issue #708: between 4 July and 26 August, 21 confirm clicks produced no
// appointment, across 13 customers — five of whom never came back by any
// route. The confirm failure path reports through logger.error, and #707
// established that logger reaches nothing in production until Sentry is
// enabled. The funnel table, by contrast, demonstrably works in production —
// it is how #708 was measured in the first place.
//
// So this module gives the wizard a database-visible account of every
// confirm that fails: a "confirm_failed" funnel event carrying a governed
// failure code. The candidates #708 needs separated are exactly what the
// client can observe at the moment of failure:
//
//   - transient network loss  -> "network_failed" (when a later write lands)
//   - a genuine write defect  -> "server_error", with the structured code
//   - capacity-gate refusal   -> "gate_rejected" (also in booking_denials)
//
// WHAT A MISSING ROW MEANS
//
// A confirm with no "booked" AND no "confirm_failed" row is still a finding,
// and a sharper one than before: either the customer navigated away
// mid-request, or the network was so gone that this telemetry write failed
// with the booking. Total network loss cannot log itself to the same
// database it lost — that residue is Sentry's job, not this module's.

/**
 * The governed vocabulary. Every value is a state the wizard can actually
 * observe in the error it caught — never an inference.
 *
 * Mirrored by the CHECK constraint on booking_funnel_events.failure_code;
 * adding a value here means adding it there in the same change.
 */
export const CONFIRM_FAILURE_CODES = [
  /** A BEFORE INSERT gate refused the booking (P0001). Also in booking_denials. */
  "gate_rejected",
  /** A handled reschedule rule (SDC02/SDR01/SDR02/SDC04) — customer saw specific copy. */
  "reschedule_rule",
  /** The client-side final re-check found the slot taken; customer sent back to the time step. */
  "slot_taken_recheck",
  /** The request never got an HTTP response — fetch-level failure. */
  "network_failed",
  /** A structured error code from Postgres/PostgREST that is not a gate. Defect candidate. */
  "server_error",
  /** An error with no code and no network signature. */
  "unknown",
] as const;

export type ConfirmFailureCode = (typeof CONFIRM_FAILURE_CODES)[number];

export interface ConfirmFailure {
  code: ConfirmFailureCode;
  /** Short structured diagnostic: error code plus message, truncated. Staff-read-only. */
  detail: string;
}

/** The shape the wizard's catch block already works with. */
export interface CaughtConfirmError {
  code?: string | null;
  message?: string | null;
}

/**
 * Cap the stored diagnostic well under the server's own 300-char truncation,
 * so what staff read in the table is what the client actually sent.
 */
export const CONFIRM_FAILURE_DETAIL_MAX = 280;

// The browsers' fetch-rejection messages. supabase-js surfaces a network
// failure as an error whose message wraps one of these, with no error code.
const NETWORK_MESSAGE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed out|timeout/i;

function detailFrom(cause: CaughtConfirmError | null | undefined): string {
  const code = cause?.code ? `[${cause.code}] ` : "";
  return `${code}${cause?.message ?? ""}`.trim().slice(0, CONFIRM_FAILURE_DETAIL_MAX);
}

/**
 * Categorise a caught confirm failure.
 *
 * The wizard already computes whether the error is a capacity/calendar gate
 * (its trigger-error matcher) and whether it is a handled reschedule code;
 * both are passed in rather than re-derived so this module can never drift
 * from the logic that chooses the customer's on-screen copy.
 */
export function categoriseConfirmFailure(
  cause: CaughtConfirmError | null | undefined,
  flags: { isTriggerError: boolean; isHandledReschedule: boolean },
): ConfirmFailure {
  const detail = detailFrom(cause);
  if (flags.isTriggerError) return { code: "gate_rejected", detail };
  if (flags.isHandledReschedule) return { code: "reschedule_rule", detail };
  if (!cause?.code && NETWORK_MESSAGE.test(cause?.message ?? "")) {
    return { code: "network_failed", detail };
  }
  if (cause?.code) return { code: "server_error", detail };
  return { code: "unknown", detail };
}
