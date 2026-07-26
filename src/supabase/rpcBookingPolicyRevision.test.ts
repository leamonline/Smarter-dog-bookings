import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  approveBookingVisit,
  decideBookingChangeRequest,
  declineBookingVisit,
  markBookingVisitNoShow,
  recordBookingIncident,
  recordCustomerBookingContact,
  recordVisitDepositOutcome,
  resolveVisitDepositMoney,
  setBookingIncidentWaiver,
  waiveVisitDepositRequirement,
} from "./rpc";

function rpcClient() {
  const rpc = vi.fn();
  return {
    client: { rpc } as unknown as SupabaseClient,
    rpc,
  };
}

function compileTimeRevisionContracts(client: SupabaseClient) {
  // @ts-expect-error existing-visit commands require the rendered revision
  approveBookingVisit(client, { visitId: "visit", idempotencyKey: "approve" });
  // @ts-expect-error request decisions require the rendered request revision
  decideBookingChangeRequest(client, {
    requestId: "request",
    decision: "decline",
    reason: "No capacity",
    idempotencyKey: "decision",
  });
  // @ts-expect-error incident decisions require the rendered incident revision
  setBookingIncidentWaiver(client, {
    incidentId: "incident",
    waived: true,
    reason: "Salon error",
    idempotencyKey: "waiver",
  });
}
void compileTimeRevisionContracts;

describe("booking-policy optimistic revision RPC contracts", () => {
  it("forwards the rendered visit row revision for every existing-visit command", () => {
    const { client, rpc } = rpcClient();
    const expectedVisitRevision = 7;

    approveBookingVisit(client, {
      visitId: "visit",
      expectedVisitRevision,
      idempotencyKey: "approve",
    });
    declineBookingVisit(client, {
      visitId: "visit",
      expectedVisitRevision,
      customerReason: "No capacity",
      idempotencyKey: "decline",
    });
    recordVisitDepositOutcome(client, {
      visitId: "visit",
      expectedVisitRevision,
      outcome: "not_received",
      idempotencyKey: "deposit",
    });
    resolveVisitDepositMoney(client, {
      visitId: "visit",
      expectedVisitRevision,
      resolution: "refund",
      idempotencyKey: "money",
      reason: "Customer chose a refund",
    });
    waiveVisitDepositRequirement(client, {
      visitId: "visit",
      expectedVisitRevision,
      reason: "Goodwill",
      idempotencyKey: "waive",
    });
    recordBookingIncident(client, {
      visitId: "visit",
      expectedVisitRevision,
      kind: "late_cancellation",
      reason: "Customer cancelled late",
      idempotencyKey: "incident",
    });
    markBookingVisitNoShow(client, {
      visitId: "visit",
      expectedVisitRevision,
      reason: "Customer did not attend",
      idempotencyKey: "no-show",
    });
    recordCustomerBookingContact(client, {
      visitId: "visit",
      expectedVisitRevision,
      channel: "phone",
      contactedAt: "2026-07-26T12:00:00.000Z",
      idempotencyKey: "contact",
    });

    for (const [, args] of rpc.mock.calls) {
      expect(args).toMatchObject({
        p_expected_visit_revision: expectedVisitRevision,
      });
    }
  });

  it("forwards the rendered request revision for a change decision", () => {
    const { client, rpc } = rpcClient();

    decideBookingChangeRequest(client, {
      requestId: "request",
      expectedRequestRevision: 4,
      decision: "decline",
      reason: "No capacity",
      idempotencyKey: "decision",
    });

    expect(rpc).toHaveBeenCalledWith(
      "decide_booking_change_request",
      expect.objectContaining({ p_expected_request_revision: 4 }),
    );
  });

  it("forwards the rendered incident revision for a waiver decision", () => {
    const { client, rpc } = rpcClient();

    setBookingIncidentWaiver(client, {
      incidentId: "incident",
      expectedIncidentRevision: 3,
      waived: true,
      reason: "Salon error",
      idempotencyKey: "waiver",
    });

    expect(rpc).toHaveBeenCalledWith(
      "set_booking_incident_waiver",
      expect.objectContaining({ p_expected_incident_revision: 3 }),
    );
  });
});
