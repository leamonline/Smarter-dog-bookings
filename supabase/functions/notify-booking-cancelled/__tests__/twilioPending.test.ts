// A cancellation notice sent over Twilio WhatsApp is logged 'pending' when
// Twilio accepts it, never 'sent': Twilio's 2xx means queued, and there is no
// delivery receipt for this channel. The pending reaper and the SMS safety
// net do the rest (#989).
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { TWILIO_WHATSAPP_UNCONFIRMED } from "../../_shared/twilioDelivery.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  WEBHOOK_SECRET: "test-webhook",
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: "test-token",
  TWILIO_WHATSAPP_FROM: "+15550001111",
  TWILIO_SMS_FROM: "+15550002222",
})) Deno.env.set(key, value);
const { handleBookingCancelled } = await import("../handler.ts?twilio-pending");

interface Call { method: string; host: string; path: string; body: Record<string, unknown> | string | null }

const HUMAN = { id: "human-cancel", name: "Synthetic Person", phone: "+447700900666", whatsapp: true, sms: true, email: null, whatsapp_opted_out: false, sms_opted_out: false, email_opted_out: false };

async function cancel(twilio: { status: number; body: Record<string, unknown> }, human: Record<string, unknown> = HUMAN) {
  const calls: Call[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    let body: Call["body"] = null;
    if (init?.body) {
      const raw = String(init.body);
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    calls.push({ method, host: url.hostname, path: url.pathname, body });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.hostname === "api.twilio.com") return reply(twilio.body, twilio.status);
    if (url.pathname === "/rest/v1/dogs") return reply({ id: "dog-1", name: "Bella", human_id: HUMAN.id });
    if (url.pathname === "/rest/v1/humans") return reply([human]);
    if (url.pathname === "/rest/v1/notification_log") {
      return method === "POST" ? reply({ id: "log-1" }, 201) : new Response(null, { status: 204 });
    }
    return reply([]);
  };
  try {
    const response = await handleBookingCancelled(
      new Request("http://cancel.test", {
        method: "POST",
        headers: { Authorization: "Bearer test-webhook", "content-type": "application/json" },
        body: JSON.stringify({
          type: "UPDATE",
          record: { id: "booking-1", status: "Cancelled", cancel_reason: "Customer request" },
          old_record: { id: "booking-1", dog_id: "dog-1", booking_date: "2026-10-20", group_id: null, notify_human_ids: null, status: "Confirmed", visit_id: null },
        }),
      }),
    );
    assertEquals(response.status, 200);
    return { json: await response.json(), calls };
  } finally {
    globalThis.fetch = oldFetch;
  }
}

const logWrites = (calls: Call[]) => calls.filter((c) => c.path === "/rest/v1/notification_log");

Deno.test("Twilio accepting the WhatsApp leaves the row 'pending' with the SID, and stores the wording for the SMS fallback", async () => {
  const { calls } = await cancel({ status: 201, body: { sid: "SM-accepted", status: "queued" } });
  const twilio = calls.filter((c) => c.host === "api.twilio.com");
  assertEquals(twilio.length, 1, "one Twilio POST");
  assertStringIncludes(String(twilio[0].body), "whatsapp%3A%2B447700900666");

  const [claim, finalise] = logWrites(calls);
  assertEquals(claim.method, "POST");
  const claimBody = claim.body as Record<string, unknown>;
  assertEquals(claimBody.status, "pending");
  assertEquals(claimBody.trigger_type, "cancelled");
  assertStringIncludes(String(claimBody.message_text), "Bella on");
  assertStringIncludes(String(claimBody.message_text), "has been cancelled");

  assertEquals(finalise.method, "PATCH");
  const patch = finalise.body as Record<string, unknown>;
  assertEquals(patch.status, "pending", "an accept is not delivery");
  assertEquals(patch.provider_message_id, "SM-accepted");
  assertEquals(patch.sent_at, null);
  assertEquals(patch.error_message, TWILIO_WHATSAPP_UNCONFIRMED);
});

Deno.test("Twilio rejecting the WhatsApp records 'failed' with Twilio's reason", async () => {
  const { calls } = await cancel({
    status: 400,
    body: { code: 63016, message: "Failed to send freeform message because you are outside the allowed window." },
  });
  const finalise = logWrites(calls).find((c) => c.method === "PATCH");
  assert(finalise, "the row was finalised");
  const patch = finalise.body as Record<string, unknown>;
  assertEquals(patch.status, "failed");
  assertEquals(patch.provider_message_id, null);
  assertStringIncludes(String(patch.error_message), "Twilio 63016");
});

Deno.test("an SMS-channel customer is still logged 'sent' on accept (unchanged: no fallback chases SMS)", async () => {
  const { calls } = await cancel(
    { status: 201, body: { sid: "SM-sms" } },
    { ...HUMAN, whatsapp: false },
  );
  const finalise = logWrites(calls).find((c) => c.method === "PATCH");
  assert(finalise);
  assertEquals((finalise.body as Record<string, unknown>).status, "sent");
});
