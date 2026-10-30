// Cancellation notices go out as SMS at once, then email when a text is not
// possible. Twilio WhatsApp is not attempted. notification_log is 'sent' only
// when the provider accepts the message, otherwise 'failed' with that error,
// and the channel on the row is the one actually used.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  WEBHOOK_SECRET: "test-webhook",
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: "test-token",
  TWILIO_SMS_FROM: "+15550002222",
  SENDGRID_API_KEY: "SG.test",
  SENDGRID_FROM_EMAIL: "salon@example.test",
})) Deno.env.set(key, value);
const { handleBookingCancelled } = await import("../handler.ts?delivery");

interface Call { method: string; host: string; path: string; body: Record<string, unknown> | string | null }

interface Human {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: boolean;
  sms: boolean;
  email: string | null;
  whatsapp_opted_out: boolean;
  sms_opted_out: boolean;
  email_opted_out: boolean;
}

const HUMAN: Human = {
  id: "human-cancel",
  name: "Synthetic Person",
  phone: "+447700900666",
  whatsapp: true,
  sms: true,
  email: "synthetic@example.test",
  whatsapp_opted_out: false,
  sms_opted_out: false,
  email_opted_out: false,
};

interface Providers {
  twilio?: { status: number; body: Record<string, unknown> };
  email?: { status: number; body?: unknown };
}

async function cancel(human: Human = HUMAN, providers: Providers = {}) {
  const twilio = providers.twilio ?? { status: 201, body: { sid: "SM-sms", status: "queued" } };
  const email = providers.email ?? { status: 202 };
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
    if (url.hostname === "api.sendgrid.com") {
      return email.body === undefined
        ? new Response(null, { status: email.status })
        : reply(email.body, email.status);
    }
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
          old_record: {
            id: "booking-1",
            dog_id: "dog-1",
            booking_date: "2026-10-20",
            group_id: null,
            notify_human_ids: null,
            status: "Confirmed",
            visit_id: null,
          },
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
const twilioCalls = (calls: Call[]) => calls.filter((c) => c.host === "api.twilio.com");
const emailCalls = (calls: Call[]) => calls.filter((c) => c.host === "api.sendgrid.com");

function finalPatch(calls: Call[]): Record<string, unknown> {
  const finalise = logWrites(calls).find((c) => c.method === "PATCH");
  assert(finalise, "the notification row was finalised");
  return finalise.body as Record<string, unknown>;
}

Deno.test("an SMS the provider accepts is logged sent on the sms channel, with no WhatsApp attempt", async () => {
  const { json, calls } = await cancel();
  const twilio = twilioCalls(calls);
  assertEquals(twilio.length, 1, "one Twilio SMS");
  assertStringIncludes(String(twilio[0].body), "%2B447700900666");
  assertEquals(String(twilio[0].body).includes("whatsapp"), false);
  assertEquals(emailCalls(calls).length, 0, "email is not used when SMS is accepted");

  const [claim, finalise] = logWrites(calls);
  assertEquals(claim.method, "POST");
  const claimBody = claim.body as Record<string, unknown>;
  assertEquals(claimBody.channel, "sms");
  assertEquals(claimBody.status, "pending");
  assertEquals(claimBody.trigger_type, "cancelled");
  assertStringIncludes(String(claimBody.message_text), "Hi Synthetic");
  assertStringIncludes(String(claimBody.message_text), "Bella on");
  assertStringIncludes(String(claimBody.message_text), "has been cancelled");

  assertEquals(finalise.method, "PATCH");
  const patch = finalise.body as Record<string, unknown>;
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "sms");
  assertEquals(patch.provider_message_id, "SM-sms");
  assertEquals(patch.error_message, null);
  assert(typeof patch.sent_at === "string" && patch.sent_at.length > 0);
  assertEquals(json.recipients[0].channel, "sms");
  assertEquals(json.recipients[0].sent, true);
});

Deno.test("a rejected SMS falls back to email and the log records that email was accepted", async () => {
  const { calls } = await cancel(HUMAN, {
    twilio: { status: 400, body: { code: 21614, message: "To number is not a valid mobile number" } },
    email: { status: 202 },
  });
  assertEquals(twilioCalls(calls).length, 1);
  assertEquals(String(twilioCalls(calls)[0].body).includes("whatsapp"), false);
  assertEquals(emailCalls(calls).length, 1);
  const mail = emailCalls(calls)[0].body as {
    personalizations: Array<{ to: Array<{ email: string }> }>;
    subject: string;
    content: Array<{ value: string }>;
  };
  assertEquals(mail.personalizations[0].to[0].email, HUMAN.email);
  assertStringIncludes(mail.subject, "Bella");
  assertStringIncludes(mail.subject, "cancelled");
  assertStringIncludes(mail.content[0].value, "has been cancelled");

  const patch = finalPatch(calls);
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "email");
  assertEquals(patch.error_message, null);
  assertEquals(patch.provider_message_id, null);
  assert(typeof patch.sent_at === "string");
});

Deno.test("a customer with no mobile is emailed and Twilio is not called", async () => {
  const { calls } = await cancel({ ...HUMAN, phone: null, sms: true });
  assertEquals(twilioCalls(calls).length, 0);
  assertEquals(emailCalls(calls).length, 1);
  const claim = logWrites(calls).find((c) => c.method === "POST");
  assert(claim);
  assertEquals((claim.body as Record<string, unknown>).channel, "email");
  const patch = finalPatch(calls);
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "email");
  assertEquals(patch.error_message, null);
});

Deno.test("SMS opted out uses email and does not text", async () => {
  const { calls } = await cancel({ ...HUMAN, sms_opted_out: true });
  assertEquals(twilioCalls(calls).length, 0);
  assertEquals(emailCalls(calls).length, 1);
  const patch = finalPatch(calls);
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "email");
});

Deno.test("SMS rejected with no email address is logged failed on sms with Twilio's reason", async () => {
  const { calls } = await cancel(
    { ...HUMAN, email: null },
    { twilio: { status: 400, body: { code: 63015, message: "Twilio account not authorized to message this number" } } },
  );
  assertEquals(emailCalls(calls).length, 0);
  const patch = finalPatch(calls);
  assertEquals(patch.status, "failed");
  assertEquals(patch.channel, "sms");
  assertEquals(patch.sent_at, null);
  assertEquals(patch.provider_message_id, null);
  assertStringIncludes(String(patch.error_message), "Twilio 63015");
  assertStringIncludes(String(patch.error_message), "not authorized");
});

Deno.test("SMS and email both rejected is logged failed on email with both reasons", async () => {
  const { calls } = await cancel(HUMAN, {
    twilio: { status: 400, body: { code: 21211, message: "Invalid 'To' Phone Number" } },
    email: { status: 403, body: { errors: [{ message: "The from address does not match a verified Sender Identity." }] } },
  });
  const patch = finalPatch(calls);
  assertEquals(patch.status, "failed");
  assertEquals(patch.channel, "email");
  assertEquals(patch.sent_at, null);
  assertStringIncludes(String(patch.error_message), "Twilio 21211");
  assertStringIncludes(String(patch.error_message), "verified Sender Identity");
});

Deno.test("SMS switched off still uses email, and does not try WhatsApp, when a mobile is on file", async () => {
  const { calls } = await cancel({ ...HUMAN, sms: false, whatsapp: true });
  assertEquals(twilioCalls(calls).length, 0);
  assertEquals(emailCalls(calls).length, 1);
  const patch = finalPatch(calls);
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "email");
});

Deno.test("a reschedule cancellation is still skipped and nothing is sent", async () => {
  const calls: Call[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push({ method: init?.method ?? "GET", host: url.hostname, path: url.pathname, body: null });
    return Response.json([]);
  };
  try {
    const response = await handleBookingCancelled(
      new Request("http://cancel.test", {
        method: "POST",
        headers: { Authorization: "Bearer test-webhook", "content-type": "application/json" },
        body: JSON.stringify({
          type: "UPDATE",
          record: { id: "booking-1", status: "Cancelled", cancel_reason: "Rescheduled via WhatsApp" },
          old_record: {
            id: "booking-1",
            dog_id: "dog-1",
            booking_date: "2026-10-20",
            status: "Confirmed",
          },
        }),
      }),
    );
    assertEquals(response.status, 200);
    assertStringIncludes(await response.text(), "Skipped");
    assertEquals(calls.length, 0);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

Deno.test("a customer with no phone and no email is skipped and nothing is sent", async () => {
  const { json, calls } = await cancel({ ...HUMAN, phone: null, email: null, sms: false });
  assertEquals(twilioCalls(calls).length, 0);
  assertEquals(emailCalls(calls).length, 0);
  assertEquals(logWrites(calls).length, 0);
  assertEquals(json.recipients[0].skipped, "no contact method");
});
