// A missing sender is a definite "not sent" with its own code. It must not be
// confused with a lost connection (which is an unknown outcome). The sender is
// read when _shared/twilio.ts loads, so this lives in its own file with no
// TWILIO_MESSAGING_SERVICE_SID / TWILIO_SMS_FROM.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  SUPABASE_ANON_KEY: "test-anon",
  SEND_INTERNAL_SECRET: "test-send",
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: "token",
})) Deno.env.set(key, value);
Deno.env.delete("TWILIO_MESSAGING_SERVICE_SID");
Deno.env.delete("TWILIO_SMS_FROM");
const { handleSendRequest } = await import("../handler.ts");

Deno.test("a missing SMS sender: not sent, 'provider_not_configured', no request leaves the server", async () => {
  let twilioCalls = 0;
  const oldFetch = globalThis.fetch;
  const oldError = console.error;
  console.error = () => {};
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "api.twilio.com") twilioCalls++;
    const single = (new Headers(init?.headers).get("accept") ?? "").includes("vnd.pgrst.object");
    if (url.pathname === "/rest/v1/rpc/is_staff") return Promise.resolve(Response.json(true));
    if (url.pathname === "/auth/v1/user") return Promise.resolve(Response.json({ id: "u", aud: "authenticated", role: "authenticated" }));
    return Promise.resolve(Response.json(single ? null : []));
  };
  try {
    const response = await handleSendRequest(
      new Request("http://send.test", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer staff-jwt" },
        body: JSON.stringify({ mode: "manual", to: "07700 900123", text: "hello", conversation_id: "c" }),
      }),
    );
    const json = await response.json();
    assertEquals(response.status, 500);
    assertEquals(json.ok, false);
    assertEquals(json.outcome, "not_sent");
    assertEquals(json.code, "provider_not_configured");
    assertEquals(twilioCalls, 0);
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldError;
  }
});
