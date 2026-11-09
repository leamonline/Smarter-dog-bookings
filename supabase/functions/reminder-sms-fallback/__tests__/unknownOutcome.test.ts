// Stage 1, PR A: the hourly SMS chase must never text a customer whose WhatsApp
// may already have arrived, and must never text twice after an SMS whose
// outcome was never confirmed. An unknown send has no provider message id, so
// no delivery receipt can ever clear it; the only safe reading is "leave it
// for staff". Unknown outcomes are stored as status 'failed' with an
// error_message starting "outcome unknown:" (notification_log.status has no
// room for a fourth value, and migrations are applied by hand).
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  WEBHOOK_SECRET: "test-webhook",
  SEND_INTERNAL_SECRET: "test-send",
})) Deno.env.set(key, value);
const { handleSmsFallback } = await import("../handler.ts?unknown-outcome");

const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const CUSTOMER = {
  id: "human-1", name: "Synthetic", phone: "+447700900777", email: null,
  whatsapp: true, sms: true, whatsapp_opted_out: false, sms_opted_out: false, email_opted_out: false,
};

const failedReminder = (over: Record<string, unknown> = {}) => ({
  id: "log-rem",
  booking_id: "booking-1",
  human_id: "human-1",
  message_text: "Hi Synthetic, a reminder that Bella is booked in tomorrow at 9:00am.",
  provider_message_id: null as string | null,
  status: "failed",
  trigger_type: "reminder",
  created_at: twoHoursAgo,
  error_message: "Delivery failed — check provider logs" as string | null,
  ...over,
});

interface Sweep {
  rows: Record<string, unknown>[];
  /** Earlier SMS-chase claim rows already in the log. */
  priorClaims?: Record<string, unknown>[];
  smsSend?: "ok" | "unknown_body" | "server_error" | "no_answer" | "not_sent";
}

async function sweep({ rows, priorClaims = [], smsSend = "ok" }: Sweep) {
  const calls: { method: string; path: string; body: unknown; search: string }[] = [];
  const oldFetch = globalThis.fetch;
  const oldError = console.error;
  console.error = () => {};
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, path: url.pathname, body, search: decodeURIComponent(url.search) });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.pathname === "/rest/v1/notification_log") {
      if (method === "GET") {
        return reply(url.searchParams.get("trigger_type")?.endsWith("_sms_fallback") ? priorClaims : rows);
      }
      if (method === "POST") return reply((body as unknown[]).map((_, i) => ({ id: `claim-${i}` })), 201);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/rest/v1/whatsapp_messages") return reply([]);
    if (url.pathname === "/rest/v1/bookings") return reply([{ id: "booking-1", status: "Reconfirmed" }]);
    if (url.pathname === "/rest/v1/humans") return reply([CUSTOMER]);
    if (url.pathname.endsWith("/functions/v1/sms-send")) {
      switch (smsSend) {
        case "ok": return reply({ ok: true, twilio_sid: "SM-fallback" });
        case "unknown_body": return reply({ ok: false, outcome: "unknown", code: "delivery_outcome_unknown", error: "x" }, 502);
        case "server_error": return reply({}, 500);
        case "no_answer": throw new TypeError("connection reset");
        case "not_sent": return reply({ ok: false, outcome: "not_sent", code: "provider_rejected", error: "send failed" }, 502);
      }
    }
    return reply([]);
  };
  try {
    const response = await handleSmsFallback(
      new Request("http://fallback.test", { method: "POST", headers: { Authorization: "Bearer test-webhook" } }),
    );
    assertEquals(response.status, 200);
    const json = await response.json();
    const finalPatch = calls.filter((c) => c.method === "PATCH" && c.path === "/rest/v1/notification_log").at(-1)?.body as
      | Record<string, unknown>
      | undefined;
    return {
      json,
      calls,
      finalPatch,
      smsCalls: calls.filter((c) => c.path.endsWith("/functions/v1/sms-send")),
      claims: calls.filter((c) => c.method === "POST" && c.path === "/rest/v1/notification_log"),
    };
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldError;
  }
}

Deno.test("a WhatsApp row marked 'outcome unknown' is never chased by SMS", async () => {
  const r = await sweep({ rows: [failedReminder({ error_message: "outcome unknown: the provider's answer was lost, so the message may have been sent." })] });
  assertEquals(r.smsCalls.length, 0);
  assertEquals(r.claims.length, 0);
  assertEquals(r.json.sms_sent, 0);
});

Deno.test("a plainly failed WhatsApp row is still chased (unchanged)", async () => {
  const r = await sweep({ rows: [failedReminder()] });
  assertEquals(r.smsCalls.length, 1);
  assertEquals(r.json.sms_sent, 1);
  assertEquals(r.finalPatch?.status, "sent");
});

Deno.test("an SMS chase whose outcome is unknown is logged failed with the marker, once", async () => {
  const r = await sweep({ rows: [failedReminder()], smsSend: "unknown_body" });
  assertEquals(r.smsCalls.length, 1, "one attempt");
  assertEquals(r.finalPatch?.status, "failed");
  assertEquals(String(r.finalPatch?.error_message).startsWith("outcome unknown:"), true);
  assertEquals(r.finalPatch?.provider_message_id, null);
});

Deno.test("an SMS chase that gets a 5xx with no outcome is also unknown", async () => {
  const r = await sweep({ rows: [failedReminder()], smsSend: "server_error" });
  assertEquals(String(r.finalPatch?.error_message).startsWith("outcome unknown:"), true);
});

Deno.test("a call to sms-send that gets no answer at all is unknown, not a crash, and not retried", async () => {
  const r = await sweep({ rows: [failedReminder()], smsSend: "no_answer" });
  assertEquals(r.smsCalls.length, 1);
  assertEquals(String(r.finalPatch?.error_message).startsWith("outcome unknown:"), true);
});

Deno.test("a definite refusal by sms-send is logged as a plain failure (so the next run may try again)", async () => {
  const r = await sweep({ rows: [failedReminder()], smsSend: "not_sent" });
  assertEquals(r.finalPatch?.status, "failed");
  assertEquals(r.finalPatch?.error_message, "SMS fallback failed — check provider logs");
});

Deno.test("the next hourly run does not text again after an unconfirmed chase", async () => {
  const r = await sweep({
    rows: [failedReminder()],
    priorClaims: [{ id: "claim-earlier" }],
  });
  assertEquals(r.smsCalls.length, 0, "no second text");
  assertEquals(r.claims.length, 0, "no new claim either");
  assertEquals(r.json.sms_sent, 0);
});

Deno.test("the earlier-chase lookup asks for this trigger's marked rows for these bookings only", async () => {
  const r = await sweep({ rows: [failedReminder()] });
  const lookup = r.calls.find((c) => c.method === "GET" && c.path === "/rest/v1/notification_log" && c.search.includes("_sms_fallback"));
  assert(lookup, "the lookup ran before any claim");
  assert(lookup.search.includes("trigger_type=eq.reminder_sms_fallback"));
  assert(lookup.search.includes("error_message=like.outcome+unknown:%"));
  assert(lookup.search.includes("booking_id=in.(booking-1)"));
  const lookupIndex = r.calls.indexOf(lookup);
  const claimIndex = r.calls.findIndex((c) => c.method === "POST" && c.path === "/rest/v1/notification_log");
  assert(lookupIndex < claimIndex, "checked before claiming");
});
