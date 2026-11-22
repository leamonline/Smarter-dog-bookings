import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  createSquareDepositChargeHandler,
  handleSquareDepositCharge,
  validateChargeBody,
  type ChargeDeps,
} from "./handler.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service");
Deno.env.set("SQUARE_DEPOSIT_ALLOWED_ORIGINS", "https://smarterdog.co.uk");
Deno.env.set("IOS_DEPOSITS_ENABLED", "true");
Deno.env.set("SQUARE_ACCESS_TOKEN", "sandbox-token");
Deno.env.set("SQUARE_LOCATION_ID", "location-1");
Deno.env.set("SQUARE_ENVIRONMENT", "sandbox");

const BOOKING = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function post(headers: Record<string, string>, body: unknown): Request {
  return new Request("http://localhost/square-deposit-charge", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

Deno.test("the flag being off refuses before any client is built", async () => {
  Deno.env.set("IOS_DEPOSITS_ENABLED", "false");
  const res = await handleSquareDepositCharge(post(
    { authorization: "Bearer token" },
    { bookingId: BOOKING, sourceId: "cnon:card-nonce-ok" },
  ));
  assertEquals(res.status, 403);
  Deno.env.set("IOS_DEPOSITS_ENABLED", "true");
});

Deno.test("a missing token is refused before any client is built", async () => {
  const res = await handleSquareDepositCharge(post({}, { bookingId: BOOKING, sourceId: "cnon:ok" }));
  assertEquals(res.status, 401);
});

Deno.test("a card number is refused before any client is built", async () => {
  const res = await handleSquareDepositCharge(post(
    { authorization: "Bearer token" },
    { bookingId: BOOKING, sourceId: "4242424242424242" },
  ));
  assertEquals(res.status, 400);
  assertEquals((await res.json()).reason, "send a Square nonce, not a card number");
});

Deno.test("an origin that is not allowed is refused", async () => {
  const res = await handleSquareDepositCharge(post(
    { origin: "https://evil.example", authorization: "Bearer token" },
    { bookingId: BOOKING, sourceId: "cnon:ok" },
  ));
  assertEquals(res.status, 403);
  assertEquals(res.headers.get("access-control-allow-origin"), null);
});

Deno.test("validateChargeBody accepts a nonce and a booking id", () => {
  const result = validateChargeBody({ bookingId: BOOKING, sourceId: "cnon:card-nonce-ok" });
  assertEquals(result.ok, true);
});

interface Row {
  status: string;
  idempotencyKey: string;
  amountPence: number;
  squarePaymentId: string | null;
  bookingPayment: string | null;
  currency: string;
}

function recordingDeps(square: SquareResult): { deps: ChargeDeps; row: () => Row | null; payments: number } {
  const state: { row: Row | null; payments: number } = { row: null, payments: 0 };
  const deps: ChargeDeps = {
    makeUserClient: () => ({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: CUSTOMER } }, error: null }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: BOOKING }, error: null }),
          }),
        }),
      }),
    }),
    makeAdminClient: () => ({
      rpc: (fn, args) => {
        if (fn === "prepare_square_deposit_charge") {
          if (!state.row) {
            state.row = {
              status: "pending",
              idempotencyKey: "idem-1",
              amountPence: 1000,
              squarePaymentId: null,
              bookingPayment: null,
              currency: "GBP",
            };
          }
          return Promise.resolve({
            data: {
              ok: true,
              deposit_payment_id: "pay-row",
              idempotency_key: state.row.idempotencyKey,
              amount_pence: state.row.amountPence,
              status: state.row.status,
              square_payment_id: state.row.squarePaymentId,
              already_exists: false,
            },
            error: null,
          });
        }
        const status = String(args.p_square_status ?? "");
        const amount = Number(args.p_amount_pence);
        const currency = String(args.p_currency ?? "");
        if (!state.row) return Promise.resolve({ data: null, error: { message: "missing" } });
        if (status === "COMPLETED" && amount === 1000 && currency === "GBP") {
          state.row.status = "completed";
          state.row.squarePaymentId = String(args.p_square_payment_id);
          state.row.bookingPayment = "Deposit Paid";
        } else if (status === "FAILED" || status === "CANCELED") {
          state.row.status = "failed";
          state.row.squarePaymentId = null;
          state.row.bookingPayment = null;
        }
        return Promise.resolve({
          data: { ok: state.row.status === "completed", status: state.row.status, reason: state.row.status === "failed" ? "declined" : null },
          error: null,
        });
      },
    }),
    createPayment: () => {
      state.payments += 1;
      return Promise.resolve(square);
    },
  };
  return { deps, row: () => state.row, payments: 0 };
}

interface SquareResult {
  status: string | null;
  id: string | null;
  amountPence: number | null;
  currency: string | null;
  error: string | null;
}

Deno.test("a completed nonce records the £10 against the booking", async () => {
  const { deps, row } = recordingDeps({
    status: "COMPLETED",
    id: "sq_pay",
    amountPence: 1000,
    currency: "GBP",
    error: null,
  });
  const handler = createSquareDepositChargeHandler(deps);
  const res = await handler(post(
    { authorization: "Bearer token" },
    { bookingId: BOOKING, sourceId: "cnon:card-nonce-ok" },
  ));
  assertEquals(res.status, 200);
  assertEquals(row(), {
    status: "completed",
    idempotencyKey: "idem-1",
    amountPence: 1000,
    squarePaymentId: "sq_pay",
    bookingPayment: "Deposit Paid",
    currency: "GBP",
  });
});

Deno.test("a declined nonce does not mark the booking paid", async () => {
  const { deps, row } = recordingDeps({
    status: "FAILED",
    id: null,
    amountPence: null,
    currency: null,
    error: "Card declined",
  });
  const handler = createSquareDepositChargeHandler(deps);
  const res = await handler(post(
    { authorization: "Bearer token" },
    { bookingId: BOOKING, sourceId: "cnon:card-nonce-declined" },
  ));
  assertEquals(res.status, 402);
  assertEquals(row()?.status, "failed");
  assertEquals(row()?.bookingPayment, null);
  assertEquals(row()?.squarePaymentId, null);
});
