// sendSms asks Twilio for delivery callbacks only when the endpoint is configured,
// so merging the callback code changes nothing until it is.
// Run locally:  deno test --node-modules-dir=none --allow-env supabase/functions/_shared/twilioStatusCallback.test.ts

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// twilio.ts reads these once at import, so set them, import, then put the process
// environment back: env is shared across the whole `deno test` run and must not
// leak into other test files.
const SETUP = {
  TWILIO_ACCOUNT_SID: "AC0000000000000000000000000000000",
  TWILIO_API_KEY: "SK-test",
  TWILIO_API_SECRET: "secret",
  TWILIO_MESSAGING_SERVICE_SID: "MG-test",
};
const before = Object.fromEntries(Object.keys(SETUP).map((k) => [k, Deno.env.get(k)]));
for (const [key, value] of Object.entries(SETUP)) Deno.env.set(key, value);
const { sendSms } = await import("./twilio.ts");
for (const [key, value] of Object.entries(before)) {
  if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value);
}

async function sendAndCapture(callback: string | undefined): Promise<URLSearchParams> {
  if (callback === undefined) Deno.env.delete("TWILIO_STATUS_CALLBACK_URL");
  else Deno.env.set("TWILIO_STATUS_CALLBACK_URL", callback);
  const realFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = (_input, init) => {
    body = String((init?.body as URLSearchParams | undefined)?.toString() ?? "");
    return Promise.resolve(new Response(JSON.stringify({ sid: "SM1" }), { status: 201 }));
  };
  try { await sendSms("07700900123", "hello"); } finally {
    globalThis.fetch = realFetch;
    Deno.env.delete("TWILIO_STATUS_CALLBACK_URL");
  }
  return new URLSearchParams(body);
}

Deno.test("no callback is requested until the endpoint is configured", async () => {
  const params = await sendAndCapture(undefined);
  assertEquals(params.has("StatusCallback"), false);
  assertEquals(params.get("To"), "+447700900123");
  assertEquals(params.get("Body"), "hello");
});

Deno.test("an empty setting requests nothing either", async () => {
  assertEquals((await sendAndCapture("")).has("StatusCallback"), false);
});

Deno.test("once configured, the exact configured URL is sent, so the signature can be verified against it", async () => {
  const url = "https://example.supabase.co/functions/v1/twilio-status";
  assertEquals((await sendAndCapture(url)).get("StatusCallback"), url);
});
