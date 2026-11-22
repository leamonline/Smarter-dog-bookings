// Square tells us when a payment or refund settles. The signature is checked
// before any client is built. A payment we do not know is acknowledged and
// ignored, so Square does not retry it. Reconciliation still runs when
// IOS_DEPOSITS_ENABLED is off: money already taken has to be able to finish.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidSquareSignature } from "../_shared/squareSignature.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface AdminClientLike {
  rpc(
    fn: "deposit_payment_for_square_event" | "settle_square_deposit_charge" | "settle_square_deposit_refund",
    args: Record<string, unknown>,
  ): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
}

export interface WebhookDeps {
  makeAdminClient(): AdminClientLike;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const defaultDeps: WebhookDeps = {
  makeAdminClient: () =>
    createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as unknown as AdminClientLike,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function createSquareDepositWebhookHandler(deps: WebhookDeps = defaultDeps) {
  return async function handleSquareDepositWebhook(req: Request): Promise<Response> {
    if (req.method !== "POST") return json({ ok: false, reason: "method not allowed" }, 405);

    const signatureKey = Deno.env.get("SQUARE_WEBHOOK_SIGNATURE_KEY") ?? "";
    const notificationUrl = Deno.env.get("SQUARE_WEBHOOK_NOTIFICATION_URL") ?? "";
    if (!signatureKey || !notificationUrl) {
      return json({ ok: false, reason: "webhook is not configured" }, 500);
    }

    const raw = await req.text();
    if (!(await isValidSquareSignature(
      signatureKey,
      notificationUrl,
      raw,
      req.headers.get("x-square-hmacsha256-signature"),
    ))) {
      return json({ ok: false, reason: "invalid signature" }, 403);
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return json({ ok: false, reason: "invalid body" }, 400);
    }

    const type = typeof event.type === "string" ? event.type : "";
    const data = asRecord(event.data);
    const object = asRecord(data?.object);
    const admin = deps.makeAdminClient();

    if (type === "payment.updated" || type === "payment.created") {
      const payment = asRecord(object?.payment);
      const squareId = typeof payment?.id === "string" ? payment.id : "";
      const referenceId = typeof payment?.reference_id === "string" ? payment.reference_id : "";
      if (!squareId && !referenceId) return json({ ok: true, ignored: true });
      const found = await admin.rpc("deposit_payment_for_square_event", {
        p_square_payment_id: squareId,
        p_reference_id: referenceId,
      });
      if (found.error) return json({ ok: false, reason: "could not record the payment" }, 500);
      const paymentId = found.data?.deposit_payment_id;
      const status = found.data?.status;
      if (!paymentId || (status !== "pending" && status !== "waived")) {
        return json({ ok: true, ignored: true });
      }
      const money = asRecord(payment?.amount_money);
      const settled = await admin.rpc("settle_square_deposit_charge", {
        p_payment_id: paymentId,
        p_square_payment_id: squareId,
        p_square_status: typeof payment?.status === "string" ? payment.status : "",
        p_amount_pence: typeof money?.amount === "number" ? money.amount : 0,
        p_currency: typeof money?.currency === "string" ? money.currency : "",
        p_error: "",
      });
      if (settled.error) return json({ ok: false, reason: "could not record the payment" }, 500);
      return json({ ok: true });
    }

    if (type === "refund.updated" || type === "refund.created") {
      const refund = asRecord(object?.refund);
      const squarePaymentId = typeof refund?.payment_id === "string" ? refund.payment_id : "";
      if (!squarePaymentId) return json({ ok: true, ignored: true });
      const found = await admin.rpc("deposit_payment_for_square_event", {
        p_square_payment_id: squarePaymentId,
        p_reference_id: "",
      });
      if (found.error) return json({ ok: false, reason: "could not record the refund" }, 500);
      const paymentId = found.data?.deposit_payment_id;
      const status = found.data?.status;
      if (!paymentId || (status !== "refund_pending" && status !== "refund_due")) {
        return json({ ok: true, ignored: true });
      }
      const settled = await admin.rpc("settle_square_deposit_refund", {
        p_payment_id: paymentId,
        p_square_refund_id: typeof refund?.id === "string" ? refund.id : "",
        p_square_status: typeof refund?.status === "string" ? refund.status : "",
        p_error: "",
      });
      if (settled.error) return json({ ok: false, reason: "could not record the refund" }, 500);
      return json({ ok: true });
    }

    return json({ ok: true, ignored: true });
  };
}

export const handleSquareDepositWebhook = createSquareDepositWebhookHandler();
