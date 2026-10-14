// The SMS safety net chases a failed cancellation notice the same way it
// chases a reminder or confirmation, claiming a cancelled_sms_fallback row
// first, and only while the booking is still cancelled (#989).
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  WEBHOOK_SECRET: "test-webhook",
  SEND_INTERNAL_SECRET: "test-send",
})) Deno.env.set(key, value);
const { handleSmsFallback, noticeStillRelevant, smsGroupKey } = await import("../handler.ts?cancelled");

interface Call { method: string; path: string; search: string; body: unknown }

const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

interface LogRow {
  id: string;
  booking_id: string;
  human_id: string;
  message_text: string;
  provider_message_id: string | null;
  status: string;
  trigger_type: string;
  created_at: string;
}

async function sweep(rows: LogRow[], bookings: { id: string; status: string }[]) {
  const calls: Call[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, path: url.pathname, search: decodeURIComponent(url.search), body });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.pathname === "/rest/v1/notification_log") {
      if (method === "GET") return reply(rows);
      if (method === "POST") return reply((body as unknown[]).map((_, i) => ({ id: `claim-${i}` })), 201);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/rest/v1/whatsapp_messages") return reply([]);
    if (url.pathname === "/rest/v1/bookings") return reply(bookings);
    if (url.pathname === "/rest/v1/humans") return reply([{ id: "human-1", phone: "+447700900777", sms_opted_out: false }]);
    if (url.pathname.endsWith("/functions/v1/sms-send")) return reply({ ok: true, twilio_sid: "SM-fallback" });
    return reply([]);
  };
  try {
    const response = await handleSmsFallback(
      new Request("http://fallback.test", { method: "POST", headers: { Authorization: "Bearer test-webhook" } }),
    );
    assertEquals(response.status, 200);
    return { json: await response.json(), calls };
  } finally {
    globalThis.fetch = oldFetch;
  }
}

const failedCancellation: LogRow = {
  id: "log-cancel",
  booking_id: "booking-1",
  human_id: "human-1",
  message_text: "Hi Synthetic, your appointment for Bella on Mon 20 Oct has been cancelled. Rebook anytime.",
  provider_message_id: "SM-accepted",
  status: "failed", // reaped from 'pending' by notification-pending-reaper
  trigger_type: "cancelled",
  created_at: twoHoursAgo,
};

Deno.test("the candidate query now asks for cancelled notices too", async () => {
  const { calls } = await sweep([], []);
  const query = calls.find((c) => c.path === "/rest/v1/notification_log" && c.method === "GET");
  assert(query);
  assertStringIncludes(query.search, "trigger_type=in.(reminder,confirmed,cancelled)");
});

Deno.test("a failed cancellation notice for a still-cancelled booking is texted, under its own fallback claim", async () => {
  const { json, calls } = await sweep([failedCancellation], [{ id: "booking-1", status: "Cancelled" }]);
  assertEquals(json.sms_sent, 1);

  const claim = calls.find((c) => c.path === "/rest/v1/notification_log" && c.method === "POST");
  assert(claim, "idempotency row claimed before sending");
  const claimed = (claim.body as Record<string, unknown>[])[0];
  assertEquals(claimed.trigger_type, "cancelled_sms_fallback");
  assertEquals(claimed.status, "pending");
  assertEquals(claimed.channel, "sms");
  assertEquals(claimed.message_text, failedCancellation.message_text);

  const sms = calls.find((c) => c.path.endsWith("/functions/v1/sms-send"));
  assert(sms, "sms-send was invoked");
  const sent = sms.body as Record<string, unknown>;
  assertEquals(sent.template_name, "booking_cancelled");
  assertEquals(sent.to, "+447700900777");
  assertEquals(sent.text, failedCancellation.message_text);
});

Deno.test("a cancellation notice for a booking staff have since restored is not chased", async () => {
  const { json, calls } = await sweep([failedCancellation], [{ id: "booking-1", status: "Confirmed" }]);
  assertEquals(json.sms_sent, 0);
  assertEquals(calls.filter((c) => c.path.endsWith("/functions/v1/sms-send")).length, 0);
});

Deno.test("a reminder for a cancelled booking is still not chased (unchanged)", async () => {
  const reminder: LogRow = { ...failedCancellation, id: "log-rem", trigger_type: "reminder", message_text: "See you tomorrow" };
  const { json } = await sweep([reminder], [{ id: "booking-1", status: "Cancelled" }]);
  assertEquals(json.sms_sent, 0);
});

Deno.test("noticeStillRelevant: cancellations invert the active-booking rule", () => {
  assertEquals(noticeStillRelevant("cancelled", "Cancelled"), true);
  assertEquals(noticeStillRelevant("cancelled", "Confirmed"), false);
  assertEquals(noticeStillRelevant("reminder", "Confirmed"), true);
  assertEquals(noticeStillRelevant("reminder", "Cancelled"), false);
  assertEquals(noticeStillRelevant("confirmed", "No-show"), false);
  assertEquals(noticeStillRelevant("confirmed", undefined), false);
});

Deno.test("two dogs cancelled together get one SMS each, each naming its own dog", async () => {
  const bella = { ...failedCancellation, id: "log-bella", booking_id: "booking-bella", message_text: "Hi Synthetic, your appointment for Bella on Mon 20 Oct has been cancelled. Rebook anytime." };
  const max = { ...failedCancellation, id: "log-max", booking_id: "booking-max", message_text: "Hi Synthetic, your appointment for Max on Mon 20 Oct has been cancelled. Rebook anytime." };
  const { json, calls } = await sweep([bella, max], [
    { id: "booking-bella", status: "Cancelled" },
    { id: "booking-max", status: "Cancelled" },
  ]);
  assertEquals(json.sms_sent, 2);
  const texts = calls.filter((c) => c.path.endsWith("/functions/v1/sms-send")).map((c) => String((c.body as Record<string, unknown>).text));
  assertEquals(texts.length, 2);
  assert(texts.some((t) => t.includes("Bella")) && texts.some((t) => t.includes("Max")), JSON.stringify(texts));
  // Each claim row covers exactly its own booking.
  const claims = calls.filter((c) => c.path === "/rest/v1/notification_log" && c.method === "POST")
    .map((c) => (c.body as Record<string, unknown>[]).map((row) => row.booking_id));
  assertEquals(claims, [["booking-bella"], ["booking-max"]]);
});

Deno.test("reminders and confirmations still share one SMS per customer and trigger", () => {
  const base = { human_id: "h1", booking_id: "b1" };
  assertEquals(smsGroupKey({ ...base, trigger_type: "reminder" }), smsGroupKey({ ...base, booking_id: "b2", trigger_type: "reminder" }));
  assert(smsGroupKey({ ...base, trigger_type: "cancelled" }) !== smsGroupKey({ ...base, booking_id: "b2", trigger_type: "cancelled" }));
});

Deno.test("cancellation rows written before this change are never texted", async () => {
  // The old notify-booking-cancelled wrote 'sent' on a Twilio accept with no
  // provider id, and never stored message_text. Neither may draw an SMS once
  // the fallback starts reading cancellations.
  const oldSent = { ...failedCancellation, id: "old-sent", status: "sent", provider_message_id: null, message_text: null as unknown as string };
  const oldFailed = { ...failedCancellation, id: "old-failed", status: "failed", provider_message_id: null, message_text: null as unknown as string };
  const { json, calls } = await sweep([oldSent, oldFailed], [{ id: "booking-1", status: "Cancelled" }]);
  assertEquals(json.sms_sent, 0);
  assertEquals(calls.filter((c) => c.path.endsWith("/functions/v1/sms-send")).length, 0);
  assertEquals(calls.filter((c) => c.path === "/rest/v1/notification_log" && c.method === "POST").length, 0);
});
