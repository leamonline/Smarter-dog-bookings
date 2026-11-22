import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createSquareDepositRefundHandler, handleSquareDepositRefund, type RefundDeps } from "./handler.ts";

const PAYMENT = "33333333-3333-4333-8333-333333333333";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service");
Deno.env.set("WEBHOOK_SECRET", "webhook-test-secret");

function post(headers: Record<string, string>, body: unknown): Request {
  return new Request("http://localhost/square-deposit-refund", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

Deno.test("an unset webhook secret is refused before a client is built", async () => {
  const previous = Deno.env.get("WEBHOOK_SECRET");
  Deno.env.delete("WEBHOOK_SECRET");
  const res = await handleSquareDepositRefund(post(
    { authorization: "Bearer webhook-test-secret" },
    { deposit_payment_id: PAYMENT },
  ));
  assertEquals(res.status, 500);
  if (previous) Deno.env.set("WEBHOOK_SECRET", previous);
});

Deno.test("a wrong bearer token is refused before a client is built", async () => {
  const res = await handleSquareDepositRefund(post(
    { authorization: "Bearer wrong" },
    { deposit_payment_id: PAYMENT },
  ));
  assertEquals(res.status, 401);
});

Deno.test("a valid trigger records the Square refund on the payment row", async () => {
  const row = {
    status: "refund_due",
    squarePaymentId: "sq_pay",
    squareRefundId: null as string | null,
    refundKey: "refund-key",
    amountPence: 1000,
  };
  const deps: RefundDeps = {
    makeAdminClient: () => ({
      rpc: (fn, args) => {
        if (fn === "begin_square_deposit_refund") {
          row.status = "refund_pending";
          return Promise.resolve({
            data: {
              ok: true,
              state: "send",
              square_payment_id: row.squarePaymentId,
              refund_idempotency_key: row.refundKey,
              amount_pence: row.amountPence,
              reason: "cancelled_with_notice",
            },
            error: null,
          });
        }
        if (fn === "settle_square_deposit_refund" && args.p_square_status === "COMPLETED") {
          row.status = "refunded";
          row.squareRefundId = String(args.p_square_refund_id);
          return Promise.resolve({
            data: { ok: true, status: "refunded", square_refund_id: row.squareRefundId },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: { message: "unexpected" } });
      },
    }),
    refund: (input) => {
      assertEquals(input.idempotencyKey, "refund-key");
      assertEquals(input.amountPence, 1000);
      return Promise.resolve({
        status: "COMPLETED",
        id: "sq_refund",
        amountPence: 1000,
        currency: "GBP",
        error: null,
      });
    },
  };
  const res = await createSquareDepositRefundHandler(deps)(post(
    { authorization: "Bearer webhook-test-secret" },
    { deposit_payment_id: PAYMENT },
  ));
  assertEquals(res.status, 200);
  assertEquals(row.status, "refunded");
  assertEquals(row.squareRefundId, "sq_refund");
});
