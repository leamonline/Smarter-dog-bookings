// A WhatsApp that Meta says was delivered/read must not be chased by SMS just
// because its notification_log row says 'failed'. Meta can attach a spurious
// 131026 to a message it then delivers; the log row stays 'failed', and the
// fallback used to trust it without asking whatsapp_messages.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  WEBHOOK_SECRET: "test-webhook",
  SEND_INTERNAL_SECRET: "test-send",
})) Deno.env.set(key, value);
const { handleSmsFallback } = await import("../handler.ts?delivered-despite-failed");

const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const SMS_CUSTOMER = {
  id: "human-1", name: "Synthetic", phone: "+447700900777", email: null,
  whatsapp: true, sms: true, whatsapp_opted_out: false, sms_opted_out: false, email_opted_out: false,
};

const failedReminder = {
  id: "log-rem",
  booking_id: "booking-1",
  human_id: "human-1",
  message_text: "Hi Synthetic, a reminder that Bella is booked in tomorrow at 9:00am.",
  provider_message_id: "wamid.REMINDER" as string | null,
  status: "failed",
  trigger_type: "reminder",
  created_at: twoHoursAgo,
};

async function sweep(messages: { meta_message_id: string; status: string }[], row = failedReminder) {
  const smsCalls: unknown[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.pathname === "/rest/v1/notification_log") {
      // The lookup for an earlier, unconfirmed SMS chase (trigger *_sms_fallback) finds nothing here.
      if (method === "GET") return reply(url.searchParams.get("trigger_type")?.endsWith("_sms_fallback") ? [] : [row]);
      if (method === "POST") return reply([{ id: "claim-0" }], 201);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/rest/v1/whatsapp_messages") return reply(messages);
    if (url.pathname === "/rest/v1/bookings") return reply([{ id: "booking-1", status: "Reconfirmed" }]);
    if (url.pathname === "/rest/v1/humans") return reply([SMS_CUSTOMER]);
    if (url.pathname.endsWith("/functions/v1/sms-send")) {
      smsCalls.push(init?.body);
      return reply({ ok: true, twilio_sid: "SM-fallback" });
    }
    return reply([]);
  };
  try {
    const response = await handleSmsFallback(
      new Request("http://fallback.test", { method: "POST", headers: { Authorization: "Bearer test-webhook" } }),
    );
    assertEquals(response.status, 200);
    return { json: await response.json(), smsCalls };
  } finally {
    globalThis.fetch = oldFetch;
  }
}

Deno.test("a 'failed' log row whose WhatsApp Meta shows as read is not chased by SMS", async () => {
  const { json, smsCalls } = await sweep([{ meta_message_id: "wamid.REMINDER", status: "read" }]);
  assertEquals(json.sms_sent, 0);
  assertEquals(smsCalls.length, 0);
});

Deno.test("a 'failed' log row whose WhatsApp Meta shows as delivered is not chased by SMS", async () => {
  const { json, smsCalls } = await sweep([{ meta_message_id: "wamid.REMINDER", status: "delivered" }]);
  assertEquals(json.sms_sent, 0);
  assertEquals(smsCalls.length, 0);
});

Deno.test("a 'failed' log row that Meta also failed is still chased", async () => {
  const { json, smsCalls } = await sweep([{ meta_message_id: "wamid.REMINDER", status: "failed" }]);
  assertEquals(json.sms_sent, 1);
  assertEquals(smsCalls.length, 1);
});

Deno.test("a 'failed' log row with no delivery record is still chased", async () => {
  const { json } = await sweep([]);
  assertEquals(json.sms_sent, 1);
});

Deno.test("a send-time failure with no Meta id is still chased", async () => {
  const { json } = await sweep([], { ...failedReminder, provider_message_id: null });
  assertEquals(json.sms_sent, 1);
});
