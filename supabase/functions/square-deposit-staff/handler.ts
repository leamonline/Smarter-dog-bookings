// Staff waive or refund of an app deposit.
//
// Waive: this booking no longer needs a deposit. Refused once Square has taken
// the money, and refused while IOS_DEPOSITS_ENABLED is not "true", so the
// switch cannot quietly cancel the existing bank-transfer hold.
// Refund: returns a payment Square has taken, including one the rules had
// kept (a late cancellation or a no-show). Refunds still run when the flag
// is off, so money taken while it was on can be sent back.
//
// Auth: the caller's own session via auth.getUser(), then is_staff() under
// that same token. A missing Origin is allowed (the iPhone app). A present
// Origin that is not on the allowlist is refused.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";
import { executeDepositRefund, type RefundAdmin } from "../_shared/squareDepositRefund.ts";
import { refundSquarePayment, type SquareCallResult } from "../_shared/squareClient.ts";
import { depositsEnabled } from "../_shared/squareClient.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGINS = buildAllowedOrigins("SQUARE_DEPOSIT_STAFF_ALLOWED_ORIGINS");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KNOWN = new Set([
  "staff only",
  "waiver_reason_must_be_1_to_500_characters",
  "refund_reason_must_be_1_to_500_characters",
  "booking_not_found",
  "deposit_already_taken",
  "deposit_not_refundable",
]);

interface StaffBody {
  action: "waive" | "refund";
  bookingId: string;
  reason: string;
}

export function validateStaffBody(
  body: unknown,
): { ok: true; value: StaffBody } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "invalid body" };
  const record = body as Record<string, unknown>;
  const action = record.action === "waive" || record.action === "refund" ? record.action : null;
  const bookingId = typeof record.bookingId === "string" ? record.bookingId.trim() : "";
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  if (!action) return { ok: false, reason: "action must be waive or refund" };
  if (!UUID.test(bookingId)) return { ok: false, reason: "booking not found" };
  if (!reason || reason.length > 500) return { ok: false, reason: "a reason of 1 to 500 characters is required" };
  return { ok: true, value: { action, bookingId, reason } };
}

interface UserClientLike {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null } | null; error: unknown }>;
  };
  rpc(fn: "is_staff"): Promise<{ data: unknown; error: { message: string } | null }>;
}

interface AdminClientLike extends RefundAdmin {
  rpc(
    fn: "staff_waive_booking_deposit" | "staff_refund_booking_deposit" | "begin_square_deposit_refund" | "settle_square_deposit_refund",
    args: Record<string, unknown>,
  ): Promise<{ data: Record<string, unknown> | null; error: { message: string; code?: string } | null }>;
}

export interface StaffDeps {
  makeUserClient(authHeader: string): UserClientLike;
  makeAdminClient(): AdminClientLike;
  refund(input: { paymentId: string; idempotencyKey: string; amountPence: number; reason: string }): Promise<SquareCallResult>;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req, ALLOWED_ORIGINS), "Content-Type": "application/json" },
  });
}

function httpForRpc(code: string | undefined): number {
  if (code === "42501") return 403;
  if (code === "22023") return 400;
  if (code === "P0002") return 404;
  return 409;
}

const defaultDeps: StaffDeps = {
  makeUserClient: (authHeader) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    }) as unknown as UserClientLike,
  makeAdminClient: () =>
    createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as unknown as AdminClientLike,
  refund: (input) => refundSquarePayment(input),
};

export function createSquareDepositStaffHandler(deps: StaffDeps = defaultDeps) {
  return async function handleSquareDepositStaff(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: buildCorsHeaders(req, ALLOWED_ORIGINS) });
    }
    if (req.method !== "POST") return json(req, { ok: false, reason: "method not allowed" }, 405);

    const origin = req.headers.get("origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json(req, { ok: false, reason: "origin not allowed" }, 403);
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json(req, { ok: false, reason: "missing authorization" }, 401);

    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch {
      return json(req, { ok: false, reason: "invalid body" }, 400);
    }
    const input = validateStaffBody(parsed);
    if (!input.ok) return json(req, { ok: false, reason: input.reason }, 400);

    if (input.value.action === "waive" && !depositsEnabled()) {
      return json(req, { ok: false, reason: "card deposits are switched off" }, 403);
    }

    const userClient = deps.makeUserClient(authHeader);
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json(req, { ok: false, reason: "invalid token" }, 401);

    const { data: staffCheck, error: staffErr } = await userClient.rpc("is_staff");
    if (staffErr) return json(req, { ok: false, reason: "staff check failed" }, 500);
    if (!staffCheck) return json(req, { ok: false, reason: "not staff" }, 403);

    const admin = deps.makeAdminClient();

    if (input.value.action === "waive") {
      const waived = await admin.rpc("staff_waive_booking_deposit", {
        p_booking_id: input.value.bookingId,
        p_reason: input.value.reason,
      });
      if (waived.error || !waived.data) {
        const message = waived.error?.message ?? "";
        const reason = KNOWN.has(message) ? message : "could not waive the deposit";
        return json(req, { ok: false, reason }, httpForRpc(waived.error?.code));
      }
      return json(req, { ok: true, status: "waived", bookingId: input.value.bookingId });
    }

    const marked = await admin.rpc("staff_refund_booking_deposit", {
      p_booking_id: input.value.bookingId,
      p_reason: input.value.reason,
    });
    if (marked.error || !marked.data) {
      const message = marked.error?.message ?? "";
      const reason = KNOWN.has(message) ? message : "could not refund the deposit";
      return json(req, { ok: false, reason }, httpForRpc(marked.error?.code));
    }
    if (marked.data.status === "refunded") {
      return json(req, { ok: true, status: "refunded", squareRefundId: marked.data.square_refund_id ?? null });
    }

    const paymentId = String(marked.data.deposit_payment_id ?? "");
    const result = await executeDepositRefund(admin, paymentId, deps.refund);
    return json(req, result.body, result.httpStatus);
  };
}

export const handleSquareDepositStaff = createSquareDepositStaffHandler();
