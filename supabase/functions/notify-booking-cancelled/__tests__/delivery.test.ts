// Cancellation notices go out as SMS at once, then email when a text is not
// possible, unless CANCELLATION_WHATSAPP_ENABLED is exactly "true" AND the
// salon cancelled (cancellation_cause = salon). Then a customer who can be
// reached on WhatsApp gets booking_cancelled_v1. A customer cancellation, or
// a row with no cause, stays on SMS then email. A Meta rejection falls back
// to SMS, then email, on the same notification_log row. 'sent' is only when the provider accepts,
// otherwise 'failed' with that error, and the channel is the one actually used.
// The flag defaults off: these tests leave it unset unless a case turns it on.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  WEBHOOK_SECRET: "test-webhook",
  SEND_INTERNAL_SECRET: "test-send",
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: "test-token",
  TWILIO_SMS_FROM: "+15550002222",
  SENDGRID_API_KEY: "SG.test",
  SENDGRID_FROM_EMAIL: "salon@example.test",
})) Deno.env.set(key, value);
const {
  handleBookingCancelled,
  cancellationAppointmentWhen,
  cancellationCause,
  isSalonCancellation,
} = await import("../handler.ts?delivery");

interface Call {
  method: string;
  host: string;
  path: string;
  body: Record<string, unknown> | string | null;
  headers: Headers;
}

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
  whatsapp?: { status: number; body: Record<string, unknown> };
}

async function cancel(
  human: Human = HUMAN,
  providers: Providers = {},
  // Unset unless a case names it. Only the exact string "true" enables WhatsApp.
  flag?: string,
  // Bookings carry a slot. Pass null to cover a row that has none.
  slot: string | null = "10:00",
  // Only "salon" may use the apology template. Null is a cause we cannot see.
  cause: string | null = null,
) {
  const previousFlag = Deno.env.get("CANCELLATION_WHATSAPP_ENABLED");
  if (flag === undefined) Deno.env.delete("CANCELLATION_WHATSAPP_ENABLED");
  else Deno.env.set("CANCELLATION_WHATSAPP_ENABLED", flag);
  const twilio = providers.twilio ?? { status: 201, body: { sid: "SM-sms", status: "queued" } };
  const email = providers.email ?? { status: 202 };
  const whatsapp = providers.whatsapp ?? {
    status: 200,
    body: { ok: true, meta_message_id: "wamid.CANCELLED" },
  };
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
    calls.push({
      method,
      host: url.hostname,
      path: url.pathname,
      body,
      headers: new Headers(init?.headers),
    });
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.hostname === "api.twilio.com") return reply(twilio.body, twilio.status);
    if (url.hostname === "api.sendgrid.com") {
      return email.body === undefined
        ? new Response(null, { status: email.status })
        : reply(email.body, email.status);
    }
    if (url.pathname === "/functions/v1/whatsapp-send") return reply(whatsapp.body, whatsapp.status);
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
          record: {
            id: "booking-1",
            status: "Cancelled",
            cancel_reason: "Customer request",
            ...(cause ? { cancellation_cause: cause } : {}),
          },
          old_record: {
            id: "booking-1",
            dog_id: "dog-1",
            booking_date: "2026-10-20",
            ...(slot ? { slot } : {}),
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
    if (previousFlag === undefined) Deno.env.delete("CANCELLATION_WHATSAPP_ENABLED");
    else Deno.env.set("CANCELLATION_WHATSAPP_ENABLED", previousFlag);
  }
}

const logWrites = (calls: Call[]) => calls.filter((c) => c.path === "/rest/v1/notification_log");
const twilioCalls = (calls: Call[]) => calls.filter((c) => c.host === "api.twilio.com");
const emailCalls = (calls: Call[]) => calls.filter((c) => c.host === "api.sendgrid.com");
const whatsappCalls = (calls: Call[]) => calls.filter((c) => c.path === "/functions/v1/whatsapp-send");

function finalPatch(calls: Call[]): Record<string, unknown> {
  const patches = logWrites(calls).filter((c) => c.method === "PATCH");
  assert(patches.length > 0, "the notification row was finalised");
  return patches[patches.length - 1].body as Record<string, unknown>;
}

function claims(calls: Call[]): Call[] {
  return logWrites(calls).filter((c) => c.method === "POST");
}

Deno.test("an SMS the provider accepts is logged sent on the sms channel, with no WhatsApp attempt", async () => {
  const { json, calls } = await cancel();
  const twilio = twilioCalls(calls);
  assertEquals(twilio.length, 1, "one Twilio SMS");
  assertStringIncludes(String(twilio[0].body), "%2B447700900666");
  assertEquals(String(twilio[0].body).includes("whatsapp"), false);
  assertEquals(whatsappCalls(calls).length, 0, "WhatsApp is not tried while the flag is off");
  assertEquals(emailCalls(calls).length, 0, "email is not used when SMS is accepted");

  const [claim, finalise] = logWrites(calls);
  assertEquals(claim.method, "POST");
  const claimBody = claim.body as Record<string, unknown>;
  assertEquals(claimBody.channel, "sms");
  assertEquals(claimBody.status, "pending");
  assertEquals(claimBody.trigger_type, "cancelled");
  assertEquals(
    claimBody.message_text,
    "Hi Synthetic, your appointment for Bella on Tue 20 Oct has been cancelled. Rebook anytime.",
  );
  assertEquals(String(claimBody.message_text).includes("10:00"), false);

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

Deno.test("SMS opted out still uses email, and does not try WhatsApp, when a mobile is on file", async () => {
  const { calls } = await cancel({ ...HUMAN, sms_opted_out: true, whatsapp: true });
  assertEquals(twilioCalls(calls).length, 0);
  assertEquals(whatsappCalls(calls).length, 0);
  assertEquals(emailCalls(calls).length, 1);
  const patch = finalPatch(calls);
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "email");
});

Deno.test("the optional SMS tickbox is not needed: a customer with it off is still texted, not emailed", async () => {
  // SMS is a required operational channel, so a cancellation reaches anyone with a
  // mobile who hasn't opted out of SMS. (Before November 2026 this went to email.)
  const { calls } = await cancel({ ...HUMAN, sms: false, whatsapp: true });
  assertEquals(whatsappCalls(calls).length, 0);
  assertEquals(twilioCalls(calls).length, 1);
  assertEquals(emailCalls(calls).length, 0);
  const patch = finalPatch(calls);
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "sms");
});

Deno.test("a text STOP (Twilio 21610) on this direct send is recorded and flagged for staff, like sms-send does", async () => {
  const { calls } = await cancel(HUMAN, {
    twilio: { status: 400, body: { code: 21610, message: "Attempt to send to unsubscribed recipient" } },
  });
  const optOut = calls.find((c) => c.path === "/rest/v1/humans" && c.method === "PATCH");
  assertEquals((optOut?.body as Record<string, unknown>)?.sms_opted_out, true);
  assertEquals((optOut?.body as Record<string, unknown>)?.sms_opted_out_reason, "asked_on_sms");
  const todo = calls.find((c) => c.path === "/rest/v1/salon_todos" && c.method === "POST");
  assertStringIncludes(String((todo?.body as Record<string, unknown>)?.text), "STOP received:");
  // The cancellation itself still falls back to email.
  assertEquals(emailCalls(calls).length, 1);
});

Deno.test("a reschedule cancellation is still skipped and nothing is sent, flag on or off", async () => {
  Deno.env.set("CANCELLATION_WHATSAPP_ENABLED", "true");
  const calls: Call[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push({
      method: init?.method ?? "GET",
      host: url.hostname,
      path: url.pathname,
      body: null,
      headers: new Headers(init?.headers),
    });
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
    Deno.env.delete("CANCELLATION_WHATSAPP_ENABLED");
  }
});

Deno.test("a customer with no phone and no email is skipped and nothing is sent", async () => {
  const { json, calls } = await cancel({ ...HUMAN, phone: null, email: null, sms: false });
  assertEquals(twilioCalls(calls).length, 0);
  assertEquals(emailCalls(calls).length, 0);
  assertEquals(logWrites(calls).length, 0);
  assertEquals(json.recipients[0].skipped, "no contact method");
});

Deno.test("only an exact salon cause may use the apology template", () => {
  assertEquals(isSalonCancellation("salon"), true);
  assertEquals(isSalonCancellation("customer"), false);
  assertEquals(isSalonCancellation("reschedule"), false);
  assertEquals(isSalonCancellation("system"), false);
  assertEquals(isSalonCancellation("Salon"), false);
  assertEquals(isSalonCancellation(null), false);
  assertEquals(
    cancellationCause({ record: { cancellation_cause: "customer" }, old_record: { cancellation_cause: "salon" } }),
    "customer",
  );
  assertEquals(cancellationCause({ old_record: { cancellation_cause: " salon " } }), "salon");
  assertEquals(cancellationCause({ record: { cancellation_cause: "" } }), null);
  assertEquals(cancellationCause({}), null);
});

Deno.test("flag on: a customer-requested cancellation is texted, not sent the salon apology", async () => {
  const { calls } = await cancel(HUMAN, {}, "true", "10:00", "customer");
  assertEquals(whatsappCalls(calls).length, 0);
  assertEquals(twilioCalls(calls).length, 1);
  assertEquals(emailCalls(calls).length, 0);
  const claim = claims(calls)[0].body as Record<string, unknown>;
  assertEquals(claim.channel, "sms");
  assertEquals(
    claim.message_text,
    "Hi Synthetic, your appointment for Bella on Tue 20 Oct has been cancelled. Rebook anytime.",
  );
  assertEquals(finalPatch(calls).status, "sent");
  assertEquals(finalPatch(calls).channel, "sms");
});

Deno.test("flag on: a missing cause is not guessed onto WhatsApp", async () => {
  const { calls } = await cancel(HUMAN, {}, "true");
  assertEquals(whatsappCalls(calls).length, 0);
  assertEquals(twilioCalls(calls).length, 1);
  assertEquals(finalPatch(calls).channel, "sms");
});

Deno.test("flag on: a reschedule or system cause does not use the salon template", async () => {
  for (const cause of ["reschedule", "system"]) {
    const { calls } = await cancel(HUMAN, {}, "true", "10:00", cause);
    assertEquals(whatsappCalls(calls).length, 0, cause);
    assertEquals(twilioCalls(calls).length, 1, cause);
    assertEquals(finalPatch(calls).channel, "sms", cause);
  }
});

Deno.test("the WhatsApp date matches the approved sample, and omits the time when there is no slot", () => {
  assertEquals(cancellationAppointmentWhen("2025-06-16", "10:00"), "Monday 16 June at 10:00am");
  assertEquals(cancellationAppointmentWhen("2026-10-20", "09:00"), "Tuesday 20 October at 9:00am");
  assertEquals(cancellationAppointmentWhen("2026-10-20", null), "Tuesday 20 October");
  assertEquals(cancellationAppointmentWhen("2026-10-20", "  "), "Tuesday 20 October");
});

Deno.test("flag on: a booking with no slot still sends the long date, and the text stays short", async () => {
  const { calls } = await cancel(HUMAN, {}, "true", null, "salon");
  const params = (whatsappCalls(calls)[0].body as { params: string[] }).params;
  assertEquals(params, ["Synthetic", "Bella", "Tuesday 20 October"]);
  const claim = claims(calls)[0].body as Record<string, unknown>;
  assertEquals(
    claim.message_text,
    "Hi Synthetic, your appointment for Bella on Tue 20 Oct has been cancelled. Rebook anytime.",
  );
});

Deno.test("the string false does not enable WhatsApp", async () => {
  const { calls } = await cancel(HUMAN, {}, "false");
  assertEquals(whatsappCalls(calls).length, 0);
  assertEquals(twilioCalls(calls).length, 1);
  assertEquals(finalPatch(calls).channel, "sms");
});

Deno.test("flag on: a WhatsApp customer gets the Meta template, logged sent on whatsapp, and is not also texted or emailed", async () => {
  const { json, calls } = await cancel(HUMAN, {}, "true", "10:00", "salon");
  assertEquals(whatsappCalls(calls).length, 1);
  const sent = whatsappCalls(calls)[0];
  assertEquals(sent.headers.get("x-internal-secret"), "test-send");
  assertEquals(sent.headers.get("authorization"), "Bearer test-key");
  const body = sent.body as Record<string, unknown>;
  assertEquals(body.mode, "template");
  assertEquals(body.template_name, "booking_cancelled_v1");
  assertEquals(body.language, "en_GB");
  assertEquals(body.to, HUMAN.phone);
  assertEquals(body.human_id, HUMAN.id);
  const params = body.params as string[];
  assertEquals(params, ["Synthetic", "Bella", "Tuesday 20 October at 10:00am"]);
  assertEquals(twilioCalls(calls).length, 0);
  assertEquals(emailCalls(calls).length, 0);
  assertEquals(claims(calls).length, 1, "one log row, so the customer is not notified twice");

  const claim = claims(calls)[0].body as Record<string, unknown>;
  assertEquals(claim.channel, "whatsapp");
  assertEquals(claim.status, "pending");
  assertEquals(claim.trigger_type, "cancelled");
  assertEquals(
    claim.message_text,
    "Hi Synthetic, your appointment for Bella on Tue 20 Oct has been cancelled. Rebook anytime.",
  );

  const patch = finalPatch(calls);
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "whatsapp");
  assertEquals(patch.provider_message_id, "wamid.CANCELLED");
  assertEquals(patch.error_message, null);
  assert(typeof patch.sent_at === "string" && patch.sent_at.length > 0);
  assertEquals(json.recipients[0].channel, "whatsapp");
  assertEquals(json.recipients[0].sent, true);
});

Deno.test("flag on: a Meta rejection falls back to SMS on the same row and does not also email", async () => {
  const { calls } = await cancel(HUMAN, {
    whatsapp: { status: 502, body: { error: "Meta send failed" } },
  }, "true", "10:00", "salon");
  assertEquals(whatsappCalls(calls).length, 1);
  assertEquals(twilioCalls(calls).length, 1);
  assertEquals(emailCalls(calls).length, 0);
  assertEquals(claims(calls).length, 1);

  const names = calls.map((c) => {
    if (c.path === "/functions/v1/whatsapp-send") return "whatsapp";
    if (c.host === "api.twilio.com") return "sms";
    if (c.path === "/rest/v1/notification_log" && c.method === "PATCH") {
      const body = c.body as Record<string, unknown>;
      return `patch:${body.channel}:${body.status}`;
    }
    return "";
  }).filter(Boolean);
  assertEquals(names, ["whatsapp", "patch:sms:pending", "sms", "patch:sms:sent"]);

  const patch = finalPatch(calls);
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "sms");
  assertEquals(patch.provider_message_id, "SM-sms");
  assertEquals(patch.error_message, null);
});

Deno.test("flag on: Meta accepting the call but returning no message id is a failure and falls back to SMS", async () => {
  const { calls } = await cancel(HUMAN, {
    whatsapp: { status: 200, body: { ok: true, meta_message_id: null } },
  }, "true", "10:00", "salon");
  assertEquals(twilioCalls(calls).length, 1);
  assertEquals(emailCalls(calls).length, 0);
  const patch = finalPatch(calls);
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "sms");
  assertEquals(patch.provider_message_id, "SM-sms");
});

Deno.test("flag on: a customer who replied STOP on WhatsApp is texted instead, and WhatsApp is not called", async () => {
  // A STOP is honoured for the channel it was sent on: whatsapp_opted_out switches
  // WhatsApp off and the cancellation goes by SMS (_shared/channelPolicy.ts).
  const { calls } = await cancel({ ...HUMAN, whatsapp_opted_out: true }, {}, "true", "10:00", "salon");
  assertEquals(whatsappCalls(calls).length, 0);
  assertEquals(twilioCalls(calls).length, 1);
  assertEquals(emailCalls(calls).length, 0);
  const claim = claims(calls)[0].body as Record<string, unknown>;
  assertEquals(claim.channel, "sms");
  assertEquals(finalPatch(calls).channel, "sms");
  assertEquals(finalPatch(calls).status, "sent");
});

Deno.test("flag on: a customer who stopped BOTH WhatsApp and SMS gets neither, only email", async () => {
  const { calls } = await cancel({ ...HUMAN, whatsapp_opted_out: true, sms_opted_out: true }, {}, "true", "10:00", "salon");
  assertEquals(whatsappCalls(calls).length, 0);
  assertEquals(twilioCalls(calls).length, 0);
  assertEquals(emailCalls(calls).length, 1);
  assertEquals(finalPatch(calls).channel, "email");
});

Deno.test("flag on: whatsapp-send refusing an opt-out falls back to SMS and is not logged sent on WhatsApp", async () => {
  const { calls } = await cancel(HUMAN, {
    whatsapp: {
      status: 409,
      body: { error: "This customer has opted out of WhatsApp messages", reason: "whatsapp_opted_out" },
    },
  }, "true", "10:00", "salon");
  assertEquals(whatsappCalls(calls).length, 1);
  assertEquals(twilioCalls(calls).length, 1);
  assertEquals(emailCalls(calls).length, 0);
  const patch = finalPatch(calls);
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "sms");
  assertEquals(patch.error_message, null);
});

Deno.test("flag on: WhatsApp only, with SMS switched off, sends the template and does not email", async () => {
  const { calls } = await cancel({ ...HUMAN, sms: false, whatsapp: true }, {}, "true", "10:00", "salon");
  assertEquals(whatsappCalls(calls).length, 1);
  assertEquals(twilioCalls(calls).length, 0);
  assertEquals(emailCalls(calls).length, 0);
  const patch = finalPatch(calls);
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "whatsapp");
  assertEquals(patch.provider_message_id, "wamid.CANCELLED");
});

Deno.test("flag on: Meta rejection with the optional SMS tickbox off still falls back to SMS", async () => {
  const { calls } = await cancel(
    { ...HUMAN, sms: false },
    { whatsapp: { status: 502, body: { error: "Meta send failed" } } },
    "true",
    "10:00",
    "salon",
  );
  assertEquals(whatsappCalls(calls).length, 1);
  assertEquals(twilioCalls(calls).length, 1);
  assertEquals(emailCalls(calls).length, 0);
  const patch = finalPatch(calls);
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "sms");
});

Deno.test("flag on: Meta rejection with SMS opted out uses email and does not text", async () => {
  const { calls } = await cancel(
    { ...HUMAN, sms_opted_out: true },
    { whatsapp: { status: 502, body: { error: "Meta send failed" } } },
    "true",
    "10:00",
    "salon",
  );
  assertEquals(whatsappCalls(calls).length, 1);
  assertEquals(twilioCalls(calls).length, 0);
  assertEquals(emailCalls(calls).length, 1);
  assertEquals(claims(calls).length, 1);
  const patch = finalPatch(calls);
  assertEquals(patch.status, "sent");
  assertEquals(patch.channel, "email");
  assertEquals(patch.error_message, null);
  assertEquals(patch.provider_message_id, null);
});

Deno.test("flag on: Meta, SMS and email all rejected is logged failed on email with each reason", async () => {
  const { calls } = await cancel(HUMAN, {
    whatsapp: { status: 502, body: { error: "Meta send failed" } },
    twilio: { status: 400, body: { code: 21211, message: "Invalid 'To' Phone Number" } },
    email: { status: 403, body: { errors: [{ message: "The from address does not match a verified Sender Identity." }] } },
  }, "true", "10:00", "salon");
  assertEquals(whatsappCalls(calls).length, 1);
  assertEquals(twilioCalls(calls).length, 1);
  assertEquals(emailCalls(calls).length, 1);
  assertEquals(claims(calls).length, 1);
  const patch = finalPatch(calls);
  assertEquals(patch.status, "failed");
  assertEquals(patch.channel, "email");
  assertEquals(patch.sent_at, null);
  assertEquals(patch.provider_message_id, null);
  assertStringIncludes(String(patch.error_message), "Meta send failed");
  assertStringIncludes(String(patch.error_message), "Twilio 21211");
  assertStringIncludes(String(patch.error_message), "verified Sender Identity");
});

Deno.test("flag on: Meta rejection with SMS opted out and no email is logged failed on whatsapp and nothing else is sent", async () => {
  const { calls } = await cancel(
    { ...HUMAN, sms_opted_out: true, email: null },
    { whatsapp: { status: 502, body: { error: "Template name does not exist in the translation" } } },
    "true",
    "10:00",
    "salon",
  );
  assertEquals(twilioCalls(calls).length, 0);
  assertEquals(emailCalls(calls).length, 0);
  assertEquals(claims(calls).length, 1);
  const patch = finalPatch(calls);
  assertEquals(patch.status, "failed");
  assertEquals(patch.channel, "whatsapp");
  assertEquals(patch.sent_at, null);
  assertEquals(patch.provider_message_id, null);
  assertStringIncludes(String(patch.error_message), "Template name does not exist");
});
