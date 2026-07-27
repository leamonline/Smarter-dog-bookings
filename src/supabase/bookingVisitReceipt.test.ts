import { describe, expect, it } from "vitest";
import {
  assertCreditAllocation,
  decodeCustomerCreditRefundReceipt,
  decodeCustomerVisitReceipt,
  VisitReceiptError,
} from "./bookingVisitReceipt";

const committed = {
  outcome: "cancelled",
  block_reason: null,
  visit_id: "11111111-1111-4111-8111-111111111111",
  replacement_visit_id: null,
  lineage_id: "22222222-2222-4222-8222-222222222222",
  booking_ids: ["33333333-3333-4333-8333-333333333333"],
  lifecycle_state: "cancelled",
  approval_state: "not_required",
  confirmation_state: "confirmed",
  policy_code: "previous_day_1500_v1",
  deadline_at: "2026-09-06T14:00:00Z",
  is_last_minute: false,
  booking_timing: "ordinary",
  customer_deposit_reason: "not_required",
  deposit_state: "received",
  deposit_amount_pence: 1000,
  deposit_due_at: null,
  deposit_payment_instructions: null,
  money_outcome: {
    kind: "refund_due",
    amount_pence: 1000,
    refund_due_at: "2026-09-14T16:00:00Z",
  },
  outcome_key: "visit-cancelled:11111111-1111-4111-8111-111111111111",
};

const blocked = {
  outcome: "blocked",
  block_reason: "source_deadline_late",
  visit_id: "11111111-1111-4111-8111-111111111111",
  replacement_visit_id: null,
  lineage_id: null,
  booking_ids: [],
  lifecycle_state: null,
  approval_state: null,
  confirmation_state: null,
  policy_code: null,
  deadline_at: "2026-09-06T14:00:00Z",
  is_last_minute: null,
  booking_timing: null,
  customer_deposit_reason: null,
  deposit_state: null,
  deposit_amount_pence: null,
  deposit_due_at: null,
  deposit_payment_instructions: null,
  money_outcome: null,
  outcome_key: null,
  staff_alert_key: null,
};

describe("decodeCustomerVisitReceipt", () => {
  it("decodes a committed cancellation with its refund outcome", () => {
    const receipt = decodeCustomerVisitReceipt(committed);
    expect(receipt.outcome).toBe("cancelled");
    if (receipt.outcome === "cancelled") {
      expect(receipt.money_outcome).toEqual({
        kind: "refund_due",
        amount_pence: 1000,
        refund_due_at: "2026-09-14T16:00:00Z",
      });
    }
  });

  it("decodes a blocked result without commercial identifiers", () => {
    const receipt = decodeCustomerVisitReceipt(blocked);
    expect(receipt.outcome).toBe("blocked");
    if (receipt.outcome === "blocked") {
      expect(receipt.block_reason).toBe("source_deadline_late");
      expect(receipt.outcome_key).toBeNull();
      expect(receipt.staff_alert_key).toBeNull();
    }
  });

  it("refuses a blocked result that leaks a committed outcome key", () => {
    expect(() =>
      decodeCustomerVisitReceipt({ ...blocked, outcome_key: "visit-cancelled:x" }),
    ).toThrow(VisitReceiptError);
  });

  it("refuses a staff alert key on an ordinary block", () => {
    expect(() =>
      decodeCustomerVisitReceipt({ ...blocked, staff_alert_key: "alert:1" }),
    ).toThrow(VisitReceiptError);
  });

  it("allows a staff alert key only on a setup-incomplete block", () => {
    const receipt = decodeCustomerVisitReceipt({
      ...blocked,
      block_reason: "deposit_setup_incomplete",
      staff_alert_key: "alert:1",
    });
    expect(receipt.outcome).toBe("blocked");
  });

  it("distinguishes awaiting_terms from awaiting_payment", () => {
    const terms = decodeCustomerVisitReceipt({
      ...committed,
      outcome: "awaiting_terms",
      deposit_state: "awaiting_terms",
      deposit_payment_instructions: null,
    });
    const payment = decodeCustomerVisitReceipt({
      ...committed,
      outcome: "awaiting_payment",
      deposit_state: "awaiting_payment",
      deposit_payment_instructions: {
        account_name: "Smarter Dog",
        sort_code: "12-34-56",
        account_number: "12345678",
        customer_reference: "SD-123",
      },
    });
    expect(terms.outcome).toBe("awaiting_terms");
    expect(payment.outcome).toBe("awaiting_payment");
    if (payment.outcome === "awaiting_payment") {
      expect(payment.deposit_payment_instructions?.sort_code).toBe("12-34-56");
    }
    if (terms.outcome === "awaiting_terms") {
      expect(terms.deposit_payment_instructions).toBeNull();
    }
  });

  it("decodes a pending change as a confirmed active source, not a replacement", () => {
    const receipt = decodeCustomerVisitReceipt({
      ...committed,
      outcome: "change_waiting_staff",
      lifecycle_state: "active",
      request_id: "44444444-4444-4444-8444-444444444444",
      request_status: "pending_staff",
      staff_review_reason: "destination_last_minute_staff_review",
      replacement_visit_id: null,
    });
    expect(receipt.outcome).toBe("change_waiting_staff");
    if (receipt.outcome === "change_waiting_staff") {
      expect(receipt.lifecycle_state).toBe("active");
      expect(receipt.confirmation_state).toBe("confirmed");
      expect(receipt.replacement_visit_id).toBeNull();
    }
  });

  it("refuses a pending change that claims a replacement visit", () => {
    expect(() =>
      decodeCustomerVisitReceipt({
        ...committed,
        outcome: "change_waiting_staff",
        request_id: "44444444-4444-4444-8444-444444444444",
        replacement_visit_id: "55555555-5555-4555-8555-555555555555",
      }),
    ).toThrow(VisitReceiptError);
  });

  it("never accepts staff verification detail in a customer receipt", () => {
    expect(() =>
      decodeCustomerVisitReceipt({
        ...committed,
        staff_verification_reference: "BANK-CHECK-1",
      }),
    ).toThrow(VisitReceiptError);
  });

  it("refuses malformed or absent payloads rather than reporting success", () => {
    expect(() => decodeCustomerVisitReceipt(null)).toThrow(VisitReceiptError);
    expect(() => decodeCustomerVisitReceipt("cancelled")).toThrow(VisitReceiptError);
    expect(() => decodeCustomerVisitReceipt({})).toThrow(VisitReceiptError);
    expect(() =>
      decodeCustomerVisitReceipt({ ...committed, outcome: "teleported" }),
    ).toThrow(VisitReceiptError);
  });
});

describe("credit refund receipts", () => {
  it("requires a due date on a request and none on a cancellation", () => {
    const requested = decodeCustomerCreditRefundReceipt({
      outcome: "refund_requested",
      obligation_id: "66666666-6666-4666-8666-666666666666",
      amount_pence: 1000,
      refund_due_at: "2026-09-14T16:00:00Z",
      outcome_key: "credit-refund:1",
    });
    expect(requested.outcome).toBe("refund_requested");

    expect(() =>
      decodeCustomerCreditRefundReceipt({
        outcome: "refund_requested",
        obligation_id: "66666666-6666-4666-8666-666666666666",
        amount_pence: 1000,
        refund_due_at: null,
        outcome_key: "credit-refund:1",
      }),
    ).toThrow(VisitReceiptError);

    expect(() =>
      decodeCustomerCreditRefundReceipt({
        outcome: "refund_request_cancelled",
        obligation_id: "66666666-6666-4666-8666-666666666666",
        amount_pence: 1000,
        refund_due_at: "2026-09-14T16:00:00Z",
        outcome_key: "credit-refund-cancel:1",
      }),
    ).toThrow(VisitReceiptError);
  });
});

describe("deposit credit allocation", () => {
  it("is all-or-nothing", () => {
    expect(() => assertCreditAllocation(0)).not.toThrow();
    expect(() => assertCreditAllocation(1000)).not.toThrow();
    for (const bad of [1, 999, 1001, -1000]) {
      expect(() => assertCreditAllocation(bad)).toThrow(VisitReceiptError);
    }
  });
});
