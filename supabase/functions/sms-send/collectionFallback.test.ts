import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "synthetic-anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
Deno.env.set("SEND_INTERNAL_SECRET", "synthetic-internal-secret");

const { handleSendRequest } = await import("./handler.ts");

Deno.test("collection SMS permits the internal fallback but requires staff to use the claim", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetInterval = globalThis.setInterval;
  const intervals: ReturnType<typeof setInterval>[] = [];
  // The SDK starts a refresh timer for each short-lived client in this test.
  globalThis.setInterval = (...args: Parameters<typeof setInterval>) => {
    const interval = originalSetInterval(...args);
    intervals.push(interval);
    return interval;
  };
  globalThis.fetch = (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin === "http://localhost:54321" && url.pathname === "/auth/v1/user") {
      return Promise.resolve(Response.json({ id: "synthetic-staff" }));
    }
    if (url.origin === "http://localhost:54321" && url.pathname === "/rest/v1/rpc/is_staff") {
      return Promise.resolve(Response.json(true));
    }
    throw new Error("Unexpected network request");
  };

  const request = (headers: Record<string, string>) => new Request("http://localhost/sms-send", {
    method: "POST",
    headers,
    // Empty text lets us observe the internal path reaching the sender's
    // validation without invoking Twilio or making a claim.
    body: JSON.stringify({
      mode: "template", template_name: "ready_for_collection_sms", to: "+447700900321", text: "",
    }),
  });
  try {
    const staff = await handleSendRequest(request({ authorization: "Bearer synthetic-staff" }));
    assertEquals(staff.status, 409);
    assertEquals((await staff.json()).outcome, "not_sent");

    const fallback = await handleSendRequest(request({ "x-internal-secret": "synthetic-internal-secret" }));
    assertEquals(fallback.status, 400);
    assertEquals((await fallback.json()).error, "empty message body");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setInterval = originalSetInterval;
    for (const interval of intervals) clearInterval(interval);
  }
});
