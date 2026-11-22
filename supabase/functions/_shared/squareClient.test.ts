import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createSquarePayment, refundSquarePayment, squareApiBase } from "./squareClient.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.test("Square stays on the sandbox unless production is named", () => {
  const previous = Deno.env.get("SQUARE_ENVIRONMENT");
  try {
    Deno.env.delete("SQUARE_ENVIRONMENT");
    assertEquals(squareApiBase(), "https://connect.squareupsandbox.com");
    Deno.env.set("SQUARE_ENVIRONMENT", "sandbox");
    assertEquals(squareApiBase(), "https://connect.squareupsandbox.com");
    Deno.env.set("SQUARE_ENVIRONMENT", "production");
    assertEquals(squareApiBase(), "https://connect.squareup.com");
  } finally {
    if (previous === undefined) Deno.env.delete("SQUARE_ENVIRONMENT");
    else Deno.env.set("SQUARE_ENVIRONMENT", previous);
  }
});

Deno.test("a charge asks Square for £10 and does not run without a token", async () => {
  const token = Deno.env.get("SQUARE_ACCESS_TOKEN");
  const location = Deno.env.get("SQUARE_LOCATION_ID");
  Deno.env.delete("SQUARE_ACCESS_TOKEN");
  Deno.env.delete("SQUARE_LOCATION_ID");
  let called = false;
  const blocked = await createSquarePayment(
    { sourceId: "cnon:card-nonce-ok", idempotencyKey: "key-1", bookingId: "booking-1" },
    () => {
      called = true;
      return Promise.resolve(jsonResponse({}));
    },
  );
  assertEquals(called, false);
  assertEquals(blocked.status, null);
  assertEquals(blocked.error, "square_not_configured");

  Deno.env.set("SQUARE_ACCESS_TOKEN", token ?? "sandbox-token");
  if (location) Deno.env.set("SQUARE_LOCATION_ID", location);
  Deno.env.set("SQUARE_ACCESS_TOKEN", "sandbox-token");
  Deno.env.set("SQUARE_LOCATION_ID", "location-1");
  Deno.env.set("SQUARE_ENVIRONMENT", "sandbox");
  let sentUrl = "";
  let sentBody = "";
  const charged = await createSquarePayment(
    {
      sourceId: "cnon:card-nonce-ok",
      idempotencyKey: "key-1",
      bookingId: "11111111-1111-4111-8111-111111111111",
    },
    (url, init) => {
      sentUrl = String(url);
      sentBody = String(init?.body ?? "");
      return Promise.resolve(jsonResponse({
        payment: {
          id: "pay_1",
          status: "COMPLETED",
          amount_money: { amount: 1000, currency: "GBP" },
        },
      }));
    },
  );
  assertEquals(sentUrl, "https://connect.squareupsandbox.com/v2/payments");
  const parsed = JSON.parse(sentBody);
  assertEquals(parsed.amount_money, { amount: 1000, currency: "GBP" });
  assertEquals(parsed.source_id, "cnon:card-nonce-ok");
  assertEquals(parsed.idempotency_key, "key-1");
  assertEquals(parsed.note, "Smarter Dog grooming deposit");
  assertEquals(charged, {
    status: "COMPLETED",
    id: "pay_1",
    amountPence: 1000,
    currency: "GBP",
    error: null,
  });
});

Deno.test("a refund sends the stored idempotency key and the £10", async () => {
  Deno.env.set("SQUARE_ACCESS_TOKEN", "sandbox-token");
  Deno.env.set("SQUARE_LOCATION_ID", "location-1");
  let sentBody = "";
  const result = await refundSquarePayment(
    {
      paymentId: "pay_1",
      idempotencyKey: "refund-key",
      amountPence: 1000,
      reason: "cancelled_with_notice",
    },
    (_url, init) => {
      sentBody = String(init?.body ?? "");
      return Promise.resolve(jsonResponse({
        refund: { id: "ref_1", status: "COMPLETED", amount_money: { amount: 1000, currency: "GBP" } },
      }));
    },
  );
  assertEquals(JSON.parse(sentBody).idempotency_key, "refund-key");
  assertEquals(JSON.parse(sentBody).payment_id, "pay_1");
  assertEquals(result.id, "ref_1");
  assertEquals(result.status, "COMPLETED");
});
