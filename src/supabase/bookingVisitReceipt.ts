// The typed customer visit receipt returned by every v1 visit command.
//
// The server is the only authority here: the client renders same-day,
// last-minute and insufficient-window copy from `booking_timing`,
// `is_last_minute` and `customer_deposit_reason` — never by comparing dates
// itself. A blocked result carries no commercial identifiers at all, so it can
// never be mistaken for a committed outcome.

export type CustomerVisitMoneyOutcome =
  | { kind: "none" | "unchanged"; amount_pence: null; refund_due_at: null }
  | { kind: "refund_due"; amount_pence: number; refund_due_at: string }
  | {
      kind:
        | "credit_issued"
        | "credit_reserved"
        | "credit_released"
        | "credit_applied"
        | "deposit_transferred"
        | "deposit_retained";
      amount_pence: number;
      refund_due_at: null;
    };

export type VisitLifecycleState =
  | "active"
  | "superseded"
  | "cancelled"
  | "withdrawn"
  | "declined"
  | "completed";

export type VisitApprovalState =
  | "not_required"
  | "waiting_staff"
  | "approved"
  | "alternative_pending";

export type VisitPolicyCode = "legacy_24h" | "previous_day_1500_v1";

export type BookingTiming =
  | "ordinary"
  | "same_day"
  | "last_minute"
  | "insufficient_window";

export type CustomerDepositReason =
  | "not_required"
  | "recent_booking_history"
  | "staff_applied_requirement"
  | "staff_waiver"
  | "same_day_or_last_minute"
  | "insufficient_window";

export interface CustomerVisitSuccessReceipt {
  outcome:
    | "confirmed"
    | "waiting_staff"
    | "awaiting_terms"
    | "awaiting_payment"
    | "late_deposit_review"
    | "withdrawn"
    | "cancelled"
    | "rescheduled";
  block_reason: null;
  visit_id: string;
  replacement_visit_id: string | null;
  lineage_id: string;
  booking_ids: string[];
  lifecycle_state: VisitLifecycleState;
  approval_state: VisitApprovalState;
  confirmation_state: "unconfirmed" | "confirmed";
  policy_code: VisitPolicyCode | null;
  deadline_at: string | null;
  is_last_minute: boolean;
  booking_timing: BookingTiming;
  customer_deposit_reason: CustomerDepositReason;
  deposit_state: string;
  deposit_amount_pence: number;
  deposit_due_at: string | null;
  deposit_payment_instructions: {
    account_name: string;
    sort_code: string;
    account_number: string;
    customer_reference: string;
  } | null;
  money_outcome: CustomerVisitMoneyOutcome;
  outcome_key: string;
}

export interface CustomerVisitBlockedReceipt {
  outcome: "blocked";
  block_reason: string;
  visit_id: string | null;
  replacement_visit_id: null;
  lineage_id: null;
  booking_ids: [];
  lifecycle_state: null;
  approval_state: null;
  confirmation_state: null;
  policy_code: null;
  deadline_at: string | null;
  is_last_minute: null;
  booking_timing: null;
  customer_deposit_reason: null;
  deposit_state: null;
  deposit_amount_pence: null;
  deposit_due_at: null;
  deposit_payment_instructions: null;
  money_outcome: null;
  outcome_key: null;
  staff_alert_key: string | null;
}

export interface CustomerChangePendingReceipt {
  outcome: "change_waiting_staff" | "change_request_withdrawn";
  block_reason: null;
  visit_id: string;
  replacement_visit_id: null;
  lineage_id: string;
  booking_ids: string[];
  lifecycle_state: "active";
  approval_state: "not_required" | "approved";
  confirmation_state: "confirmed";
  policy_code: VisitPolicyCode;
  deadline_at: string;
  is_last_minute: boolean;
  booking_timing: BookingTiming;
  customer_deposit_reason: CustomerDepositReason;
  deposit_state: string;
  deposit_amount_pence: number;
  deposit_due_at: string | null;
  deposit_payment_instructions: null;
  request_id: string;
  request_status: "pending_staff" | "withdrawn";
  staff_review_reason?:
    | "auto_confirm_disabled_staff_review"
    | "destination_last_minute_staff_review";
  desired_destination?: {
    booking_date: string;
    slots: string[];
    capacity_held: boolean;
    destination_hash: string;
    proposal_id: string | null;
    proposal_revision: number | null;
  };
  money_outcome: CustomerVisitMoneyOutcome;
  outcome_key: string;
}

export type CustomerVisitReceipt =
  | CustomerVisitSuccessReceipt
  | CustomerChangePendingReceipt
  | CustomerVisitBlockedReceipt;

export type CustomerCreditRefundReceipt =
  | {
      outcome: "refund_requested";
      obligation_id: string;
      amount_pence: number;
      refund_due_at: string;
      outcome_key: string;
    }
  | {
      outcome: "refund_request_cancelled";
      obligation_id: string;
      amount_pence: number;
      refund_due_at: null;
      outcome_key: string;
    };

const SUCCESS_OUTCOMES = new Set([
  "confirmed",
  "waiting_staff",
  "awaiting_terms",
  "awaiting_payment",
  "late_deposit_review",
  "withdrawn",
  "cancelled",
  "rescheduled",
]);

const PENDING_OUTCOMES = new Set([
  "change_waiting_staff",
  "change_request_withdrawn",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class VisitReceiptError extends Error {}

/**
 * Decode a raw RPC payload into a receipt, refusing anything malformed.
 *
 * A network or transport failure must never be reported as success, so an
 * unrecognised shape throws rather than being coerced. A blocked receipt must
 * carry no commercial identifiers; a success receipt must carry them all.
 */
export function decodeCustomerVisitReceipt(raw: unknown): CustomerVisitReceipt {
  if (!isRecord(raw)) {
    throw new VisitReceiptError("Expected a visit receipt object");
  }
  const outcome = raw.outcome;
  if (typeof outcome !== "string") {
    throw new VisitReceiptError("Visit receipt is missing its outcome");
  }

  if (outcome === "blocked") {
    if (typeof raw.block_reason !== "string" || raw.block_reason.length === 0) {
      throw new VisitReceiptError("A blocked receipt must state its reason");
    }
    for (const field of [
      "lineage_id",
      "lifecycle_state",
      "confirmation_state",
      "money_outcome",
      "outcome_key",
    ]) {
      if (raw[field] !== null && raw[field] !== undefined) {
        throw new VisitReceiptError(
          `A blocked receipt must not carry ${field}`,
        );
      }
    }
    const alertKey = raw.staff_alert_key;
    if (
      alertKey != null &&
      raw.block_reason !== "policy_setup_incomplete" &&
      raw.block_reason !== "deposit_setup_incomplete"
    ) {
      throw new VisitReceiptError(
        "Only a setup-incomplete block may carry a staff alert key",
      );
    }
    return {
      ...(raw as unknown as CustomerVisitBlockedReceipt),
      booking_ids: [],
      staff_alert_key: (alertKey as string | null) ?? null,
    };
  }

  if (raw.block_reason != null) {
    throw new VisitReceiptError("A successful receipt cannot carry a block reason");
  }
  if (typeof raw.visit_id !== "string") {
    throw new VisitReceiptError("A successful receipt must identify its visit");
  }

  if (PENDING_OUTCOMES.has(outcome)) {
    if (typeof raw.request_id !== "string") {
      throw new VisitReceiptError("A pending change receipt must identify its request");
    }
    if (raw.replacement_visit_id != null) {
      throw new VisitReceiptError(
        "A pending change never creates a replacement visit",
      );
    }
    return raw as unknown as CustomerChangePendingReceipt;
  }

  if (!SUCCESS_OUTCOMES.has(outcome)) {
    throw new VisitReceiptError(`Unknown visit receipt outcome: ${outcome}`);
  }
  if (typeof raw.outcome_key !== "string") {
    throw new VisitReceiptError("A committed receipt must carry its outcome key");
  }
  if (!Array.isArray(raw.booking_ids)) {
    throw new VisitReceiptError("A committed receipt must list its booking ids");
  }
  if ("staff_verification_reference" in raw) {
    throw new VisitReceiptError(
      "A customer receipt must never expose staff verification detail",
    );
  }
  return raw as unknown as CustomerVisitSuccessReceipt;
}

export function decodeCustomerCreditRefundReceipt(
  raw: unknown,
): CustomerCreditRefundReceipt {
  if (!isRecord(raw) || typeof raw.outcome !== "string") {
    throw new VisitReceiptError("Expected a credit refund receipt");
  }
  if (typeof raw.obligation_id !== "string") {
    throw new VisitReceiptError("A credit refund receipt must identify its obligation");
  }
  if (raw.outcome === "refund_requested") {
    if (typeof raw.refund_due_at !== "string") {
      throw new VisitReceiptError("A refund request must carry its due date");
    }
    return raw as unknown as CustomerCreditRefundReceipt;
  }
  if (raw.outcome === "refund_request_cancelled") {
    if (raw.refund_due_at != null) {
      throw new VisitReceiptError("A cancelled refund request has no due date");
    }
    return raw as unknown as CustomerCreditRefundReceipt;
  }
  throw new VisitReceiptError(`Unknown credit refund outcome: ${raw.outcome}`);
}

/** Deposit money is all-or-nothing: exactly 0 or the full £10 in pence. */
export const DEPOSIT_PENCE = 1000;

export function assertCreditAllocation(pence: number): void {
  if (pence !== 0 && pence !== DEPOSIT_PENCE) {
    throw new VisitReceiptError(
      "Credit allocation must be exactly 0 or 1000 pence",
    );
  }
}
