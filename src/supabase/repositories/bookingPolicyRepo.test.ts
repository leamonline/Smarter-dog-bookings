import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  getStaffBookingVisit,
  listCustomerBookingVisits,
  listStaffBookingPolicyAttention,
} from "./bookingPolicyRepo";

const VISIT_ID = "11111111-1111-4111-8111-111111111111";
const LINEAGE_ID = "22222222-2222-4222-8222-222222222222";
const HUMAN_ID = "33333333-3333-4333-8333-333333333333";
const BOOKING_ID = "44444444-4444-4444-8444-444444444444";
const DOG_ID = "55555555-5555-4555-8555-555555555555";
const REQUEST_ID = "66666666-6666-4666-8666-666666666666";
const INCIDENT_ID = "77777777-7777-4777-8777-777777777777";
const ACTOR_ID = "88888888-8888-4888-8888-888888888888";
const EVENT_ID = "99999999-9999-4999-8999-999999999999";
const RECONCILIATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SERVICE_RECONCILIATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PUBLICATION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RESERVATION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const AUDIT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OBLIGATION_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const POSTGRES_CANONICAL_UUID = "00000000-0000-0000-0000-000000000000";

const malformedRpcError = {
  code: 42501,
  message: 17,
  details: { leaked: "shape" },
  hint: ["not", "a", "string"],
};

const normalisedMalformedRpcError = {
  code: "RPC_ERROR",
  message: "The booking policy request failed.",
  details: null,
  hint: null,
};

const actionability = {
  allowed: true,
  reasonCode: null,
  deadlinePassed: false,
  switchEnabled: true,
  stateEligible: true,
  moveLimitReached: false,
  processingStateSafe: true,
  deadlineAt: "2026-09-06T14:00:00Z",
  lifecycleState: "active",
  approvalState: "approved",
  confirmationState: "confirmed",
  isLastMinute: false,
  remainingSelfServiceReschedules: 2,
};

const customerVisit = {
  id: VISIT_ID,
  revision: 4,
  bookingDate: "2026-09-07",
  lifecycleState: "active",
  approvalState: "approved",
  confirmationState: "confirmed",
  policyCode: "previous_day_1500_v1",
  deadlineAt: "2026-09-06T14:00:00Z",
  isLastMinute: false,
  termsPublication: {
    id: PUBLICATION_ID,
    publicUrl: "https://smarterdog.co.uk/terms/2026-07",
    version: "2026-07",
  },
  dogs: [
    {
      bookingId: BOOKING_ID,
      dogId: DOG_ID,
      dogName: "Alfie",
      slot: "09:00",
      serviceLabel: "Full Groom",
      addOnLabels: ["Teeth clean"],
    },
  ],
  unavailableDogCount: 0,
  deposit: {
    state: "awaiting_payment",
    amountPence: 1000,
    dueAt: "2026-08-01T12:00:00Z",
    paymentInstructions: {
      accountName: "Smarter Dog",
      sortCode: "12-34-56",
      accountNumber: "12345678",
      customerReference: "SD-123",
    },
    reason: "A £10 deposit is needed because of recent booking history.",
  },
  dataQualityNote: null,
  capabilities: {
    cancel: actionability,
    reschedule: actionability,
    withdraw: { ...actionability, allowed: false, reasonCode: "state_not_eligible" },
  },
  pendingChange: {
    requestId: REQUEST_ID,
    revision: 3,
    status: "pending_staff",
    staffReviewReason: "auto_confirm_disabled_staff_review",
    requestedBookingDate: "2026-09-14",
    slots: ["09:30"],
    capacityHeld: true,
    destinationHash: "sha256:requested-destination",
    proposalId: RESERVATION_ID,
    proposalRevision: 2,
  },
};

const attention = {
  generatedAt: "2026-07-26T15:00:00Z",
  counts: {
    waitingApprovals: 1,
    alternatives: 1,
    pendingChanges: 1,
    depositChecksDue: 1,
    depositReconciliations: 1,
    servicePrepaymentReconciliations: 1,
    thresholdReviews: 1,
    refundsPending: 1,
    refundsOverdue: 1,
  },
  waitingApprovals: [{ visitId: VISIT_ID, visitRevision: 4 }],
  alternatives: [
    {
      visitId: VISIT_ID,
      visitRevision: 4,
      requestId: REQUEST_ID,
      requestRevision: 3,
    },
  ],
  pendingChanges: [
    {
      visitId: VISIT_ID,
      visitRevision: 4,
      requestId: REQUEST_ID,
      requestRevision: 3,
    },
  ],
  depositChecksDue: [
    {
      visitId: VISIT_ID,
      visitRevision: 4,
      state: "awaiting_payment",
      dueAt: "2026-07-26T15:00:00Z",
    },
  ],
  depositReconciliations: [
    {
      reconciliationId: RECONCILIATION_ID,
      visitId: VISIT_ID,
      visitRevision: 4,
    },
  ],
  servicePrepaymentReconciliations: [
    {
      reconciliationId: SERVICE_RECONCILIATION_ID,
      visitId: VISIT_ID,
      visitRevision: 4,
    },
  ],
  thresholdReviews: [
    {
      visitId: VISIT_ID,
      visitRevision: 4,
      reasonCode: "three_incidents_12m",
    },
  ],
  refunds: [
    {
      obligationId: OBLIGATION_ID,
      humanId: HUMAN_ID,
      visitId: null,
      amountPence: 1000,
      dueAt: "2026-07-26T15:00:00Z",
      refundOrigin: "account_credit",
      overdue: true,
    },
  ],
};

const changeRequest = {
  id: REQUEST_ID,
  revision: 3,
  sourceVisitId: VISIT_ID,
  sourceVisitRevision: 4,
  proposedVisitId: null,
  humanId: HUMAN_ID,
  kind: "reschedule",
  channel: "website",
  reasonCode: "auto_confirm_disabled_staff_review",
  status: "pending_staff",
  requestedAt: "2026-07-25T10:00:00Z",
  receivedAt: "2026-07-25T10:00:02Z",
  providerMessageId: null,
  customerMessage: "Could we move to Monday?",
  requestedBookingDate: "2026-09-14",
  requestedSlotAssignments: [{ dogId: DOG_ID, slot: "09:30" }],
  destinationHash: "sha256:requested-destination",
  sourceRevision: 4,
  reviewId: null,
  decidedAt: null,
  decidedBy: null,
  decisionReason: null,
  destinationReservation: {
    id: RESERVATION_ID,
    proposalRevision: 2,
    purpose: "auto_confirm_review",
    bookingDate: "2026-09-14",
    slotAssignments: [{ dogId: DOG_ID, slot: "09:30" }],
    destinationHash: "sha256:requested-destination",
    state: "held",
  },
};

const incident = {
  id: INCIDENT_ID,
  revision: 2,
  visitId: VISIT_ID,
  visitRevision: 4,
  humanId: HUMAN_ID,
  kind: "late_cancellation",
  appointmentDate: "2026-09-07",
  reason: "Customer cancelled after the deadline",
  recordedAt: "2026-09-06T15:00:00Z",
  recordedBy: ACTOR_ID,
  waivedAt: null,
  waivedBy: null,
  waiverReason: null,
  audit: [
    {
      id: AUDIT_ID,
      action: "recorded",
      reason: "Customer cancelled after the deadline",
      actorId: ACTOR_ID,
      occurredAt: "2026-09-06T15:00:00Z",
    },
  ],
};

const staffVisit = {
  visit: {
    id: VISIT_ID,
    revision: 4,
    lineageId: LINEAGE_ID,
    humanId: HUMAN_ID,
    bookingDate: "2026-09-07",
    lifecycleState: "active",
    approvalState: "approved",
    confirmationState: "confirmed",
    policyCode: "previous_day_1500_v1",
    source: "website",
    requestedAt: "2026-07-25T09:00:00Z",
    commercialEligibilityAt: "2026-07-25T09:00:00Z",
    eligibilityPolicyCode: "previous_day_1500_v1",
    confirmedAt: "2026-07-25T09:10:00Z",
    deadlineAt: "2026-09-06T14:00:00Z",
    isLastMinute: false,
    supersedesVisitId: null,
    continuesCancelledVisitId: null,
    cancelledAt: null,
    completedAt: null,
    dataQuality: "v1_authoritative",
    termsPublicationId: PUBLICATION_ID,
    termsAcknowledgement: "customer_accepted",
    termsNoticeMethod: null,
    termsNoticeAt: null,
    termsNoticeBy: null,
    runtimeGeneration: "visit_v1",
  },
  customer: {
    id: HUMAN_ID,
    name: "Alex",
    surname: "Taylor",
    phone: "07123456789",
    email: "alex@example.com",
  },
  dogs: [
    {
      bookingId: BOOKING_ID,
      dogId: DOG_ID,
      dogName: "Alfie",
      slot: "09:00",
      service: "Full Groom",
      addOns: ["Teeth clean"],
      size: "small",
      status: "Booked",
      membershipState: "included",
      payment: "Deposit Paid",
      paymentMethod: "Bank transfer",
      paidAt: "2026-07-25T09:10:00Z",
      paidAmount: 10,
    },
  ],
  deposit: {
    state: "received",
    amountPence: 1000,
    requirementReason: "recent_booking_history",
    exemptionReason: null,
    dueAt: "2026-07-26T09:00:00Z",
    customerPaymentReference: "SD-123",
    staffVerificationReference: "BANK-123",
    satisfactionSource: "bank",
    satisfactionEventId: EVENT_ID,
    dispositionEventId: null,
    bankReceivedAt: "2026-07-25T09:09:00Z",
    termsPublicationId: PUBLICATION_ID,
    termsAcceptedAt: "2026-07-25T09:05:00Z",
    updatedAt: "2026-07-25T09:10:00Z",
  },
  billSummary: {
    billRevision: 1,
    grossServiceTotalPence: 6500,
    nonDepositPaidPence: 0,
    depositPartPaymentPence: 1000,
    amountDuePence: 5500,
  },
  changeRequests: [changeRequest],
  incidents: [incident],
  depositReconciliations: [
    {
      id: RECONCILIATION_ID,
      visitId: VISIT_ID,
      amountPence: 1000,
      state: "resolved",
      openedReason: "Payment found after release",
      resolution: "refund",
      resolutionEventId: OBLIGATION_ID,
      openedAt: "2026-07-25T09:00:00Z",
      resolvedAt: "2026-07-25T10:00:00Z",
      resolvedBy: ACTOR_ID,
    },
  ],
  servicePrepaymentReconciliations: [
    {
      id: SERVICE_RECONCILIATION_ID,
      visitId: VISIT_ID,
      amountPence: 5500,
      evidence: { bookingIds: [BOOKING_ID], source: "legacy_payment" },
      state: "refund_due",
      targetVisitId: null,
      obligationEventId: OBLIGATION_ID,
      openedReason: "Prepaid service on a cancelled visit",
      openedAt: "2026-07-25T09:00:00Z",
      resolvedAt: "2026-07-25T10:00:00Z",
      resolvedBy: ACTOR_ID,
      resolutionReason: "Customer requested a refund",
    },
  ],
  financialLedger: [
    {
      id: EVENT_ID,
      humanId: HUMAN_ID,
      visitId: VISIT_ID,
      relatedVisitId: null,
      eventKind: "deposit_received",
      amountPence: 1000,
      reason: "Deposit verified",
      dueAt: null,
      settlesEventId: null,
      actualPaidAt: null,
      bankReference: null,
      refundOrigin: null,
      refundDeadlineBasis: null,
      refundCalendarSource: null,
      refundCalendarCoverageId: null,
      recordedBy: ACTOR_ID,
      recordedAt: "2026-07-25T09:10:00Z",
    },
  ],
  policyAudit: [
    {
      id: AUDIT_ID,
      visitId: VISIT_ID,
      humanId: HUMAN_ID,
      action: "deposit_verified",
      actorId: ACTOR_ID,
      actorScope: "staff",
      reason: "Matched bank receipt",
      detail: { reference: "BANK-123" },
      occurredAt: "2026-07-25T09:10:00Z",
    },
  ],
};

function fakeClient(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  return {
    client: { rpc } as unknown as SupabaseClient,
    rpc,
  };
}

describe("listCustomerBookingVisits", () => {
  it("calls the owned projection with the requested history preference", async () => {
    const { client, rpc } = fakeClient({ data: [customerVisit], error: null });

    const result = await listCustomerBookingVisits(client, false);

    expect(rpc).toHaveBeenCalledWith("list_customer_booking_visits", {
      p_include_history: false,
    });
    expect(result).toEqual({ visits: [customerVisit], error: null });
  });

  it("passes a null preference when the caller uses the server setting", async () => {
    const { client, rpc } = fakeClient({ data: [], error: null });

    await listCustomerBookingVisits(client);

    expect(rpc).toHaveBeenCalledWith("list_customer_booking_visits", {
      p_include_history: null,
    });
  });

  it("accepts canonical PostgreSQL UUID values without imposing RFC version bits", async () => {
    const visit = { ...customerVisit, id: POSTGRES_CANONICAL_UUID };
    const { client } = fakeClient({ data: [visit], error: null });

    const result = await listCustomerBookingVisits(client);

    expect(result).toEqual({ visits: [visit], error: null });
  });

  it("accepts the customer-safe staff-review reason", async () => {
    const visit = {
      ...customerVisit,
      pendingChange: {
        ...customerVisit.pendingChange,
        staffReviewReason: "staff_review",
      },
    };
    const { client } = fakeClient({ data: [visit], error: null });

    const result = await listCustomerBookingVisits(client);

    expect(result).toEqual({ visits: [visit], error: null });
  });

  it.each([
    ["missing visit revision", { ...customerVisit, revision: undefined }],
    ["fractional visit revision", { ...customerVisit, revision: 1.5 }],
    ["malformed visit ID", { ...customerVisit, id: "not-a-uuid" }],
    ["malformed booking date", { ...customerVisit, bookingDate: "2026-02-30" }],
    ["malformed deadline", { ...customerVisit, deadlineAt: "tomorrow" }],
    [
      "a syntactically shaped but impossible deadline",
      { ...customerVisit, deadlineAt: "2026-02-30T12:00:00Z" },
    ],
    ["non-boolean last-minute flag", { ...customerVisit, isLastMinute: 0 }],
    [
      "a non-HTTPS Terms publication",
      {
        ...customerVisit,
        termsPublication: {
          ...customerVisit.termsPublication,
          publicUrl: "http://smarterdog.co.uk/terms/2026-07",
        },
      },
    ],
    [
      "incomplete actionability",
      {
        ...customerVisit,
        capabilities: {
          ...customerVisit.capabilities,
          cancel: { allowed: true, reasonCode: null },
        },
      },
    ],
    [
      "missing pending-change revision",
      {
        ...customerVisit,
        pendingChange: { ...customerVisit.pendingChange, revision: undefined },
      },
    ],
    [
      "fractional pending-change revision",
      {
        ...customerVisit,
        pendingChange: { ...customerVisit.pendingChange, revision: 2.25 },
      },
    ],
    [
      "staff-only leaked field",
      { ...customerVisit, incidentCount: 3 },
    ],
    [
      "an internal late-request reason",
      {
        ...customerVisit,
        pendingChange: {
          ...customerVisit.pendingChange,
          staffReviewReason: "source_deadline_late",
        },
      },
    ],
  ])("rejects the whole customer response for %s", async (_label, malformed) => {
    const { client } = fakeClient({
      data: [customerVisit, malformed],
      error: null,
    });

    const result = await listCustomerBookingVisits(client);

    expect(result.visits).toEqual([]);
    expect(result.error).toMatchObject({
      code: "INVALID_BOOKING_POLICY_PROJECTION",
    });
  });

  it("preserves a structured RPC error", async () => {
    const remoteError = {
      code: "42501",
      message: "Not authorised",
      details: null,
      hint: null,
    };
    const { client } = fakeClient({ data: null, error: remoteError });

    const result = await listCustomerBookingVisits(client);

    expect(result).toEqual({ visits: [], error: remoteError });
  });

  it("normalises a malformed RPC error instead of leaking an untyped shape", async () => {
    const { client } = fakeClient({ data: null, error: malformedRpcError });

    const result = await listCustomerBookingVisits(client);

    expect(result).toEqual({
      visits: [],
      error: normalisedMalformedRpcError,
    });
  });
});

describe("listStaffBookingPolicyAttention", () => {
  it("calls the staff queue RPC without caller-controlled filters", async () => {
    const { client, rpc } = fakeClient({ data: attention, error: null });

    const result = await listStaffBookingPolicyAttention(client);

    expect(rpc).toHaveBeenCalledWith("list_staff_booking_policy_attention");
    expect(result).toEqual({ attention, error: null });
  });

  it.each([
    [
      "a count that does not match its queue",
      { ...attention, counts: { ...attention.counts, waitingApprovals: 2 } },
    ],
    [
      "a refund-overdue count that does not match the overdue rows",
      { ...attention, counts: { ...attention.counts, refundsOverdue: 0 } },
    ],
    [
      "a fractional request revision",
      {
        ...attention,
        pendingChanges: [
          { ...attention.pendingChanges[0], requestRevision: 1.5 },
        ],
      },
    ],
    [
      "a malformed generated timestamp",
      { ...attention, generatedAt: "now" },
    ],
    [
      "a syntactically shaped but impossible generated timestamp",
      { ...attention, generatedAt: "2026-02-30T15:00:00Z" },
    ],
    [
      "one malformed item among valid attention items",
      {
        ...attention,
        counts: { ...attention.counts, waitingApprovals: 2 },
        waitingApprovals: [
          attention.waitingApprovals[0],
          { ...attention.waitingApprovals[0], visitId: "not-a-uuid" },
        ],
      },
    ],
  ])("rejects the whole attention response for %s", async (_label, malformed) => {
    const { client } = fakeClient({ data: malformed, error: null });

    const result = await listStaffBookingPolicyAttention(client);

    expect(result.attention).toBeNull();
    expect(result.error).toMatchObject({
      code: "INVALID_BOOKING_POLICY_PROJECTION",
    });
  });

  it("normalises a malformed RPC error instead of leaking an untyped shape", async () => {
    const { client } = fakeClient({ data: null, error: malformedRpcError });

    const result = await listStaffBookingPolicyAttention(client);

    expect(result).toEqual({
      attention: null,
      error: normalisedMalformedRpcError,
    });
  });
});

describe("getStaffBookingVisit", () => {
  it("calls the staff detail RPC with exactly one visit ID", async () => {
    const { client, rpc } = fakeClient({ data: staffVisit, error: null });

    const result = await getStaffBookingVisit(client, VISIT_ID);

    expect(rpc).toHaveBeenCalledWith("list_staff_booking_visit", {
      p_visit_id: VISIT_ID,
    });
    expect(result).toEqual({ visit: staffVisit, error: null });
  });

  it("accepts null when the visit does not exist", async () => {
    const { client } = fakeClient({ data: null, error: null });

    const result = await getStaffBookingVisit(client, VISIT_ID);

    expect(result).toEqual({ visit: null, error: null });
  });

  it("accepts canonical PostgreSQL UUID input without imposing RFC version bits", async () => {
    const { client, rpc } = fakeClient({ data: staffVisit, error: null });

    const result = await getStaffBookingVisit(
      client,
      POSTGRES_CANONICAL_UUID,
    );

    expect(rpc).toHaveBeenCalledWith("list_staff_booking_visit", {
      p_visit_id: POSTGRES_CANONICAL_UUID,
    });
    expect(result).toEqual({ visit: staffVisit, error: null });
  });

  it("accepts complete staff-recorded Terms notice evidence", async () => {
    const visit = {
      ...staffVisit,
      visit: {
        ...staffVisit.visit,
        termsAcknowledgement: "staff_notice",
        termsNoticeMethod: "phone",
        termsNoticeAt: "2026-07-25T09:00:00Z",
        termsNoticeBy: ACTOR_ID,
      },
    };
    const { client } = fakeClient({ data: visit, error: null });

    const result = await getStaffBookingVisit(client, VISIT_ID);

    expect(result).toEqual({ visit, error: null });
  });

  it.each([
    [
      "a missing visit revision",
      { ...staffVisit, visit: { ...staffVisit.visit, revision: undefined } },
    ],
    [
      "a fractional visit revision",
      { ...staffVisit, visit: { ...staffVisit.visit, revision: 4.5 } },
    ],
    [
      "a missing change-request revision",
      {
        ...staffVisit,
        changeRequests: [{ ...changeRequest, revision: undefined }],
      },
    ],
    [
      "a fractional change-request revision",
      {
        ...staffVisit,
        changeRequests: [{ ...changeRequest, revision: 3.5 }],
      },
    ],
    [
      "a missing source-visit revision",
      {
        ...staffVisit,
        changeRequests: [
          { ...changeRequest, sourceVisitRevision: undefined },
        ],
      },
    ],
    [
      "a fractional source-visit revision",
      {
        ...staffVisit,
        changeRequests: [
          { ...changeRequest, sourceVisitRevision: 4.25 },
        ],
      },
    ],
    [
      "a missing incident revision",
      {
        ...staffVisit,
        incidents: [{ ...incident, revision: undefined }],
      },
    ],
    [
      "a fractional incident revision",
      {
        ...staffVisit,
        incidents: [{ ...incident, revision: 2.5 }],
      },
    ],
    [
      "a missing incident visit revision",
      {
        ...staffVisit,
        incidents: [{ ...incident, visitRevision: undefined }],
      },
    ],
    [
      "a fractional incident visit revision",
      {
        ...staffVisit,
        incidents: [{ ...incident, visitRevision: 4.5 }],
      },
    ],
    [
      "one malformed request among valid requests",
      {
        ...staffVisit,
        changeRequests: [
          changeRequest,
          { ...changeRequest, id: "not-a-uuid" },
        ],
      },
    ],
    [
      "an impossible requested timestamp",
      {
        ...staffVisit,
        visit: {
          ...staffVisit.visit,
          requestedAt: "2026-02-30T09:00:00Z",
        },
      },
    ],
    [
      "staff notice without its recording actor",
      {
        ...staffVisit,
        visit: {
          ...staffVisit.visit,
          termsAcknowledgement: "staff_notice",
          termsNoticeMethod: "phone",
          termsNoticeAt: "2026-07-25T09:00:00Z",
        },
      },
    ],
    [
      "notice evidence when the acknowledgement is not staff notice",
      {
        ...staffVisit,
        visit: {
          ...staffVisit.visit,
          termsAcknowledgement: "customer_accepted",
          termsNoticeMethod: "phone",
          termsNoticeAt: "2026-07-25T09:00:00Z",
          termsNoticeBy: ACTOR_ID,
        },
      },
    ],
    [
      "partial notice evidence when the acknowledgement is not staff notice",
      {
        ...staffVisit,
        visit: {
          ...staffVisit.visit,
          termsAcknowledgement: "customer_accepted",
          termsNoticeMethod: "phone",
          termsNoticeAt: null,
          termsNoticeBy: null,
        },
      },
    ],
    [
      "a received deposit without its satisfaction event",
      {
        ...staffVisit,
        deposit: {
          ...staffVisit.deposit,
          satisfactionEventId: null,
        },
      },
    ],
    [
      "a bank-satisfied deposit without its bank receipt timestamp",
      {
        ...staffVisit,
        deposit: {
          ...staffVisit.deposit,
          bankReceivedAt: null,
        },
      },
    ],
    [
      "a credit-satisfied deposit carrying a bank receipt timestamp",
      {
        ...staffVisit,
        deposit: {
          ...staffVisit.deposit,
          satisfactionSource: "credit",
        },
      },
    ],
    [
      "a non-received deposit carrying satisfaction evidence",
      {
        ...staffVisit,
        deposit: {
          ...staffVisit.deposit,
          state: "awaiting_payment",
        },
      },
    ],
    [
      "a deposit amount that is not the authoritative ten pounds",
      {
        ...staffVisit,
        deposit: {
          ...staffVisit.deposit,
          amountPence: 999,
        },
      },
    ],
    [
      "a reschedule without its requested destination",
      {
        ...staffVisit,
        changeRequests: [
          {
            ...changeRequest,
            requestedBookingDate: null,
          },
        ],
      },
    ],
    [
      "a cancellation carrying reschedule destination fields",
      {
        ...staffVisit,
        changeRequests: [
          {
            ...changeRequest,
            kind: "cancel",
          },
        ],
      },
    ],
    [
      "a WhatsApp request without its provider message ID",
      {
        ...staffVisit,
        changeRequests: [
          {
            ...changeRequest,
            channel: "whatsapp",
          },
        ],
      },
    ],
    [
      "a cancellation with an invalid reason for its kind",
      {
        ...staffVisit,
        changeRequests: [
          {
            ...changeRequest,
            kind: "cancel",
            requestedBookingDate: null,
            requestedSlotAssignments: null,
            destinationHash: null,
            sourceRevision: null,
            reviewId: null,
            destinationReservation: null,
            reasonCode: "staff_alternative",
          },
        ],
      },
    ],
    [
      "a proposed visit before the request is accepted",
      {
        ...staffVisit,
        changeRequests: [
          {
            ...changeRequest,
            proposedVisitId: LINEAGE_ID,
          },
        ],
      },
    ],
    [
      "a destination reservation on a request without a destination",
      {
        ...staffVisit,
        changeRequests: [
          {
            ...changeRequest,
            kind: "cancel",
            requestedBookingDate: null,
            requestedSlotAssignments: null,
            destinationHash: null,
            sourceRevision: null,
            reviewId: null,
          },
        ],
      },
    ],
    [
      "a destination reservation with null slot assignments",
      {
        ...staffVisit,
        changeRequests: [
          {
            ...changeRequest,
            destinationReservation: {
              ...changeRequest.destinationReservation,
              slotAssignments: null,
            },
          },
        ],
      },
    ],
    [
      "an open deposit reconciliation carrying resolution evidence",
      {
        ...staffVisit,
        depositReconciliations: [
          {
            ...staffVisit.depositReconciliations[0],
            state: "open",
          },
        ],
      },
    ],
    [
      "a resolved deposit reconciliation without any resolution evidence",
      {
        ...staffVisit,
        depositReconciliations: [
          {
            ...staffVisit.depositReconciliations[0],
            resolution: null,
            resolutionEventId: null,
            resolvedAt: null,
          },
        ],
      },
    ],
    [
      "an open service reconciliation with a resolution timestamp",
      {
        ...staffVisit,
        servicePrepaymentReconciliations: [
          {
            ...staffVisit.servicePrepaymentReconciliations[0],
            state: "open",
          },
        ],
      },
    ],
    [
      "a transferred service reconciliation without a target visit",
      {
        ...staffVisit,
        servicePrepaymentReconciliations: [
          {
            ...staffVisit.servicePrepaymentReconciliations[0],
            state: "transferred",
          },
        ],
      },
    ],
    [
      "a refund-due service reconciliation without an obligation",
      {
        ...staffVisit,
        servicePrepaymentReconciliations: [
          {
            ...staffVisit.servicePrepaymentReconciliations[0],
            obligationEventId: null,
          },
        ],
      },
    ],
    [
      "a service reconciliation with null evidence",
      {
        ...staffVisit,
        servicePrepaymentReconciliations: [
          {
            ...staffVisit.servicePrepaymentReconciliations[0],
            evidence: null,
          },
        ],
      },
    ],
    [
      "a refund-due ledger row without its deadline evidence",
      {
        ...staffVisit,
        financialLedger: [
          {
            ...staffVisit.financialLedger[0],
            eventKind: "refund_due",
          },
        ],
      },
    ],
    [
      "a deposit refund due without calendar coverage",
      {
        ...staffVisit,
        financialLedger: [
          {
            ...staffVisit.financialLedger[0],
            eventKind: "refund_due",
            dueAt: "2026-07-30T09:00:00Z",
            refundOrigin: "deposit",
            refundDeadlineBasis: "deposit_working_days",
          },
        ],
      },
    ],
    [
      "a service-prepayment refund using deposit calendar evidence",
      {
        ...staffVisit,
        financialLedger: [
          {
            ...staffVisit.financialLedger[0],
            eventKind: "refund_due",
            dueAt: "2026-07-30T09:00:00Z",
            refundOrigin: "service_prepayment",
            refundDeadlineBasis: "staff_explicit",
            refundCalendarSource: "england_wales",
            refundCalendarCoverageId: RECONCILIATION_ID,
          },
        ],
      },
    ],
    [
      "a refund settlement without its source obligation",
      {
        ...staffVisit,
        financialLedger: [
          {
            ...staffVisit.financialLedger[0],
            eventKind: "refund_cancelled",
          },
        ],
      },
    ],
    [
      "a refund-paid row without bank payment evidence",
      {
        ...staffVisit,
        financialLedger: [
          {
            ...staffVisit.financialLedger[0],
            eventKind: "refund_paid",
            settlesEventId: OBLIGATION_ID,
          },
        ],
      },
    ],
    [
      "a non-refund row carrying refund-only fields",
      {
        ...staffVisit,
        financialLedger: [
          {
            ...staffVisit.financialLedger[0],
            dueAt: "2026-07-30T09:00:00Z",
            refundOrigin: "deposit",
            refundDeadlineBasis: "deposit_working_days",
            refundCalendarSource: "england_wales",
            refundCalendarCoverageId: RECONCILIATION_ID,
          },
        ],
      },
    ],
  ])("rejects the whole staff detail for %s", async (_label, malformed) => {
    const { client } = fakeClient({ data: malformed, error: null });

    const result = await getStaffBookingVisit(client, VISIT_ID);

    expect(result.visit).toBeNull();
    expect(result.error).toMatchObject({
      code: "INVALID_BOOKING_POLICY_PROJECTION",
    });
  });

  it("normalises a malformed RPC error instead of leaking an untyped shape", async () => {
    const { client } = fakeClient({ data: null, error: malformedRpcError });

    const result = await getStaffBookingVisit(client, VISIT_ID);

    expect(result).toEqual({
      visit: null,
      error: normalisedMalformedRpcError,
    });
  });
});
