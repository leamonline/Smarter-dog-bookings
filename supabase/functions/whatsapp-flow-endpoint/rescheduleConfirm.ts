/**
 * Receipt-first orchestration for a reschedule CONFIRM delivery.
 *
 * The database transaction is authoritative. A duplicate endpoint delivery
 * can still hold an in-memory "active" session after another delivery has
 * committed, so durable receipt lookup must happen both before attempting the
 * move and once more before recording any failure.
 */

export type RescheduleConfirmFailure = {
  ok: false;
  kind: "slot_taken" | "ownership" | "error" | "old_visit_unavailable";
  message?: string;
};

export type RescheduleConfirmSuccess = {
  ok: true;
  bookingIds: string[];
  replayed: boolean;
};

export type ReviewedBookingSnapshot = {
  booking_id: string;
  dog_id: string;
  booking_date: string;
  slot: string;
  service: string | null;
};

function compareSnapshotRows(
  left: ReviewedBookingSnapshot,
  right: ReviewedBookingSnapshot,
): boolean {
  return left.booking_id === right.booking_id &&
    left.dog_id === right.dog_id &&
    left.booking_date === right.booking_date &&
    left.slot === right.slot &&
    left.service === right.service;
}

/** Compare only the exact reviewed material fields, independent of JSON
 * object-key order and source row order. */
export function reviewedBookingSnapshotsEqual(
  left: ReviewedBookingSnapshot[],
  right: ReviewedBookingSnapshot[],
): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort((a, b) => a.booking_id.localeCompare(b.booking_id));
  const rightSorted = [...right].sort((a, b) => a.booking_id.localeCompare(b.booking_id));
  return leftSorted.every((row, index) => compareSnapshotRows(row, rightSorted[index]));
}

export type FlowSessionGateResult =
  | { action: "continue" }
  | { action: "reject" }
  | { action: "replay"; bookingIds: string[] };

/**
 * Receipt/status gate used before the endpoint rejects a non-active or expired
 * session. Only a durable receipt can produce reschedule success IDs.
 */
export async function gateFlowSession(args: {
  session: {
    flowMode?: "reschedule";
    status: string;
  };
  expired: boolean;
  loadCommittedReceipt: () => Promise<string[] | null>;
}): Promise<FlowSessionGateResult> {
  if (args.session.flowMode === "reschedule") {
    const receipt = await args.loadCommittedReceipt();
    if (receipt?.length) {
      return { action: "replay", bookingIds: receipt };
    }
  }
  if (args.session.status !== "active" || args.expired) {
    return { action: "reject" };
  }
  return { action: "continue" };
}

export async function handleRescheduleConfirm(args: {
  inMemorySession: {
    flowToken: string;
    status: string;
    bookingIds?: string[];
  };
  loadCommittedReceipt: () => Promise<string[] | null>;
  runAtomicReschedule: () => Promise<
    | { ok: true; bookingIds: string[]; replayed?: boolean }
    | RescheduleConfirmFailure
  >;
  completeSession: (bookingIds: string[]) => Promise<void>;
  failSession: () => Promise<void>;
}): Promise<RescheduleConfirmSuccess | RescheduleConfirmFailure> {
  const committed = await args.loadCommittedReceipt();
  if (committed?.length) {
    return { ok: true, bookingIds: committed, replayed: true };
  }

  // A completed session with a pruned receipt is terminal, but cannot safely
  // reconstruct a multi-dog result from its representative booking_id.
  if (args.inMemorySession.status === "completed") {
    return {
      ok: false,
      kind: "old_visit_unavailable",
      message: "The committed reschedule receipt is no longer available.",
    };
  }

  const result = await args.runAtomicReschedule();
  if (result.ok) {
    await args.completeSession(result.bookingIds);
    return {
      ok: true,
      bookingIds: result.bookingIds,
      replayed: result.replayed ?? false,
    };
  }

  // The atomic call can lose a race to another delivery after the first
  // lookup. Re-check under the same durable token before writing "failed".
  const racedReceipt = await args.loadCommittedReceipt();
  if (racedReceipt?.length) {
    return { ok: true, bookingIds: racedReceipt, replayed: true };
  }

  // Capacity is a recoverable failure: the endpoint keeps the active session
  // and offers another slot. Terminal failures are monotonic writes guarded
  // by status='active' in the persistence layer.
  if (result.kind !== "slot_taken") await args.failSession();
  return result;
}
