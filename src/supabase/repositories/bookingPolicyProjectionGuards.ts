/**
 * bookingPolicyProjectionGuards — runtime validation of the booking-policy
 * RPC projections (assessment item 1.6; split out of bookingPolicyRepo.ts).
 *
 * The three reads in bookingPolicyRepo.ts trust nothing the database
 * returns: every projection is checked field by field against the shapes in
 * `types/bookingPolicy.ts` before it reaches the UI, and a mismatch is
 * reported as an invalid projection rather than rendered. These guards are
 * that check. They are pure, synchronous and module-private except for the
 * entry points the repository calls (the four projection guards plus the two
 * primitives its error normaliser shares).
 */
import type {
  CustomerBookingVisitProjection,
  JsonValue,
  NonNullJsonValue,
  StaffBookingDestinationReservation,
  StaffBookingPolicyAttention,
  StaffBookingVisitProjection,
} from "../../types/bookingPolicy";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))$/;

const LIFECYCLE_STATES = new Set([
  "active",
  "superseded",
  "cancelled",
  "withdrawn",
  "declined",
  "completed",
]);
const APPROVAL_STATES = new Set([
  "not_required",
  "waiting_staff",
  "approved",
  "alternative_pending",
]);
const CONFIRMATION_STATES = new Set(["unconfirmed", "confirmed"]);
const POLICY_CODES = new Set(["legacy_24h", "previous_day_1500_v1"]);
const DEPOSIT_STATES = new Set([
  "not_required",
  "awaiting_terms",
  "awaiting_payment",
  "received",
  "received_liability",
  "not_received",
  "reconciliation_required",
]);
const DEPOSIT_SATISFACTION_SOURCES = new Set([
  "bank",
  "credit",
  "transfer",
  "legacy_import",
]);
const CHANGE_KINDS = new Set([
  "cancel",
  "reschedule",
  "partial_change",
  "staff_alternative",
]);
const CHANGE_CHANNELS = new Set(["website", "whatsapp", "staff"]);
const CHANGE_STATUSES = new Set([
  "pending_staff",
  "waiting_customer",
  "accepted",
  "declined",
  "withdrawn",
  "closed",
]);
const CHANGE_REASON_CODES = new Set([
  "on_time_customer_change",
  "salon_change",
  "accepted_late_customer_request",
  "source_deadline_late",
  "destination_last_minute_staff_review",
  "auto_confirm_disabled_staff_review",
  "staff_alternative",
  "staff_partial_change",
]);
const CANCEL_REASON_CODES = new Set([
  "on_time_customer_change",
  "salon_change",
  "accepted_late_customer_request",
  "source_deadline_late",
]);
const INCIDENT_KINDS = new Set([
  "late_cancellation",
  "late_reschedule",
  "no_show",
  "late_arrival_unserviceable",
  "late_partial_change",
]);
const INCIDENT_AUDIT_ACTIONS = new Set([
  "recorded",
  "waived",
  "unwaived",
  "corrected",
]);
const DATA_QUALITY_LEVELS = new Set([
  "v1_authoritative",
  "legacy_trustworthy",
  "legacy_incomplete",
  "reconciliation_required",
  "structurally_inconsistent",
]);
const TERMS_ACKNOWLEDGEMENTS = new Set([
  "not_recorded",
  "staff_notice",
  "customer_accepted",
]);
const TERMS_NOTICE_METHODS = new Set([
  "in_person",
  "phone",
  "whatsapp",
  "email",
  "other",
]);
const RUNTIME_GENERATIONS = new Set(["legacy_compat", "visit_v1"]);
const DOG_SIZES = new Set(["small", "medium", "large"]);
const BOOKING_STATUSES = new Set([
  "Booked",
  "Checked in",
  "In bath",
  "Ready for pick-up",
  "Completed",
  "Cancelled",
]);
const VISIT_MEMBERSHIP_STATES = new Set(["included", "removed"]);
const DESTINATION_PURPOSES = new Set([
  "auto_confirm_review",
  "new_booking_alternative",
  "reschedule_counterproposal",
]);
const DESTINATION_STATES = new Set(["held", "consumed", "released"]);
const FINANCIAL_EVENT_KINDS = new Set([
  "deposit_received",
  "deposit_transferred",
  "deposit_retained",
  "service_prepayment_transferred",
  "refund_due",
  "refund_paid",
  "refund_cancelled",
  "credit_issued",
  "credit_reserved",
  "credit_released",
  "credit_applied",
]);
const REFUND_ORIGINS = new Set([
  "deposit",
  "account_credit",
  "service_prepayment",
]);
const REFUND_DEADLINE_BASES = new Set([
  "deposit_working_days",
  "staff_explicit",
]);
const ACTOR_SCOPES = new Set(["customer", "staff", "service", "system"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function isOneOf(value: unknown, allowed: ReadonlySet<string>): value is string {
  return typeof value === "string" && allowed.has(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_TIMESTAMP_RE.exec(value);
  if (!match) return false;

  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);

  return (
    isIsoDate(date) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 14 &&
    offsetMinute <= 59 &&
    (offsetHour < 14 || offsetMinute === 0) &&
    Number.isFinite(Date.parse(value))
  );
}

function isNullableIsoTimestamp(value: unknown): value is string | null {
  return value === null || isIsoTimestamp(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isNonNullJsonValue(value: unknown): value is NonNullJsonValue {
  return value !== null && isJsonValue(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isNullable(
  value: unknown,
  predicate: (candidate: unknown) => boolean,
): boolean {
  return value === null || predicate(value);
}

function isActionability(value: unknown): boolean {
  if (
    !isExactRecord(value, [
      "allowed",
      "reasonCode",
      "deadlinePassed",
      "switchEnabled",
      "stateEligible",
      "moveLimitReached",
      "processingStateSafe",
      "deadlineAt",
      "lifecycleState",
      "approvalState",
      "confirmationState",
      "isLastMinute",
      "remainingSelfServiceReschedules",
    ])
  ) {
    return false;
  }
  return (
    typeof value.allowed === "boolean" &&
    isNullableString(value.reasonCode) &&
    typeof value.deadlinePassed === "boolean" &&
    typeof value.switchEnabled === "boolean" &&
    typeof value.stateEligible === "boolean" &&
    typeof value.moveLimitReached === "boolean" &&
    typeof value.processingStateSafe === "boolean" &&
    isNullableIsoTimestamp(value.deadlineAt) &&
    isOneOf(value.lifecycleState, LIFECYCLE_STATES) &&
    isOneOf(value.approvalState, APPROVAL_STATES) &&
    isOneOf(value.confirmationState, CONFIRMATION_STATES) &&
    typeof value.isLastMinute === "boolean" &&
    isNonNegativeInteger(value.remainingSelfServiceReschedules)
  );
}

function isTermsPublication(value: unknown): boolean {
  return (
    isExactRecord(value, ["id", "publicUrl", "version"]) &&
    isUuid(value.id) &&
    isHttpsUrl(value.publicUrl) &&
    isNonEmptyString(value.version)
  );
}

function isCustomerDog(value: unknown): boolean {
  return (
    isExactRecord(value, [
      "bookingId",
      "dogId",
      "dogName",
      "slot",
      "serviceLabel",
      "addOnLabels",
    ]) &&
    isUuid(value.bookingId) &&
    isUuid(value.dogId) &&
    isString(value.dogName) &&
    isNonEmptyString(value.slot) &&
    isString(value.serviceLabel) &&
    isStringArray(value.addOnLabels)
  );
}

function isPaymentInstructions(value: unknown): boolean {
  return (
    isExactRecord(value, [
      "accountName",
      "sortCode",
      "accountNumber",
      "customerReference",
    ]) &&
    isNonEmptyString(value.accountName) &&
    isNonEmptyString(value.sortCode) &&
    isNonEmptyString(value.accountNumber) &&
    isString(value.customerReference)
  );
}

function isCustomerDeposit(value: unknown): boolean {
  if (
    !isExactRecord(value, [
      "state",
      "amountPence",
      "dueAt",
      "paymentInstructions",
      "reason",
    ]) ||
    !isOneOf(value.state, DEPOSIT_STATES) ||
    value.amountPence !== 1000 ||
    !isNullableIsoTimestamp(value.dueAt) ||
    !isNullable(value.paymentInstructions, isPaymentInstructions) ||
    !isNullableString(value.reason)
  ) {
    return false;
  }
  if (value.state === "awaiting_payment") {
    return (
      value.dueAt !== null &&
      value.paymentInstructions !== null &&
      isNonEmptyString(value.reason)
    );
  }
  if (value.state === "awaiting_terms") {
    return (
      value.dueAt !== null &&
      value.paymentInstructions === null &&
      isNonEmptyString(value.reason)
    );
  }
  if (value.state === "not_required") {
    return (
      value.dueAt === null &&
      value.paymentInstructions === null &&
      value.reason === null
    );
  }
  return value.paymentInstructions === null;
}

function isCustomerPendingChange(value: unknown): boolean {
  if (
    !isExactRecord(value, [
      "requestId",
      "revision",
      "status",
      "staffReviewReason",
      "requestedBookingDate",
      "slots",
      "capacityHeld",
      "destinationHash",
      "proposalId",
      "proposalRevision",
    ]) ||
    !isUuid(value.requestId) ||
    !isPositiveInteger(value.revision) ||
    !isOneOf(value.status, new Set(["pending_staff", "waiting_customer"])) ||
    !isOneOf(
      value.staffReviewReason,
      new Set([
        "staff_review",
        "destination_last_minute_staff_review",
        "auto_confirm_disabled_staff_review",
        "staff_alternative",
      ]),
    ) ||
    !isIsoDate(value.requestedBookingDate) ||
    !Array.isArray(value.slots) ||
    value.slots.length === 0 ||
    !value.slots.every(isNonEmptyString) ||
    typeof value.capacityHeld !== "boolean" ||
    !isNonEmptyString(value.destinationHash) ||
    !isNullableUuid(value.proposalId) ||
    !isNullable(value.proposalRevision, isPositiveInteger)
  ) {
    return false;
  }
  return (value.proposalId === null) === (value.proposalRevision === null);
}

export function isCustomerBookingVisit(
  value: unknown,
): value is CustomerBookingVisitProjection {
  if (
    !isExactRecord(value, [
      "id",
      "revision",
      "bookingDate",
      "lifecycleState",
      "approvalState",
      "confirmationState",
      "policyCode",
      "deadlineAt",
      "isLastMinute",
      "termsPublication",
      "dogs",
      "unavailableDogCount",
      "deposit",
      "dataQualityNote",
      "capabilities",
      "pendingChange",
    ]) ||
    !isUuid(value.id) ||
    !isPositiveInteger(value.revision) ||
    !isIsoDate(value.bookingDate) ||
    !isOneOf(value.lifecycleState, LIFECYCLE_STATES) ||
    !isOneOf(value.approvalState, APPROVAL_STATES) ||
    !isOneOf(value.confirmationState, CONFIRMATION_STATES) ||
    !isNullable(value.policyCode, (candidate): candidate is string =>
      isOneOf(candidate, POLICY_CODES),
    ) ||
    !isNullableIsoTimestamp(value.deadlineAt) ||
    typeof value.isLastMinute !== "boolean" ||
    !isNullable(value.termsPublication, isTermsPublication) ||
    !Array.isArray(value.dogs) ||
    !value.dogs.every(isCustomerDog) ||
    !isNonNegativeInteger(value.unavailableDogCount) ||
    !isNullable(value.deposit, isCustomerDeposit) ||
    !isNullableString(value.dataQualityNote) ||
    !isExactRecord(value.capabilities, ["cancel", "reschedule", "withdraw"]) ||
    !isActionability(value.capabilities.cancel) ||
    !isActionability(value.capabilities.reschedule) ||
    !isActionability(value.capabilities.withdraw) ||
    !isNullable(value.pendingChange, isCustomerPendingChange)
  ) {
    return false;
  }
  return true;
}

function isAttentionVisitRevision(value: unknown): boolean {
  return (
    isExactRecord(value, ["visitId", "visitRevision"]) &&
    isUuid(value.visitId) &&
    isPositiveInteger(value.visitRevision)
  );
}

function isAttentionAlternative(value: unknown): boolean {
  if (
    !isExactRecord(value, [
      "visitId",
      "visitRevision",
      "requestId",
      "requestRevision",
    ]) ||
    !isUuid(value.visitId) ||
    !isPositiveInteger(value.visitRevision) ||
    !isNullableUuid(value.requestId) ||
    !isNullable(value.requestRevision, isPositiveInteger)
  ) {
    return false;
  }
  return (value.requestId === null) === (value.requestRevision === null);
}

function isAttentionPendingChange(value: unknown): boolean {
  return (
    isExactRecord(value, [
      "visitId",
      "visitRevision",
      "requestId",
      "requestRevision",
    ]) &&
    isUuid(value.visitId) &&
    isPositiveInteger(value.visitRevision) &&
    isUuid(value.requestId) &&
    isPositiveInteger(value.requestRevision)
  );
}

function isAttentionDepositCheck(value: unknown): boolean {
  return (
    isExactRecord(value, [
      "visitId",
      "visitRevision",
      "state",
      "dueAt",
    ]) &&
    isUuid(value.visitId) &&
    isPositiveInteger(value.visitRevision) &&
    isOneOf(value.state, new Set(["awaiting_terms", "awaiting_payment"])) &&
    isIsoTimestamp(value.dueAt)
  );
}

function isAttentionReconciliation(value: unknown): boolean {
  return (
    isExactRecord(value, [
      "reconciliationId",
      "visitId",
      "visitRevision",
    ]) &&
    isUuid(value.reconciliationId) &&
    isUuid(value.visitId) &&
    isPositiveInteger(value.visitRevision)
  );
}

function isAttentionThresholdReview(value: unknown): boolean {
  return (
    isExactRecord(value, ["visitId", "visitRevision", "reasonCode"]) &&
    isUuid(value.visitId) &&
    isPositiveInteger(value.visitRevision) &&
    value.reasonCode === "three_incidents_12m"
  );
}

function isAttentionRefund(value: unknown): boolean {
  return (
    isExactRecord(value, [
      "obligationId",
      "humanId",
      "visitId",
      "amountPence",
      "dueAt",
      "refundOrigin",
      "overdue",
    ]) &&
    isUuid(value.obligationId) &&
    isUuid(value.humanId) &&
    isNullableUuid(value.visitId) &&
    isPositiveInteger(value.amountPence) &&
    isIsoTimestamp(value.dueAt) &&
    isOneOf(value.refundOrigin, REFUND_ORIGINS) &&
    typeof value.overdue === "boolean"
  );
}

export function isStaffBookingPolicyAttention(
  value: unknown,
): value is StaffBookingPolicyAttention {
  if (
    !isExactRecord(value, [
      "generatedAt",
      "counts",
      "waitingApprovals",
      "alternatives",
      "pendingChanges",
      "depositChecksDue",
      "depositReconciliations",
      "servicePrepaymentReconciliations",
      "thresholdReviews",
      "refunds",
    ]) ||
    !isIsoTimestamp(value.generatedAt) ||
    !isExactRecord(value.counts, [
      "waitingApprovals",
      "alternatives",
      "pendingChanges",
      "depositChecksDue",
      "depositReconciliations",
      "servicePrepaymentReconciliations",
      "thresholdReviews",
      "refundsPending",
      "refundsOverdue",
    ]) ||
    !Object.values(value.counts).every(isNonNegativeInteger) ||
    !Array.isArray(value.waitingApprovals) ||
    !value.waitingApprovals.every(isAttentionVisitRevision) ||
    !Array.isArray(value.alternatives) ||
    !value.alternatives.every(isAttentionAlternative) ||
    !Array.isArray(value.pendingChanges) ||
    !value.pendingChanges.every(isAttentionPendingChange) ||
    !Array.isArray(value.depositChecksDue) ||
    !value.depositChecksDue.every(isAttentionDepositCheck) ||
    !Array.isArray(value.depositReconciliations) ||
    !value.depositReconciliations.every(isAttentionReconciliation) ||
    !Array.isArray(value.servicePrepaymentReconciliations) ||
    !value.servicePrepaymentReconciliations.every(isAttentionReconciliation) ||
    !Array.isArray(value.thresholdReviews) ||
    !value.thresholdReviews.every(isAttentionThresholdReview) ||
    !Array.isArray(value.refunds) ||
    !value.refunds.every(isAttentionRefund)
  ) {
    return false;
  }

  return (
    value.counts.waitingApprovals === value.waitingApprovals.length &&
    value.counts.alternatives === value.alternatives.length &&
    value.counts.pendingChanges === value.pendingChanges.length &&
    value.counts.depositChecksDue === value.depositChecksDue.length &&
    value.counts.depositReconciliations ===
      value.depositReconciliations.length &&
    value.counts.servicePrepaymentReconciliations ===
      value.servicePrepaymentReconciliations.length &&
    value.counts.thresholdReviews === value.thresholdReviews.length &&
    value.counts.refundsPending === value.refunds.length &&
    value.counts.refundsOverdue ===
      value.refunds.filter((refund) => refund.overdue).length
  );
}

function isStaffVisit(value: unknown): boolean {
  if (
    !isExactRecord(value, [
      "id",
      "revision",
      "lineageId",
      "humanId",
      "bookingDate",
      "lifecycleState",
      "approvalState",
      "confirmationState",
      "policyCode",
      "source",
      "requestedAt",
      "commercialEligibilityAt",
      "eligibilityPolicyCode",
      "confirmedAt",
      "deadlineAt",
      "isLastMinute",
      "supersedesVisitId",
      "continuesCancelledVisitId",
      "cancelledAt",
      "completedAt",
      "dataQuality",
      "termsPublicationId",
      "termsAcknowledgement",
      "termsNoticeMethod",
      "termsNoticeAt",
      "termsNoticeBy",
      "runtimeGeneration",
    ]) ||
    !isUuid(value.id) ||
    !isPositiveInteger(value.revision) ||
    !isUuid(value.lineageId) ||
    !isUuid(value.humanId) ||
    !isIsoDate(value.bookingDate) ||
    !isOneOf(value.lifecycleState, LIFECYCLE_STATES) ||
    !isOneOf(value.approvalState, APPROVAL_STATES) ||
    !isOneOf(value.confirmationState, CONFIRMATION_STATES) ||
    !isNullable(value.policyCode, (candidate): candidate is string =>
      isOneOf(candidate, POLICY_CODES),
    ) ||
    !isNonEmptyString(value.source) ||
    !isIsoTimestamp(value.requestedAt) ||
    !isNullableIsoTimestamp(value.commercialEligibilityAt) ||
    !isNullable(value.eligibilityPolicyCode, (candidate): candidate is string =>
      isOneOf(candidate, POLICY_CODES),
    ) ||
    !isNullableIsoTimestamp(value.confirmedAt) ||
    !isNullableIsoTimestamp(value.deadlineAt) ||
    typeof value.isLastMinute !== "boolean" ||
    !isNullableUuid(value.supersedesVisitId) ||
    !isNullableUuid(value.continuesCancelledVisitId) ||
    !isNullableIsoTimestamp(value.cancelledAt) ||
    !isNullableIsoTimestamp(value.completedAt) ||
    !isOneOf(value.dataQuality, DATA_QUALITY_LEVELS) ||
    !isNullableUuid(value.termsPublicationId) ||
    !isOneOf(value.termsAcknowledgement, TERMS_ACKNOWLEDGEMENTS) ||
    !isNullable(value.termsNoticeMethod, (candidate): candidate is string =>
      isOneOf(candidate, TERMS_NOTICE_METHODS),
    ) ||
    !isNullableIsoTimestamp(value.termsNoticeAt) ||
    !isNullableUuid(value.termsNoticeBy) ||
    !isOneOf(value.runtimeGeneration, RUNTIME_GENERATIONS)
  ) {
    return false;
  }
  if (
    (value.commercialEligibilityAt === null) !==
    (value.eligibilityPolicyCode === null)
  ) {
    return false;
  }
  const hasCompleteStaffNotice =
    value.termsNoticeMethod !== null &&
    value.termsNoticeAt !== null &&
    value.termsNoticeBy !== null;
  if (value.termsAcknowledgement === "staff_notice") {
    return hasCompleteStaffNotice;
  }
  return (
    value.termsNoticeMethod === null &&
    value.termsNoticeAt === null &&
    value.termsNoticeBy === null
  );
}

function isStaffCustomer(value: unknown): boolean {
  return (
    isExactRecord(value, ["id", "name", "surname", "phone", "email"]) &&
    isUuid(value.id) &&
    isString(value.name) &&
    isNullableString(value.surname) &&
    isNullableString(value.phone) &&
    isNullableString(value.email)
  );
}

function isStaffDog(value: unknown): boolean {
  return (
    isExactRecord(value, [
      "bookingId",
      "dogId",
      "dogName",
      "slot",
      "service",
      "addOns",
      "size",
      "status",
      "membershipState",
      "payment",
      "paymentMethod",
      "paidAt",
      "paidAmount",
    ]) &&
    isUuid(value.bookingId) &&
    isUuid(value.dogId) &&
    isString(value.dogName) &&
    isNonEmptyString(value.slot) &&
    isString(value.service) &&
    isStringArray(value.addOns) &&
    isOneOf(value.size, DOG_SIZES) &&
    isOneOf(value.status, BOOKING_STATUSES) &&
    isOneOf(value.membershipState, VISIT_MEMBERSHIP_STATES) &&
    isNullableString(value.payment) &&
    isNullableString(value.paymentMethod) &&
    isNullableIsoTimestamp(value.paidAt) &&
    (value.paidAmount === null || isNonNegativeNumber(value.paidAmount))
  );
}

function isStaffDeposit(value: unknown): boolean {
  if (
    !isExactRecord(value, [
      "state",
      "amountPence",
      "requirementReason",
      "exemptionReason",
      "dueAt",
      "customerPaymentReference",
      "staffVerificationReference",
      "satisfactionSource",
      "satisfactionEventId",
      "dispositionEventId",
      "bankReceivedAt",
      "termsPublicationId",
      "termsAcceptedAt",
      "updatedAt",
    ]) ||
    !isOneOf(value.state, DEPOSIT_STATES) ||
    value.amountPence !== 1000 ||
    !isNullableString(value.requirementReason) ||
    !isNullableString(value.exemptionReason) ||
    !isNullableIsoTimestamp(value.dueAt) ||
    !isNullableString(value.customerPaymentReference) ||
    !isNullableString(value.staffVerificationReference) ||
    !isNullable(value.satisfactionSource, (candidate): candidate is string =>
      isOneOf(candidate, DEPOSIT_SATISFACTION_SOURCES),
    ) ||
    !isNullableUuid(value.satisfactionEventId) ||
    !isNullableUuid(value.dispositionEventId) ||
    !isNullableIsoTimestamp(value.bankReceivedAt) ||
    !isNullableUuid(value.termsPublicationId) ||
    !isNullableIsoTimestamp(value.termsAcceptedAt) ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    return false;
  }

  if (value.state === "not_required") {
    return (
      value.dueAt === null &&
      value.bankReceivedAt === null &&
      value.satisfactionSource === null &&
      value.satisfactionEventId === null &&
      value.dispositionEventId === null
    );
  }

  if (value.state === "awaiting_terms" || value.state === "awaiting_payment") {
    return (
      value.dueAt !== null &&
      isNonEmptyString(value.requirementReason) &&
      value.bankReceivedAt === null &&
      value.satisfactionSource === null &&
      value.satisfactionEventId === null &&
      value.dispositionEventId === null &&
      value.termsPublicationId !== null &&
      (value.state !== "awaiting_payment" || value.termsAcceptedAt !== null)
    );
  }

  if (value.state === "received") {
    if (
      value.satisfactionSource === null ||
      value.satisfactionEventId === null ||
      value.dispositionEventId !== null
    ) {
      return false;
    }
    if (value.satisfactionSource === "bank") {
      return value.bankReceivedAt !== null;
    }
    if (
      value.satisfactionSource === "credit" ||
      value.satisfactionSource === "transfer"
    ) {
      return value.bankReceivedAt === null;
    }
    return true;
  }

  if (value.state === "received_liability") {
    return (
      value.satisfactionSource === "bank" &&
      value.satisfactionEventId !== null &&
      value.bankReceivedAt !== null
    );
  }

  return (
    value.satisfactionSource === null &&
    value.satisfactionEventId === null &&
    value.dispositionEventId === null
  );
}

function isBillSummary(value: unknown): boolean {
  return (
    isExactRecord(value, [
      "billRevision",
      "grossServiceTotalPence",
      "nonDepositPaidPence",
      "depositPartPaymentPence",
      "amountDuePence",
    ]) &&
    isPositiveInteger(value.billRevision) &&
    isNonNegativeInteger(value.grossServiceTotalPence) &&
    isNonNegativeInteger(value.nonDepositPaidPence) &&
    isNonNegativeInteger(value.depositPartPaymentPence) &&
    isNonNegativeInteger(value.amountDuePence)
  );
}

function isDestinationReservation(
  value: unknown,
): value is StaffBookingDestinationReservation {
  return (
    isExactRecord(value, [
      "id",
      "proposalRevision",
      "purpose",
      "bookingDate",
      "slotAssignments",
      "destinationHash",
      "state",
    ]) &&
    isUuid(value.id) &&
    isPositiveInteger(value.proposalRevision) &&
    isOneOf(value.purpose, DESTINATION_PURPOSES) &&
    isIsoDate(value.bookingDate) &&
    isNonNullJsonValue(value.slotAssignments) &&
    isNonEmptyString(value.destinationHash) &&
    isOneOf(value.state, DESTINATION_STATES)
  );
}

function isChangeRequest(value: unknown): boolean {
  if (
    !isExactRecord(value, [
      "id",
      "revision",
      "sourceVisitId",
      "sourceVisitRevision",
      "proposedVisitId",
      "humanId",
      "kind",
      "channel",
      "reasonCode",
      "status",
      "requestedAt",
      "receivedAt",
      "providerMessageId",
      "customerMessage",
      "requestedBookingDate",
      "requestedSlotAssignments",
      "destinationHash",
      "sourceRevision",
      "reviewId",
      "decidedAt",
      "decidedBy",
      "decisionReason",
      "destinationReservation",
    ]) ||
    !isUuid(value.id) ||
    !isPositiveInteger(value.revision) ||
    !isUuid(value.sourceVisitId) ||
    !isPositiveInteger(value.sourceVisitRevision) ||
    !isNullableUuid(value.proposedVisitId) ||
    !isUuid(value.humanId) ||
    !isOneOf(value.kind, CHANGE_KINDS) ||
    !isOneOf(value.channel, CHANGE_CHANNELS) ||
    !isOneOf(value.reasonCode, CHANGE_REASON_CODES) ||
    !isOneOf(value.status, CHANGE_STATUSES) ||
    !isIsoTimestamp(value.requestedAt) ||
    !isIsoTimestamp(value.receivedAt) ||
    !isNullableString(value.providerMessageId) ||
    !isNullableString(value.customerMessage) ||
    (value.requestedBookingDate !== null &&
      !isIsoDate(value.requestedBookingDate)) ||
    !isJsonValue(value.requestedSlotAssignments) ||
    !isNullableString(value.destinationHash) ||
    !isNullable(value.sourceRevision, isPositiveInteger) ||
    !isNullableUuid(value.reviewId) ||
    !isNullableIsoTimestamp(value.decidedAt) ||
    !isNullableUuid(value.decidedBy) ||
    !isNullableString(value.decisionReason) ||
    !isNullable(value.destinationReservation, isDestinationReservation)
  ) {
    return false;
  }

  if (value.channel === "whatsapp" && value.providerMessageId === null) {
    return false;
  }
  if (
    value.proposedVisitId !== null &&
    value.status !== "accepted" &&
    value.status !== "closed"
  ) {
    return false;
  }
  if (value.kind === "cancel" && !CANCEL_REASON_CODES.has(value.reasonCode)) {
    return false;
  }
  if (
    (value.kind === "staff_alternative" &&
      value.reasonCode !== "staff_alternative") ||
    (value.kind === "partial_change" &&
      value.reasonCode !== "staff_partial_change")
  ) {
    return false;
  }

  const destinationReservation = value.destinationReservation;
  if (
    destinationReservation !== null &&
    !isDestinationReservation(destinationReservation)
  ) {
    return false;
  }

  const hasRequestedDestination =
    value.kind === "reschedule" || value.kind === "staff_alternative";
  if (!hasRequestedDestination) {
    return (
      value.requestedBookingDate === null &&
      value.requestedSlotAssignments === null &&
      value.destinationHash === null &&
      value.sourceRevision === null &&
      value.reviewId === null &&
      destinationReservation === null
    );
  }

  if (
    value.requestedBookingDate === null ||
    value.requestedSlotAssignments === null ||
    !isNonEmptyString(value.destinationHash) ||
    value.sourceRevision === null
  ) {
    return false;
  }

  if (destinationReservation === null) return true;
  if (
    destinationReservation.purpose === "auto_confirm_review" &&
    (destinationReservation.bookingDate !== value.requestedBookingDate ||
      destinationReservation.destinationHash !== value.destinationHash)
  ) {
    return false;
  }
  return !(
    (destinationReservation.purpose === "new_booking_alternative" &&
      value.kind !== "staff_alternative") ||
    (destinationReservation.purpose === "reschedule_counterproposal" &&
      value.kind !== "reschedule")
  );
}

function isIncidentAudit(value: unknown): boolean {
  return (
    isExactRecord(value, [
      "id",
      "action",
      "reason",
      "actorId",
      "occurredAt",
    ]) &&
    isUuid(value.id) &&
    isOneOf(value.action, INCIDENT_AUDIT_ACTIONS) &&
    isNonEmptyString(value.reason) &&
    isUuid(value.actorId) &&
    isIsoTimestamp(value.occurredAt)
  );
}

function isIncident(value: unknown): boolean {
  if (
    !isExactRecord(value, [
      "id",
      "revision",
      "visitId",
      "visitRevision",
      "humanId",
      "kind",
      "appointmentDate",
      "reason",
      "recordedAt",
      "recordedBy",
      "waivedAt",
      "waivedBy",
      "waiverReason",
      "audit",
    ]) ||
    !isUuid(value.id) ||
    !isPositiveInteger(value.revision) ||
    !isUuid(value.visitId) ||
    !isPositiveInteger(value.visitRevision) ||
    !isUuid(value.humanId) ||
    !isOneOf(value.kind, INCIDENT_KINDS) ||
    !isIsoDate(value.appointmentDate) ||
    !isNonEmptyString(value.reason) ||
    !isIsoTimestamp(value.recordedAt) ||
    !isUuid(value.recordedBy) ||
    !isNullableIsoTimestamp(value.waivedAt) ||
    !isNullableUuid(value.waivedBy) ||
    !isNullableString(value.waiverReason) ||
    !Array.isArray(value.audit) ||
    !value.audit.every(isIncidentAudit)
  ) {
    return false;
  }
  return (
    (value.waivedAt === null) === (value.waivedBy === null) &&
    (value.waivedAt === null) === (value.waiverReason === null)
  );
}

function isDepositReconciliation(value: unknown): boolean {
  if (
    !isExactRecord(value, [
      "id",
      "visitId",
      "amountPence",
      "state",
      "openedReason",
      "resolution",
      "resolutionEventId",
      "openedAt",
      "resolvedAt",
      "resolvedBy",
    ]) ||
    !isUuid(value.id) ||
    !isUuid(value.visitId) ||
    value.amountPence !== 1000 ||
    !isOneOf(value.state, new Set(["open", "resolved"])) ||
    !isNonEmptyString(value.openedReason) ||
    !isNullable(value.resolution, (candidate): candidate is string =>
      isOneOf(candidate, new Set(["refund", "credit", "transfer"])),
    ) ||
    !isNullableUuid(value.resolutionEventId) ||
    !isIsoTimestamp(value.openedAt) ||
    !isNullableIsoTimestamp(value.resolvedAt) ||
    !isNullableUuid(value.resolvedBy)
  ) {
    return false;
  }

  const hasNoResolutionEvidence =
    value.resolution === null &&
    value.resolutionEventId === null &&
    value.resolvedAt === null;
  return (value.state === "open") === hasNoResolutionEvidence;
}

function isServicePrepaymentReconciliation(value: unknown): boolean {
  if (
    !isExactRecord(value, [
      "id",
      "visitId",
      "amountPence",
      "evidence",
      "state",
      "targetVisitId",
      "obligationEventId",
      "openedReason",
      "openedAt",
      "resolvedAt",
      "resolvedBy",
      "resolutionReason",
    ]) ||
    !isUuid(value.id) ||
    !isUuid(value.visitId) ||
    !isPositiveInteger(value.amountPence) ||
    !isNonNullJsonValue(value.evidence) ||
    !isOneOf(
      value.state,
      new Set(["open", "refund_due", "transferred", "closed"]),
    ) ||
    !isNullableUuid(value.targetVisitId) ||
    !isNullableUuid(value.obligationEventId) ||
    !isNonEmptyString(value.openedReason) ||
    !isIsoTimestamp(value.openedAt) ||
    !isNullableIsoTimestamp(value.resolvedAt) ||
    !isNullableUuid(value.resolvedBy) ||
    !isNullableString(value.resolutionReason)
  ) {
    return false;
  }

  if ((value.state === "open") !== (value.resolvedAt === null)) {
    return false;
  }
  if (value.state === "transferred" && value.targetVisitId === null) {
    return false;
  }
  return value.state !== "refund_due" || value.obligationEventId !== null;
}

function isFinancialLedgerRow(value: unknown): boolean {
  if (
    !isExactRecord(value, [
      "id",
      "humanId",
      "visitId",
      "relatedVisitId",
      "eventKind",
      "amountPence",
      "reason",
      "dueAt",
      "settlesEventId",
      "actualPaidAt",
      "bankReference",
      "refundOrigin",
      "refundDeadlineBasis",
      "refundCalendarSource",
      "refundCalendarCoverageId",
      "recordedBy",
      "recordedAt",
    ]) ||
    !isUuid(value.id) ||
    !isUuid(value.humanId) ||
    !isNullableUuid(value.visitId) ||
    !isNullableUuid(value.relatedVisitId) ||
    !isOneOf(value.eventKind, FINANCIAL_EVENT_KINDS) ||
    !isPositiveInteger(value.amountPence) ||
    !isString(value.reason) ||
    !isNullableIsoTimestamp(value.dueAt) ||
    !isNullableUuid(value.settlesEventId) ||
    !isNullableIsoTimestamp(value.actualPaidAt) ||
    !isNullableString(value.bankReference) ||
    !isNullable(value.refundOrigin, (candidate): candidate is string =>
      isOneOf(candidate, REFUND_ORIGINS),
    ) ||
    !isNullable(value.refundDeadlineBasis, (candidate): candidate is string =>
      isOneOf(candidate, REFUND_DEADLINE_BASES),
    ) ||
    !isNullableString(value.refundCalendarSource) ||
    !isNullableUuid(value.refundCalendarCoverageId) ||
    !isNullableUuid(value.recordedBy) ||
    !isIsoTimestamp(value.recordedAt)
  ) {
    return false;
  }

  const isSettlement =
    value.eventKind === "refund_paid" ||
    value.eventKind === "refund_cancelled";
  if (isSettlement !== (value.settlesEventId !== null)) {
    return false;
  }

  if (value.eventKind === "refund_due") {
    if (
      value.dueAt === null ||
      value.refundOrigin === null ||
      value.refundDeadlineBasis === null ||
      value.settlesEventId !== null ||
      value.actualPaidAt !== null ||
      value.bankReference !== null
    ) {
      return false;
    }
    if (value.refundDeadlineBasis === "deposit_working_days") {
      return (
        (value.refundOrigin === "deposit" ||
          value.refundOrigin === "account_credit") &&
        value.refundCalendarSource !== null &&
        value.refundCalendarCoverageId !== null
      );
    }
    return (
      value.refundOrigin === "service_prepayment" &&
      value.refundCalendarSource === null &&
      value.refundCalendarCoverageId === null
    );
  }

  if (
    value.dueAt !== null ||
    value.refundOrigin !== null ||
    value.refundDeadlineBasis !== null ||
    value.refundCalendarSource !== null ||
    value.refundCalendarCoverageId !== null
  ) {
    return false;
  }

  if (value.eventKind === "refund_paid") {
    return (
      value.actualPaidAt !== null && isNonBlankString(value.bankReference)
    );
  }
  return value.actualPaidAt === null && value.bankReference === null;
}

function isPolicyAuditRow(value: unknown): boolean {
  return (
    isExactRecord(value, [
      "id",
      "visitId",
      "humanId",
      "action",
      "actorId",
      "actorScope",
      "reason",
      "detail",
      "occurredAt",
    ]) &&
    isUuid(value.id) &&
    isNullableUuid(value.visitId) &&
    isNullableUuid(value.humanId) &&
    isNonEmptyString(value.action) &&
    isNullableUuid(value.actorId) &&
    isOneOf(value.actorScope, ACTOR_SCOPES) &&
    isNullableString(value.reason) &&
    isJsonValue(value.detail) &&
    isIsoTimestamp(value.occurredAt)
  );
}

export function isStaffBookingVisit(
  value: unknown,
): value is StaffBookingVisitProjection {
  return (
    isExactRecord(value, [
      "visit",
      "customer",
      "dogs",
      "deposit",
      "billSummary",
      "changeRequests",
      "incidents",
      "depositReconciliations",
      "servicePrepaymentReconciliations",
      "financialLedger",
      "policyAudit",
    ]) &&
    isStaffVisit(value.visit) &&
    isStaffCustomer(value.customer) &&
    Array.isArray(value.dogs) &&
    value.dogs.every(isStaffDog) &&
    isNullable(value.deposit, isStaffDeposit) &&
    isBillSummary(value.billSummary) &&
    Array.isArray(value.changeRequests) &&
    value.changeRequests.every(isChangeRequest) &&
    Array.isArray(value.incidents) &&
    value.incidents.every(isIncident) &&
    Array.isArray(value.depositReconciliations) &&
    value.depositReconciliations.every(isDepositReconciliation) &&
    Array.isArray(value.servicePrepaymentReconciliations) &&
    value.servicePrepaymentReconciliations.every(
      isServicePrepaymentReconciliation,
    ) &&
    Array.isArray(value.financialLedger) &&
    value.financialLedger.every(isFinancialLedgerRow) &&
    Array.isArray(value.policyAudit) &&
    value.policyAudit.every(isPolicyAuditRow)
  );
}
