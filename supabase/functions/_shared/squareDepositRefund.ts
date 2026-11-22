// Send a refund Square has been asked for. The database has already decided
// the money should go back and has stored the idempotency key. Callers must
// have authenticated before they get here.

import { refundSquarePayment, type SquareCallResult } from "./squareClient.ts";

interface RpcResult {
  data: Record<string, unknown> | null;
  error: { message: string; code?: string } | null;
}

export interface RefundAdmin {
  rpc(
    fn: "begin_square_deposit_refund" | "settle_square_deposit_refund",
    args: Record<string, unknown>,
  ): Promise<RpcResult>;
}

export async function executeDepositRefund(
  admin: RefundAdmin,
  paymentId: string,
  refund: (
    input: { paymentId: string; idempotencyKey: string; amountPence: number; reason: string },
  ) => Promise<SquareCallResult> = refundSquarePayment,
): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  const begun = await admin.rpc("begin_square_deposit_refund", { p_payment_id: paymentId });
  if (begun.error || !begun.data) {
    return { httpStatus: 500, body: { ok: false, reason: "could not start the refund" } };
  }
  if (begun.data.ok !== true) {
    return { httpStatus: 409, body: { ok: false, reason: begun.data.reason ?? "not_refundable" } };
  }
  if (begun.data.state === "refunded") {
    return {
      httpStatus: 200,
      body: { ok: true, status: "refunded", squareRefundId: begun.data.square_refund_id ?? null },
    };
  }
  if (begun.data.state !== "send") {
    return { httpStatus: 409, body: { ok: false, reason: "not_refundable" } };
  }

  const sent = await refund({
    paymentId: String(begun.data.square_payment_id),
    idempotencyKey: String(begun.data.refund_idempotency_key),
    amountPence: Number(begun.data.amount_pence),
    reason: String(begun.data.reason ?? "cancelled_with_notice"),
  });

  const settled = await admin.rpc("settle_square_deposit_refund", {
    p_payment_id: paymentId,
    p_square_refund_id: sent.id ?? "",
    p_square_status: sent.status ?? "",
    p_error: sent.error ?? "",
  });
  if (settled.error || !settled.data) {
    return { httpStatus: 502, body: { ok: false, reason: "the refund could not be recorded" } };
  }
  const status = String(settled.data.status ?? "");
  const ok = settled.data.ok === true && (status === "refunded" || status === "refund_pending");
  return {
    httpStatus: ok ? 200 : 502,
    body: {
      ok,
      status,
      squareRefundId: settled.data.square_refund_id ?? null,
      reason: ok ? undefined : (settled.data.reason ?? "refund_failed"),
    },
  };
}
