// Called by the database when a deposit becomes refund_due (a cancellation
// with enough notice, a salon cancellation, or staff choosing to refund).
// The booking change has already committed. This function only sends the
// refund to Square, using the idempotency key stored on the row.
//
// Auth: Authorization: Bearer <WEBHOOK_SECRET>, the same secret the other
// pg_net triggers use. IOS_DEPOSITS_ENABLED is not consulted: a deposit that
// was taken has to be returnable after the flag is switched off.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";
import { executeDepositRefund, type RefundAdmin } from "../_shared/squareDepositRefund.ts";
import { refundSquarePayment, type SquareCallResult } from "../_shared/squareClient.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AdminClientLike extends RefundAdmin {
  rpc(
    fn: "begin_square_deposit_refund" | "settle_square_deposit_refund",
    args: Record<string, unknown>,
  ): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
}

export interface RefundDeps {
  makeAdminClient(): AdminClientLike;
  refund(input: { paymentId: string; idempotencyKey: string; amountPence: number; reason: string }): Promise<SquareCallResult>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const defaultDeps: RefundDeps = {
  makeAdminClient: () =>
    createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as unknown as AdminClientLike,
  refund: (input) => refundSquarePayment(input),
};

export function createSquareDepositRefundHandler(deps: RefundDeps = defaultDeps) {
  return async function handleSquareDepositRefund(req: Request): Promise<Response> {
    if (req.method !== "POST") return json({ ok: false, reason: "method not allowed" }, 405);

    const secret = Deno.env.get("WEBHOOK_SECRET") ?? "";
    if (!secret) {
      return json({ ok: false, reason: "Server misconfiguration: WEBHOOK_SECRET not set" }, 500);
    }
    if (!isAuthorizedWebhook(req.headers.get("Authorization"), secret)) {
      return json({ ok: false, reason: "unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, reason: "invalid body" }, 400);
    }
    const paymentId = body && typeof body === "object"
      ? (body as Record<string, unknown>).deposit_payment_id
      : null;
    if (typeof paymentId !== "string" || !UUID.test(paymentId)) {
      return json({ ok: false, reason: "deposit_payment_id is required" }, 400);
    }

    const result = await executeDepositRefund(deps.makeAdminClient(), paymentId, deps.refund);
    return json(result.body, result.httpStatus);
  };
}

export const handleSquareDepositRefund = createSquareDepositRefundHandler();
