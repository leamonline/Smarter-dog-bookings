import { describe, expect, it } from "vitest";
import {
  actionRefusalCopy,
  countableIncidents,
  depositLabel,
  incidentsInRollingYear,
  isDepositCheckDue,
  remainingReschedulesLabel,
  visitStatusView,
} from "./bookingPolicy";
import type {
  BookingVisit,
  StaffBookingPolicyIncident,
  VisitActionability,
} from "../types/bookingPolicy";

const NOW = new Date("2026-09-01T12:00:00Z");

function visit(overrides: Partial<BookingVisit> = {}): BookingVisit {
  return {
    id: "v1",
    revision: 1,
    lineageId: "l1",
    humanId: "h1",
    bookingDate: "2026-09-07",
    lifecycleState: "active",
    approvalState: "not_required",
    confirmationState: "confirmed",
    policyCode: "previous_day_1500_v1",
    confirmedAt: "2026-08-20T10:00:00Z",
    commercialEligibilityAt: "2026-08-20T10:00:00Z",
    eligibilityPolicyCode: "previous_day_1500_v1",
    deadlineAt: "2026-09-06T14:00:00Z",
    isLastMinute: false,
    remainingSelfServiceReschedules: 3,
    bookings: [],
    deposit: null,
    ...overrides,
  };
}

function action(overrides: Partial<VisitActionability> = {}): VisitActionability {
  return {
    allowed: false,
    reasonCode: null,
    deadlinePassed: false,
    switchEnabled: true,
    stateEligible: true,
    moveLimitReached: false,
    processingStateSafe: true,
    deadlineAt: "2026-09-06T14:00:00Z",
    lifecycleState: "active",
    approvalState: "not_required",
    confirmationState: "confirmed",
    isLastMinute: false,
    remainingSelfServiceReschedules: 3,
    ...overrides,
  };
}

describe("deposit check due", () => {
  it("is false at exactly the due instant and true one millisecond later", () => {
    const due = "2026-09-01T12:00:00.000Z";
    const v = visit({
      deposit: {
        state: "awaiting_payment",
        amountPence: 1000,
        dueAt: due,
        satisfactionSource: null,
        bankReceivedAt: null,
        termsAcceptedAt: "2026-08-20T10:00:00Z",
      },
    });
    expect(isDepositCheckDue(v, new Date(due))).toBe(false);
    expect(isDepositCheckDue(v, new Date("2026-09-01T12:00:00.001Z"))).toBe(true);
  });

  it("applies to both unresolved states and to neither settled one", () => {
    const overdue = "2026-08-01T00:00:00Z";
    for (const state of ["awaiting_terms", "awaiting_payment"] as const) {
      expect(
        isDepositCheckDue(
          visit({
            deposit: {
              state,
              amountPence: 1000,
              dueAt: overdue,
              satisfactionSource: null,
              bankReceivedAt: null,
              termsAcceptedAt: null,
            },
          }),
          NOW,
        ),
      ).toBe(true);
    }
    for (const state of ["received", "not_received", "not_required"] as const) {
      expect(
        isDepositCheckDue(
          visit({
            deposit: {
              state,
              amountPence: 1000,
              dueAt: overdue,
              satisfactionSource: state === "received" ? "bank" : null,
              bankReceivedAt: null,
              termsAcceptedAt: null,
            },
          }),
          NOW,
        ),
      ).toBe(false);
    }
  });
});

describe("visit status grouping", () => {
  it("puts waiting approval and overdue deposits in the staff attention queues", () => {
    expect(visitStatusView(visit({ approvalState: "waiting_staff", confirmationState: "unconfirmed" }), NOW))
      .toEqual({
        group: "waiting_approval",
        label: "Waiting approval by staff",
        needsStaffAttention: true,
      });

    expect(
      visitStatusView(
        visit({
          confirmationState: "unconfirmed",
          approvalState: "approved",
          deposit: {
            state: "awaiting_payment",
            amountPence: 1000,
            dueAt: "2026-08-01T00:00:00Z",
            satisfactionSource: null,
            bankReceivedAt: null,
            termsAcceptedAt: "2026-07-30T00:00:00Z",
          },
        }),
        NOW,
      ),
    ).toEqual({
      group: "deposit_check_due",
      label: "Deposit check due",
      needsStaffAttention: true,
    });
  });

  it("separates awaiting terms from awaiting payment while neither is overdue", () => {
    const future = "2026-09-30T00:00:00Z";
    expect(
      visitStatusView(
        visit({
          confirmationState: "unconfirmed",
          approvalState: "approved",
          deposit: {
            state: "awaiting_terms",
            amountPence: 1000,
            dueAt: future,
            satisfactionSource: null,
            bankReceivedAt: null,
            termsAcceptedAt: null,
          },
        }),
        NOW,
      ).group,
    ).toBe("awaiting_terms");
    expect(
      visitStatusView(
        visit({
          confirmationState: "unconfirmed",
          approvalState: "approved",
          deposit: {
            state: "awaiting_payment",
            amountPence: 1000,
            dueAt: future,
            satisfactionSource: null,
            bankReceivedAt: null,
            termsAcceptedAt: "2026-08-20T10:00:00Z",
          },
        }),
        NOW,
      ).group,
    ).toBe("awaiting_deposit");
  });

  it("labels a last-minute booking distinctly and never asks for attention", () => {
    expect(visitStatusView(visit({ isLastMinute: true }), NOW)).toEqual({
      group: "confirmed",
      label: "Booked — last minute",
      needsStaffAttention: false,
    });
  });

  it("groups declined, withdrawn and cancelled as not proceeding", () => {
    expect(visitStatusView(visit({ lifecycleState: "declined", confirmationState: "unconfirmed" }), NOW).label)
      .toBe("Not confirmed");
    expect(visitStatusView(visit({ lifecycleState: "withdrawn", confirmationState: "unconfirmed" }), NOW).label)
      .toBe("Withdrawn");
    expect(visitStatusView(visit({ lifecycleState: "cancelled" }), NOW).group)
      .toBe("not_proceeding");
  });
});

describe("refusal copy", () => {
  it("says nothing when the server allows the action", () => {
    expect(actionRefusalCopy(action({ allowed: true }))).toBeNull();
  });

  it("gives the deadline reason precedence over a disabled switch", () => {
    const copy = actionRefusalCopy(
      action({ deadlinePassed: true, switchEnabled: false }),
    );
    expect(copy).toContain("3:00 pm the day before");
    expect(copy).toContain("still booked");
  });

  it("explains a spent move allowance without inviting a retry", () => {
    expect(actionRefusalCopy(action({ moveLimitReached: true }))).toContain(
      "three times",
    );
  });

  it("explains a started appointment", () => {
    expect(actionRefusalCopy(action({ processingStateSafe: false }))).toContain(
      "already started",
    );
  });
});

describe("labels", () => {
  it("names every deposit state", () => {
    expect(depositLabel("awaiting_payment")).toBe("Waiting for deposit");
    expect(depositLabel("received_liability")).toBe("Deposit to sort out");
    expect(depositLabel("not_required")).toBe("No deposit needed");
  });

  it("pluralises the remaining move count", () => {
    expect(remainingReschedulesLabel(0)).toBe("No online moves left");
    expect(remainingReschedulesLabel(1)).toBe("1 online move left");
    expect(remainingReschedulesLabel(3)).toBe("3 online moves left");
  });
});

describe("incident counting", () => {
  const incidents: StaffBookingPolicyIncident[] = [
    {
      id: "i1",
      revision: 1,
      visitId: "v1",
      visitRevision: 1,
      humanId: "h1",
      kind: "late_cancellation",
      appointmentDate: "2026-08-01",
      reason: "late",
      recordedAt: "2026-08-01T10:00:00Z",
      waivedAt: null,
      waiverReason: null,
    },
    {
      id: "i2",
      revision: 1,
      visitId: "v2",
      visitRevision: 1,
      humanId: "h1",
      kind: "no_show",
      appointmentDate: "2026-07-01",
      reason: "absent",
      recordedAt: "2026-07-01T10:00:00Z",
      waivedAt: "2026-07-02T10:00:00Z",
      waiverReason: "salon error",
    },
    {
      id: "i3",
      revision: 1,
      visitId: "v3",
      visitRevision: 1,
      humanId: "h1",
      kind: "late_reschedule",
      appointmentDate: "2024-01-01",
      reason: "old",
      recordedAt: "2024-01-01T10:00:00Z",
      waivedAt: null,
      waiverReason: null,
    },
  ];

  it("excludes waived incidents", () => {
    expect(countableIncidents(incidents).map((i) => i.id)).toEqual(["i1", "i3"]);
  });

  it("counts only the rolling twelve months", () => {
    expect(incidentsInRollingYear(incidents, NOW)).toBe(1);
  });
});
