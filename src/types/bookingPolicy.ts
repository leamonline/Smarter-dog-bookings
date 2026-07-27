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
  /** Optimistic row version (`booking_visits.row_revision`), not the lineage ordinal. */
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

export type BookingVisitDataQuality =
  | "v1_authoritative"
  | "legacy_trustworthy"
  | "legacy_incomplete"
  | "reconciliation_required"
  | "structurally_inconsistent";

export type BookingVisitRuntimeGeneration = "legacy_compat" | "visit_v1";

export type BookingTermsAcknowledgement =
  | "not_recorded"
  | "staff_notice"
  | "customer_accepted";

export type BookingTermsNoticeMethod =
  | "in_person"
  | "phone"
  | "whatsapp"
  | "email"
  | "other";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type NonNullJsonValue = Exclude<JsonValue, null>;

export interface CustomerDepositPaymentInstructions {
  accountName: string;
  sortCode: string;
  accountNumber: string;
  customerReference: string;
}

type CustomerDepositSummaryBase = {
  amountPence: 1000;
  reason: string | null;
};

export type CustomerDepositSummary =
  | (CustomerDepositSummaryBase & {
      state: "not_required";
      dueAt: null;
      paymentInstructions: null;
      reason: null;
    })
  | (CustomerDepositSummaryBase & {
      state: "awaiting_terms";
      dueAt: string;
      paymentInstructions: null;
      reason: string;
    })
  | (CustomerDepositSummaryBase & {
      state: "awaiting_payment";
      dueAt: string;
      paymentInstructions: CustomerDepositPaymentInstructions;
      reason: string;
    })
  | (CustomerDepositSummaryBase & {
      state:
        | "received"
        | "received_liability"
        | "not_received"
        | "reconciliation_required";
      dueAt: string | null;
      paymentInstructions: null;
    });

export interface CustomerPendingBookingChange {
  requestId: string;
  revision: number;
  status: "pending_staff" | "waiting_customer";
  staffReviewReason:
    | "staff_review"
    | "destination_last_minute_staff_review"
    | "auto_confirm_disabled_staff_review"
    | "staff_alternative";
  requestedBookingDate: string;
  slots: string[];
  capacityHeld: boolean;
  destinationHash: string;
  proposalId: string | null;
  proposalRevision: number | null;
}

export type CustomerBookingVisitCapabilities = Omit<
  VisitCapabilities,
  "visitId"
>;

export interface CustomerBookingVisitProjection {
  id: string;
  /** Optimistic row version (`booking_visits.row_revision`), not the lineage ordinal. */
  revision: number;
  bookingDate: string;
  lifecycleState: VisitLifecycleState;
  approvalState: VisitApprovalState;
  confirmationState: VisitConfirmationState;
  policyCode: VisitPolicyCode | null;
  deadlineAt: string | null;
  isLastMinute: boolean;
  termsPublication: {
    id: string;
    publicUrl: string;
    version: string;
  } | null;
  dogs: Array<{
    bookingId: string;
    dogId: string;
    dogName: string;
    slot: string;
    serviceLabel: string;
    addOnLabels: string[];
  }>;
  unavailableDogCount: number;
  deposit: CustomerDepositSummary | null;
  dataQualityNote: string | null;
  capabilities: CustomerBookingVisitCapabilities;
  pendingChange: CustomerPendingBookingChange | null;
}

export interface StaffAttentionVisitRevision {
  visitId: string;
  /** Optimistic row version from `booking_visits.row_revision`. */
  visitRevision: number;
}

export interface StaffBookingPolicyAttention {
  generatedAt: string;
  counts: {
    waitingApprovals: number;
    alternatives: number;
    pendingChanges: number;
    depositChecksDue: number;
    depositReconciliations: number;
    servicePrepaymentReconciliations: number;
    thresholdReviews: number;
    refundsPending: number;
    refundsOverdue: number;
  };
  waitingApprovals: StaffAttentionVisitRevision[];
  alternatives: Array<
    StaffAttentionVisitRevision & {
      requestId: string | null;
      requestRevision: number | null;
    }
  >;
  pendingChanges: Array<
    StaffAttentionVisitRevision & {
      requestId: string;
      requestRevision: number;
    }
  >;
  depositChecksDue: Array<
    StaffAttentionVisitRevision & {
      state: "awaiting_terms" | "awaiting_payment";
      dueAt: string;
    }
  >;
  depositReconciliations: Array<
    StaffAttentionVisitRevision & {
      reconciliationId: string;
    }
  >;
  servicePrepaymentReconciliations: Array<
    StaffAttentionVisitRevision & {
      reconciliationId: string;
    }
  >;
  thresholdReviews: Array<
    StaffAttentionVisitRevision & {
      reasonCode: "three_incidents_12m";
    }
  >;
  refunds: Array<{
    obligationId: string;
    humanId: string;
    visitId: string | null;
    amountPence: number;
    dueAt: string;
    refundOrigin: "deposit" | "account_credit" | "service_prepayment";
    overdue: boolean;
  }>;
}

type StaffBookingVisitSummaryBase = {
  id: string;
  /** Optimistic row version (`booking_visits.row_revision`), not the lineage ordinal. */
  revision: number;
  lineageId: string;
  humanId: string;
  bookingDate: string;
  lifecycleState: VisitLifecycleState;
  approvalState: VisitApprovalState;
  confirmationState: VisitConfirmationState;
  policyCode: VisitPolicyCode | null;
  source: string;
  requestedAt: string;
  commercialEligibilityAt: string | null;
  eligibilityPolicyCode: VisitPolicyCode | null;
  confirmedAt: string | null;
  deadlineAt: string | null;
  isLastMinute: boolean;
  supersedesVisitId: string | null;
  continuesCancelledVisitId: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  dataQuality: BookingVisitDataQuality;
  termsPublicationId: string | null;
  runtimeGeneration: BookingVisitRuntimeGeneration;
};

export type StaffBookingVisitSummary = StaffBookingVisitSummaryBase &
  (
    | {
        termsAcknowledgement: "staff_notice";
        termsNoticeMethod: BookingTermsNoticeMethod;
        termsNoticeAt: string;
        termsNoticeBy: string;
      }
    | {
        termsAcknowledgement: "not_recorded" | "customer_accepted";
        termsNoticeMethod: null;
        termsNoticeAt: null;
        termsNoticeBy: null;
      }
  );

type StaffBookingVisitDepositBase = {
  amountPence: 1000;
  requirementReason: string | null;
  exemptionReason: string | null;
  dueAt: string | null;
  customerPaymentReference: string | null;
  staffVerificationReference: string | null;
  bankReceivedAt: string | null;
  termsPublicationId: string | null;
  termsAcceptedAt: string | null;
  updatedAt: string;
};

export type StaffBookingVisitDeposit =
  | (StaffBookingVisitDepositBase & {
      state: "not_required";
      dueAt: null;
      satisfactionSource: null;
      satisfactionEventId: null;
      dispositionEventId: null;
      bankReceivedAt: null;
    })
  | (StaffBookingVisitDepositBase & {
      state: "awaiting_terms";
      requirementReason: string;
      dueAt: string;
      satisfactionSource: null;
      satisfactionEventId: null;
      dispositionEventId: null;
      bankReceivedAt: null;
      termsPublicationId: string;
    })
  | (StaffBookingVisitDepositBase & {
      state: "awaiting_payment";
      requirementReason: string;
      dueAt: string;
      satisfactionSource: null;
      satisfactionEventId: null;
      dispositionEventId: null;
      bankReceivedAt: null;
      termsPublicationId: string;
      termsAcceptedAt: string;
    })
  | (StaffBookingVisitDepositBase & {
      state: "received";
      satisfactionSource: "bank";
      satisfactionEventId: string;
      dispositionEventId: null;
      bankReceivedAt: string;
    })
  | (StaffBookingVisitDepositBase & {
      state: "received";
      satisfactionSource: "credit" | "transfer";
      satisfactionEventId: string;
      dispositionEventId: null;
      bankReceivedAt: null;
    })
  | (StaffBookingVisitDepositBase & {
      state: "received";
      satisfactionSource: "legacy_import";
      satisfactionEventId: string;
      dispositionEventId: null;
    })
  | (StaffBookingVisitDepositBase & {
      state: "received_liability";
      satisfactionSource: "bank";
      satisfactionEventId: string;
      dispositionEventId: string | null;
      bankReceivedAt: string;
    })
  | (StaffBookingVisitDepositBase & {
      state: "not_received" | "reconciliation_required";
      satisfactionSource: null;
      satisfactionEventId: null;
      dispositionEventId: null;
    });

export interface StaffBookingDestinationReservation {
  id: string;
  proposalRevision: number;
  purpose:
    | "auto_confirm_review"
    | "new_booking_alternative"
    | "reschedule_counterproposal";
  bookingDate: string;
  slotAssignments: NonNullJsonValue;
  destinationHash: string;
  state: "held" | "consumed" | "released";
}

export type BookingChangeReasonCode =
  | "on_time_customer_change"
  | "salon_change"
  | "accepted_late_customer_request"
  | "source_deadline_late"
  | "destination_last_minute_staff_review"
  | "auto_confirm_disabled_staff_review"
  | "staff_alternative"
  | "staff_partial_change";

type StaffBookingChangeRequestBase = {
  id: string;
  revision: number;
  sourceVisitId: string;
  /** Current optimistic row version of the source visit. */
  sourceVisitRevision: number;
  humanId: string;
  requestedAt: string;
  receivedAt: string;
  customerMessage: string | null;
  reviewId: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
};

type StaffBookingChangeDestination =
  | {
      kind: "reschedule";
      reasonCode: BookingChangeReasonCode;
      requestedBookingDate: string;
      requestedSlotAssignments: NonNullJsonValue;
      destinationHash: string;
      /** Source visit row version captured when the request was created. */
      sourceRevision: number;
      destinationReservation:
        | (StaffBookingDestinationReservation & {
            purpose: "auto_confirm_review" | "reschedule_counterproposal";
          })
        | null;
    }
  | {
      kind: "staff_alternative";
      reasonCode: "staff_alternative";
      requestedBookingDate: string;
      requestedSlotAssignments: NonNullJsonValue;
      destinationHash: string;
      /** Source visit row version captured when the proposal was created. */
      sourceRevision: number;
      destinationReservation:
        | (StaffBookingDestinationReservation & {
            purpose: "auto_confirm_review" | "new_booking_alternative";
          })
        | null;
    }
  | {
      kind: "cancel";
      reasonCode:
        | "on_time_customer_change"
        | "salon_change"
        | "accepted_late_customer_request"
        | "source_deadline_late";
      requestedBookingDate: null;
      requestedSlotAssignments: null;
      destinationHash: null;
      sourceRevision: null;
      reviewId: null;
      destinationReservation: null;
    }
  | {
      kind: "partial_change";
      reasonCode: "staff_partial_change";
      requestedBookingDate: null;
      requestedSlotAssignments: null;
      destinationHash: null;
      sourceRevision: null;
      reviewId: null;
      destinationReservation: null;
    };

type StaffBookingChangeChannel =
  | {
      channel: "whatsapp";
      providerMessageId: string;
    }
  | {
      channel: "website" | "staff";
      providerMessageId: string | null;
    };

type StaffBookingChangeOutcome =
  | {
      proposedVisitId: string;
      status: "accepted" | "closed";
    }
  | {
      proposedVisitId: null;
      status:
        | "pending_staff"
        | "waiting_customer"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "closed";
    };

export type StaffBookingChangeRequest = StaffBookingChangeRequestBase &
  StaffBookingChangeDestination &
  StaffBookingChangeChannel &
  StaffBookingChangeOutcome;

type StaffDepositReconciliationBase = {
  id: string;
  visitId: string;
  amountPence: 1000;
  openedReason: string;
  openedAt: string;
  resolvedBy: string | null;
};

type StaffResolvedDepositEvidence =
  | {
      resolution: "refund" | "credit" | "transfer";
      resolutionEventId: string | null;
      resolvedAt: string | null;
    }
  | {
      resolution: "refund" | "credit" | "transfer" | null;
      resolutionEventId: string;
      resolvedAt: string | null;
    }
  | {
      resolution: "refund" | "credit" | "transfer" | null;
      resolutionEventId: string | null;
      resolvedAt: string;
    };

export type StaffDepositReconciliation =
  | (StaffDepositReconciliationBase & {
      state: "open";
      resolution: null;
      resolutionEventId: null;
      resolvedAt: null;
    })
  | (StaffDepositReconciliationBase &
      StaffResolvedDepositEvidence & {
        state: "resolved";
      });

type StaffServicePrepaymentReconciliationBase = {
  id: string;
  visitId: string;
  amountPence: number;
  evidence: NonNullJsonValue;
  targetVisitId: string | null;
  obligationEventId: string | null;
  openedReason: string;
  openedAt: string;
  resolvedBy: string | null;
  resolutionReason: string | null;
};

export type StaffServicePrepaymentReconciliation =
  | (StaffServicePrepaymentReconciliationBase & {
      state: "open";
      resolvedAt: null;
    })
  | (StaffServicePrepaymentReconciliationBase & {
      state: "refund_due";
      obligationEventId: string;
      resolvedAt: string;
    })
  | (StaffServicePrepaymentReconciliationBase & {
      state: "transferred";
      targetVisitId: string;
      resolvedAt: string;
    })
  | (StaffServicePrepaymentReconciliationBase & {
      state: "closed";
      resolvedAt: string;
    });

export type BookingFinancialEventKind =
  | "deposit_received"
  | "deposit_transferred"
  | "deposit_retained"
  | "service_prepayment_transferred"
  | "refund_due"
  | "refund_paid"
  | "refund_cancelled"
  | "credit_issued"
  | "credit_reserved"
  | "credit_released"
  | "credit_applied";

type StaffFinancialLedgerBase = {
  id: string;
  humanId: string;
  visitId: string | null;
  relatedVisitId: string | null;
  amountPence: number;
  reason: string;
  recordedBy: string | null;
  recordedAt: string;
};

type StaffFinancialNonRefundEventKind = Exclude<
  BookingFinancialEventKind,
  "refund_due" | "refund_paid" | "refund_cancelled"
>;

export type StaffFinancialLedgerRow =
  | (StaffFinancialLedgerBase & {
      eventKind: StaffFinancialNonRefundEventKind;
      dueAt: null;
      settlesEventId: null;
      actualPaidAt: null;
      bankReference: null;
      refundOrigin: null;
      refundDeadlineBasis: null;
      refundCalendarSource: null;
      refundCalendarCoverageId: null;
    })
  | (StaffFinancialLedgerBase & {
      eventKind: "refund_due";
      dueAt: string;
      settlesEventId: null;
      actualPaidAt: null;
      bankReference: null;
      refundOrigin: "deposit" | "account_credit";
      refundDeadlineBasis: "deposit_working_days";
      refundCalendarSource: string;
      refundCalendarCoverageId: string;
    })
  | (StaffFinancialLedgerBase & {
      eventKind: "refund_due";
      dueAt: string;
      settlesEventId: null;
      actualPaidAt: null;
      bankReference: null;
      refundOrigin: "service_prepayment";
      refundDeadlineBasis: "staff_explicit";
      refundCalendarSource: null;
      refundCalendarCoverageId: null;
    })
  | (StaffFinancialLedgerBase & {
      eventKind: "refund_paid";
      dueAt: null;
      settlesEventId: string;
      actualPaidAt: string;
      bankReference: string;
      refundOrigin: null;
      refundDeadlineBasis: null;
      refundCalendarSource: null;
      refundCalendarCoverageId: null;
    })
  | (StaffFinancialLedgerBase & {
      eventKind: "refund_cancelled";
      dueAt: null;
      settlesEventId: string;
      actualPaidAt: null;
      bankReference: null;
      refundOrigin: null;
      refundDeadlineBasis: null;
      refundCalendarSource: null;
      refundCalendarCoverageId: null;
    });

export interface StaffBookingVisitProjection {
  visit: StaffBookingVisitSummary;
  customer: {
    id: string;
    name: string;
    surname: string | null;
    phone: string | null;
    email: string | null;
  };
  dogs: Array<{
    bookingId: string;
    dogId: string;
    dogName: string;
    slot: string;
    service: string;
    addOns: string[];
    size: Booking["size"];
    status: Booking["status"];
    membershipState: "included" | "removed";
    payment: string | null;
    paymentMethod: string | null;
    paidAt: string | null;
    paidAmount: number | null;
  }>;
  deposit: StaffBookingVisitDeposit | null;
  billSummary: {
    billRevision: number;
    grossServiceTotalPence: number;
    nonDepositPaidPence: number;
    depositPartPaymentPence: number;
    amountDuePence: number;
  };
  changeRequests: StaffBookingChangeRequest[];
  incidents: Array<{
    id: string;
    revision: number;
    visitId: string;
    /** Current optimistic row version of the incident's visit. */
    visitRevision: number;
    humanId: string;
    kind: IncidentKind;
    appointmentDate: string;
    reason: string;
    recordedAt: string;
    recordedBy: string;
    waivedAt: string | null;
    waivedBy: string | null;
    waiverReason: string | null;
    audit: Array<{
      id: string;
      action: "recorded" | "waived" | "unwaived" | "corrected";
      reason: string;
      actorId: string;
      occurredAt: string;
    }>;
  }>;
  depositReconciliations: StaffDepositReconciliation[];
  servicePrepaymentReconciliations: StaffServicePrepaymentReconciliation[];
  financialLedger: StaffFinancialLedgerRow[];
  policyAudit: Array<{
    id: string;
    visitId: string | null;
    humanId: string | null;
    action: string;
    actorId: string | null;
    actorScope: "customer" | "staff" | "service" | "system";
    reason: string | null;
    detail: JsonValue;
    occurredAt: string;
  }>;
}
