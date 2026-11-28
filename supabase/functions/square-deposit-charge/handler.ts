// Take a £10 grooming deposit from the iPhone app.
//
// The app uses the Square In-App Payments SDK and sends the nonce (card or
// Apple Pay). This function charges that nonce. It is not an App Store
// purchase. IOS_DEPOSITS_ENABLED must be the string "true"; otherwise the
// function refuses before it looks at the caller.
//
// Auth: the customer's own session (auth.getUser), then the booking must
// belong to that customer. The service role is used only after that, to write
// the payment row. A missing Origin is allowed because the iOS app does not
// send one. A browser Origin that is not on the allowlist is refused.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";
import {
  createSquarePayment,
  depositsEnabled,
  squareConfigured,
  type SquareCallResult,
} from "../_shared/squareClient.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGINS = buildAllowedOrigins("SQUARE_DEPOSIT_ALLOWED_ORIGINS");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAN = /^\d{12,19}$/;

export interface ChargeInput {
  bookingId: string;
  sourceId: string;
}

export function validateChargeBody(
  body: unknown,
): { ok: true; value: ChargeInput } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "invalid body" };
  const record = body as Record<string, unknown>;
  const bookingId = typeof record.bookingId === "string" ? record.bookingId.trim() : "";
  const sourceId = typeof record.sourceId === "string" ? record.sourceId.trim() : "";
  if (!UUID.test(bookingId)) return { ok: false, reason: "booking not found" };
  if (!sourceId || sourceId.length > 500 || /\s/.test(sourceId)) {
    return { ok: false, reason: "missing payment nonce" };
  }
  if (PAN.test(sourceId)) return { ok: false, reason: "send a Square nonce, not a card number" };
  return { ok: true, value: { bookingId, sourceId } };
}

interface UserClientLike {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null } | null; error: unknown }>;
  };
  from(table: "bookings"): {
    select(columns: string): {
      eq(column: "id", value: string): {
        maybeSingle(): Promise<{ data: { id?: string } | null; error: { message: string } | null }>;
      };
    };
  };
}

interface AdminClientLike {
  rpc(
    fn: "prepare_square_deposit_charge" | "settle_square_deposit_charge",
    args: Record<string, unknown>,
  ): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
}

export interface ChargeDeps {
  makeUserClient(authHeader: string): UserClientLike;
  makeAdminClient(): AdminClientLike;
  createPayment(input: { sourceId: string; idempotencyKey: string; bookingId: string }): Promise<SquareCallResult>;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req, ALLOWED_ORIGINS), "Content-Type": "application/json" },
  });
}

const defaultDeps: ChargeDeps = {
  makeUserClient: (authHeader) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    }) as unknown as UserClientLike,
  makeAdminClient: () =>
    createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as unknown as AdminClientLike,
  createPayment: (input) => createSquarePayment(input),
};

export function createSquareDepositChargeHandler(deps: ChargeDeps = defaultDeps) {
  return async function handleSquareDepositCharge(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: buildCorsHeaders(req, ALLOWED_ORIGINS) });
    }
    if (req.method !== "POST") return json(req, { ok: false, reason: "method not allowed" }, 405);

    if (!depositsEnabled()) {
      return json(req, { ok: false, reason: "card deposits are switched off" }, 403);
    }

    const origin = req.headers.get("origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json(req, { ok: false, reason: "origin not allowed" }, 403);
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json(req, { ok: false, reason: "missing authorization" }, 401);

    if (!squareConfigured()) {
      return json(req, { ok: false, reason: "Square is not configured" }, 503);
    }

    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch {
      return json(req, { ok: false, reason: "invalid body" }, 400);
    }
    const input = validateChargeBody(parsed);
    if (!input.ok) return json(req, { ok: false, reason: input.reason }, 400);

    const userClient = deps.makeUserClient(authHeader);
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json(req, { ok: false, reason: "invalid token" }, 401);

    const { data: booking, error: bookingErr } = await userClient
      .from("bookings")
      .select("id")
      .eq("id", input.value.bookingId)
      .maybeSingle();
    if (bookingErr) return json(req, { ok: false, reason: "booking could not be read" }, 500);
    if (!booking?.id) return json(req, { ok: false, reason: "booking not found" }, 404);

    const admin = deps.makeAdminClient();
    const prepared = await admin.rpc("prepare_square_deposit_charge", {
      p_booking_id: input.value.bookingId,
      p_customer_user_id: userRes.user.id,
    });
    if (prepared.error || !prepared.data) {
      return json(req, { ok: false, reason: "could not start the deposit" }, 500);
    }
    if (prepared.data.ok !== true) {
      const reason = typeof prepared.data.reason === "string" ? prepared.data.reason : "could not start the deposit";
      const status = reason === "booking_not_found" ? 404 : 409;
      return json(req, { ok: false, reason }, status);
    }

    const paymentId = String(prepared.data.deposit_payment_id ?? "");
    const existingStatus = String(prepared.data.status ?? "");
    if (existingStatus !== "pending" || prepared.data.square_payment_id) {
      return json(req, {
        ok: existingStatus === "completed",
        status: existingStatus,
        depositPaymentId: paymentId,
      }, existingStatus === "completed" ? 200 : 409);
    }

    const charged = await deps.createPayment({
      sourceId: input.value.sourceId,
      idempotencyKey: String(prepared.data.idempotency_key),
      bookingId: input.value.bookingId,
    });

    const settled = await admin.rpc("settle_square_deposit_charge", {
      p_payment_id: paymentId,
      p_square_payment_id: charged.id ?? "",
      p_square_status: charged.status ?? "",
      p_amount_pence: charged.amountPence ?? 0,
      p_currency: charged.currency ?? "",
      p_error: charged.error ?? "",
    });
    if (settled.error || !settled.data) {
      return json(req, { ok: false, reason: "the payment could not be recorded" }, 502);
    }

    const status = String(settled.data.status ?? "failed");
    const ok = settled.data.ok === true && (status === "completed" || status === "pending");
    return json(req, {
      ok,
      status,
      depositPaymentId: paymentId,
      reason: ok ? undefined : (settled.data.reason ?? "the card was declined"),
    }, ok ? 200 : 402);
  };
}

export const handleSquareDepositCharge = createSquareDepositChargeHandler();
