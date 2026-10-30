// A waitlist join alerts the salon by email. Twilio WhatsApp is not used,
// even when SALON_ALERT_WHATSAPP is set. The log is 'sent' only when SendGrid
// accepts the message.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  WEBHOOK_SECRET: "test-webhook",
  SENDGRID_API_KEY: "SG.test",
  SENDGRID_FROM_EMAIL: "salon@example.test",
  SALON_ALERT_EMAIL: "alerts@smarterdog.test",
  SALON_ALERT_WHATSAPP: "+447700900000",
})) Deno.env.set(key, value);
const { handleWaitlistJoined } = await import("../handler.ts?email");

interface Call { method: string; host: string; path: string; body: Record<string, unknown> | string | null }

async function joined(email: { status: number; body?: unknown } | null) {
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
    if (url.hostname === "api.twilio.com") return reply({ sid: "SM-should-not-send" }, 201);
    if (url.hostname === "api.sendgrid.com") {
      if (!email) return reply({ errors: [{ message: "unexpected" }] }, 500);
      return email.body === undefined
        ? new Response(null, { status: email.status })
        : reply(email.body, email.status);
    }
    if (url.pathname === "/rest/v1/humans") {
      return reply({ id: "human-1", name: "Synthetic", surname: "Person", phone: "+447700900123" });
    }
    if (url.pathname === "/rest/v1/dogs") return reply([{ name: "Bella" }, { name: "Max" }]);
    if (url.pathname === "/rest/v1/notification_log") return new Response(null, { status: 201 });
    return reply([]);
  };
  try {
    const response = await handleWaitlistJoined(
      new Request("http://waitlist.test", {
        method: "POST",
        headers: { Authorization: "Bearer test-webhook", "content-type": "application/json" },
        body: JSON.stringify({
          type: "INSERT",
          record: { id: "wait-1", human_id: "human-1", target_date: "2026-10-20" },
        }),
      }),
    );
    assertEquals(response.status, 200);
    return { json: await response.json(), calls };
  } finally {
    globalThis.fetch = oldFetch;
  }
}

const logInserts = (calls: Call[]) =>
  calls.filter((c) => c.path === "/rest/v1/notification_log" && c.method === "POST");

Deno.test("a waitlist join emails the salon and logs sent on the email channel", async () => {
  Deno.env.set("SALON_ALERT_EMAIL", "alerts@smarterdog.test");
  const { json, calls } = await joined({ status: 202 });
  assertEquals(calls.filter((c) => c.host === "api.twilio.com").length, 0);
  const mailCalls = calls.filter((c) => c.host === "api.sendgrid.com");
  assertEquals(mailCalls.length, 1);
  const mail = mailCalls[0].body as {
    personalizations: Array<{ to: Array<{ email: string }> }>;
    subject: string;
    content: Array<{ value: string }>;
  };
  assertEquals(mail.personalizations[0].to[0].email, "alerts@smarterdog.test");
  assertStringIncludes(mail.subject, "Waitlist joined");
  assertStringIncludes(mail.subject, "Synthetic Person");
  assertStringIncludes(mail.content[0].value, "Bella, Max");
  assertStringIncludes(mail.content[0].value, "has joined the waitlist");

  const [row] = logInserts(calls);
  assert(row, "a notification_log row was written");
  const logged = row.body as Record<string, unknown>;
  assertEquals(logged.channel, "email");
  assertEquals(logged.status, "sent");
  assertEquals(logged.trigger_type, "waitlist_joined");
  assertEquals(logged.human_id, "human-1");
  assertEquals(logged.error_message, null);
  assert(typeof logged.sent_at === "string" && logged.sent_at.length > 0);
  assertEquals(json.success, true);
  assertEquals(json.channel, "email");
});

Deno.test("SendGrid rejecting the waitlist alert is logged failed with the error", async () => {
  Deno.env.set("SALON_ALERT_EMAIL", "alerts@smarterdog.test");
  const { json, calls } = await joined({
    status: 400,
    body: { errors: [{ message: "Does not contain a valid address." }] },
  });
  assertEquals(calls.filter((c) => c.host === "api.twilio.com").length, 0);
  const [row] = logInserts(calls);
  assert(row);
  const logged = row.body as Record<string, unknown>;
  assertEquals(logged.channel, "email");
  assertEquals(logged.status, "failed");
  assertEquals(logged.sent_at, null);
  assertStringIncludes(String(logged.error_message), "Does not contain a valid address");
  assertStringIncludes(String(logged.error_message), "400");
  assertEquals(json.success, false);
  assertEquals(json.channel, "email");
});

Deno.test("with no salon email the alert is skipped and Twilio WhatsApp is not used", async () => {
  Deno.env.delete("SALON_ALERT_EMAIL");
  try {
    const { json, calls } = await joined(null);
    assertEquals(json.skipped, true);
    assertEquals(calls.filter((c) => c.host === "api.twilio.com").length, 0);
    assertEquals(calls.filter((c) => c.host === "api.sendgrid.com").length, 0);
    assertEquals(logInserts(calls).length, 0);
  } finally {
    Deno.env.set("SALON_ALERT_EMAIL", "alerts@smarterdog.test");
  }
});
