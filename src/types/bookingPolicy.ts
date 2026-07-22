// Visit-level booking policy domain types.
//
// PostgreSQL is authoritative for every permission and deadline decision.
// Nothing here recalculates a deadline or decides whether an action is
// allowed — the client maps the server-returned actionability facts onto
// labels and grouping, and no more.
import type { Booking } from "./index";

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

export type VisitConfirmationState = "unconfirmed" | "confirmed";

export type VisitPolicyCode = "legacy_24h" | "previous_day_1500_v1";

export type DepositState =
  | "not_required"
  | "awaiting_terms"
  | "awaiting_payment"
  | "received"
  | "received_liability"
  | "not_received"
  | "reconciliation_required";

export type DepositSatisfactionSource =
  | "bank"
  | "credit"
  | "transfer"
  | "legacy_import";

export type IncidentKind =
  | "late_cancellation"
  | "late_reschedule"
  | "no_show"
  | "late_arrival_unserviceable"
  | "late_partial_change";

export type BookingPolicyRuntimeState =
  | "inactive"
  | "scheduled"
  | "failed"
  | "active";

export interface BookingPolicyRuntimeStatus {
  state: BookingPolicyRuntimeState;
  scheduledEffectiveAt: string | null;
}

export interface VisitDeposit {
  state: DepositState;
  amountPence: number;
  dueAt: string | null;
  satisfactionSource: DepositSatisfactionSource | null;
  bankReceivedAt: string | null;
  termsAcceptedAt: string | null;
}

export interface BookingVisit {
  id: string;
  revision: number;
  lineageId: string;
  humanId: string;
  bookingDate: string;
  lifecycleState: VisitLifecycleState;
  approvalState: VisitApprovalState;
  confirmationState: VisitConfirmationState;
  policyCode: VisitPolicyCode | null;
  confirmedAt: string | null;
  commercialEligibilityAt: string | null;
  eligibilityPolicyCode: VisitPolicyCode | null;
  deadlineAt: string | null;
  isLastMinute: boolean;
  remainingSelfServiceReschedules: number;
  bookings: Booking[];
  deposit: VisitDeposit | null;
}

/**
 * The server's orthogonal actionability facts for one intent.
 *
 * `allowed` and `reasonCode` are the decision; the individual flags exist so
 * the UI can explain *why* without re-deriving anything.
 */
export interface VisitActionability {
  allowed: boolean;
  reasonCode: string | null;
  deadlinePassed: boolean;
  switchEnabled: boolean;
  stateEligible: boolean;
  moveLimitReached: boolean;
  processingStateSafe: boolean;
  deadlineAt: string | null;
  lifecycleState: VisitLifecycleState;
  approvalState: VisitApprovalState;
  confirmationState: VisitConfirmationState;
  isLastMinute: boolean;
  remainingSelfServiceReschedules: number;
}

export interface VisitCapabilities {
  visitId: string;
  cancel: VisitActionability;
  reschedule: VisitActionability;
  withdraw: VisitActionability;
}

export interface StaffBookingChangeRequest {
  id: string;
  revision: number;
  sourceVisitId: string;
  sourceVisitRevision: number;
  humanId: string;
  kind: "cancel" | "reschedule" | "partial_change" | "staff_alternative";
  channel: "website" | "whatsapp" | "staff";
  reasonCode: string;
  status:
    | "pending_staff"
    | "waiting_customer"
    | "accepted"
    | "declined"
    | "withdrawn"
    | "closed";
  requestedAt: string;
  customerMessage: string | null;
  requestedBookingDate: string | null;
  destinationHash: string | null;
  capacityHeld: boolean;
}

export interface StaffBookingPolicyIncident {
  id: string;
  revision: number;
  visitId: string;
  visitRevision: number;
  humanId: string;
  kind: IncidentKind;
  appointmentDate: string;
  reason: string;
  recordedAt: string;
  waivedAt: string | null;
  waiverReason: string | null;
}
