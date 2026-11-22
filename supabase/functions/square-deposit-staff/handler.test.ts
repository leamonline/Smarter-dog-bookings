import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createSquareDepositStaffHandler, handleSquareDepositStaff, type StaffDeps } from "./handler.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service");
Deno.env.set("SQUARE_DEPOSIT_STAFF_ALLOWED_ORIGINS", "https://smarterdog.co.uk");
Deno.env.set("IOS_DEPOSITS_ENABLED", "true");

const BOOKING = "22222222-2222-4222-8222-222222222222";

function post(headers: Record<string, string>, body: unknown): Request {
  return new Request("http://localhost/square-deposit-staff", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

Deno.test("a missing token is refused before any client is built", async () => {
  const res = await handleSquareDepositStaff(post({}, {
    action: "refund",
    bookingId: BOOKING,
    reason: "customer asked",
  }));
  assertEquals(res.status, 401);
});

Deno.test("waive is refused while card deposits are switched off", async () => {
  Deno.env.set("IOS_DEPOSITS_ENABLED", "false");
  const res = await handleSquareDepositStaff(post(
    { authorization: "Bearer token" },
    { action: "waive", bookingId: BOOKING, reason: "first visit, we know them" },
  ));
  assertEquals(res.status, 403);
  Deno.env.set("IOS_DEPOSITS_ENABLED", "true");
});

interface Row {
  status: string;
  squarePaymentId: string | null;
  squareRefundId: string | null;
  refundKey: string | null;
  depositRequired: boolean;
  amountPence: number;
}

function staffDeps(staff: boolean): { deps: StaffDeps; row: () => Row } {
  const row: Row = {
    status: "forfeited",
    squarePaymentId: "sq_pay",
    squareRefundId: null,
    refundKey: "refund-key",
    depositRequired: true,
    amountPence: 1000,
  };
  const deps: StaffDeps = {
    makeUserClient: () => ({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "staff-user" } }, error: null }) },
      rpc: (fn) => {
        if (fn !== "is_staff") return Promise.resolve({ data: null, error: { message: "no" } });
        return Promise.resolve({ data: staff, error: null });
      },
    }),
    makeAdminClient: () => ({
      rpc: (fn, args) => {
        if (fn === "staff_waive_booking_deposit") {
          row.status = "waived";
          row.depositRequired = false;
          return Promise.resolve({ data: { ok: true, status: "waived" }, error: null });
        }
        if (fn === "staff_refund_booking_deposit") {
          row.status = "refund_due";
          return Promise.resolve({
            data: {
              ok: true,
              status: "refund_due",
              deposit_payment_id: "row-1",
              square_payment_id: row.squarePaymentId,
              refund_idempotency_key: row.refundKey,
              amount_pence: row.amountPence,
            },
            error: null,
          });
        }
        if (fn === "begin_square_deposit_refund") {
          row.status = "refund_pending";
          return Promise.resolve({
            data: {
              ok: true,
              state: "send",
              square_payment_id: row.squarePaymentId,
              refund_idempotency_key: row.refundKey,
              amount_pence: 1000,
              reason: "late, but the dog was ill",
            },
            error: null,
          });
        }
        if (fn === "settle_square_deposit_refund") {
          if (args.p_square_status === "COMPLETED") {
            row.status = "refunded";
            row.squareRefundId = String(args.p_square_refund_id);
          }
          return Promise.resolve({
            data: { ok: row.status === "refunded", status: row.status, square_refund_id: row.squareRefundId },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: { message: "unexpected" } });
      },
    }),
    refund: () => Promise.resolve({
      status: "COMPLETED",
      id: "sq_refund",
      amountPence: 1000,
      currency: "GBP",
      error: null,
    }),
  };
  return { deps, row: () => row };
}

Deno.test("someone who is not staff cannot refund", async () => {
  const { deps } = staffDeps(false);
  const res = await createSquareDepositStaffHandler(deps)(post(
    { authorization: "Bearer token" },
    { action: "refund", bookingId: BOOKING, reason: "please refund" },
  ));
  assertEquals(res.status, 403);
});

Deno.test("staff can refund a deposit the rules had kept", async () => {
  const { deps, row } = staffDeps(true);
  const res = await createSquareDepositStaffHandler(deps)(post(
    { authorization: "Bearer token" },
    { action: "refund", bookingId: BOOKING, reason: "the dog was ill" },
  ));
  assertEquals(res.status, 200);
  assertEquals(row().status, "refunded");
  assertEquals(row().squareRefundId, "sq_refund");
  assertEquals(row().amountPence, 1000);
});

Deno.test("staff can waive a deposit that has not been taken", async () => {
  const { deps, row } = staffDeps(true);
  const res = await createSquareDepositStaffHandler(deps)(post(
    { authorization: "Bearer token" },
    { action: "waive", bookingId: BOOKING, reason: "we know this customer" },
  ));
  assertEquals(res.status, 200);
  assertEquals(row().status, "waived");
  assertEquals(row().depositRequired, false);
});
