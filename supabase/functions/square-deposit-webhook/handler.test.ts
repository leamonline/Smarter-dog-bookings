import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { computeSquareSignature } from "../_shared/squareSignature.ts";
import { createSquareDepositWebhookHandler, handleSquareDepositWebhook, type WebhookDeps } from "./handler.ts";

const KEY = "square-webhook-test-key";
const URL = "https://example.test/functions/v1/square-deposit-webhook";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service");
Deno.env.set("SQUARE_WEBHOOK_SIGNATURE_KEY", KEY);
Deno.env.set("SQUARE_WEBHOOK_NOTIFICATION_URL", URL);

function post(body: string, signature: string | null): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature) headers.set("x-square-hmacsha256-signature", signature);
  return new Request(URL, { method: "POST", headers, body });
}

Deno.test("a missing Square signature is refused before a client is built", async () => {
  const res = await handleSquareDepositWebhook(post("{}", null));
  assertEquals(res.status, 403);
});

Deno.test("an unset signature key fails closed", async () => {
  const previous = Deno.env.get("SQUARE_WEBHOOK_SIGNATURE_KEY");
  Deno.env.delete("SQUARE_WEBHOOK_SIGNATURE_KEY");
  const res = await handleSquareDepositWebhook(post("{}", "anything"));
  assertEquals(res.status, 500);
  if (previous) Deno.env.set("SQUARE_WEBHOOK_SIGNATURE_KEY", previous);
});

Deno.test("a signed payment.updated completes a pending £10 deposit", async () => {
  const body = JSON.stringify({
    type: "payment.updated",
    data: {
      object: {
        payment: {
          id: "sq_pay",
          status: "COMPLETED",
          amount_money: { amount: 1000, currency: "GBP" },
        },
      },
    },
  });
  const signature = await computeSquareSignature(KEY, URL, body);
  const row = { status: "pending", squarePaymentId: "sq_pay", amountPence: 1000, currency: "GBP" };
  const deps: WebhookDeps = {
    makeAdminClient: () => ({
      rpc: (fn, args) => {
        if (fn === "deposit_payment_for_square_event") {
          return Promise.resolve({
            data: { deposit_payment_id: "row-1", status: row.status, square_payment_id: row.squarePaymentId },
            error: null,
          });
        }
        if (fn === "settle_square_deposit_charge" && args.p_square_status === "COMPLETED" && args.p_amount_pence === 1000) {
          row.status = "completed";
          return Promise.resolve({ data: { ok: true, status: "completed" }, error: null });
        }
        return Promise.resolve({ data: null, error: { message: "unexpected" } });
      },
    }),
  };
  const res = await createSquareDepositWebhookHandler(deps)(post(body, signature));
  assertEquals(res.status, 200);
  assertEquals(row.status, "completed");
  assertEquals(row.amountPence, 1000);
});

Deno.test("a signed refund.updated records the refund id", async () => {
  const body = JSON.stringify({
    type: "refund.updated",
    data: { object: { refund: { id: "sq_refund", payment_id: "sq_pay", status: "COMPLETED" } } },
  });
  const signature = await computeSquareSignature(KEY, URL, body);
  const row = { status: "refund_pending", squareRefundId: null as string | null };
  const deps: WebhookDeps = {
    makeAdminClient: () => ({
      rpc: (fn, args) => {
        if (fn === "deposit_payment_for_square_event") {
          return Promise.resolve({
            data: { deposit_payment_id: "row-1", status: row.status },
            error: null,
          });
        }
        if (fn === "settle_square_deposit_refund" && args.p_square_status === "COMPLETED") {
          row.status = "refunded";
          row.squareRefundId = String(args.p_square_refund_id);
          return Promise.resolve({ data: { ok: true, status: "refunded" }, error: null });
        }
        return Promise.resolve({ data: null, error: { message: "unexpected" } });
      },
    }),
  };
  const res = await createSquareDepositWebhookHandler(deps)(post(body, signature));
  assertEquals(res.status, 200);
  assertEquals(row, { status: "refunded", squareRefundId: "sq_refund" });
});
