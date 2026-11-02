import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleMessengerWebhookRequest } from "./handler.ts";

const SECRET = "test-app-secret";
const TOKEN = "verify-token";

async function signed(body: unknown, secret = SECRET): Promise<Request> {
  const raw = JSON.stringify(body);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("https://example.test/messenger-webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${hex}` },
    body: raw,
  });
}

const pageMessage = {
  object: "page",
  entry: [{
    id: "111",
    messaging: [{
      sender: { id: "222" },
      recipient: { id: "111" },
      timestamp: Date.now(),
      message: { mid: "mid.1", text: "Hello" },
    }],
  }],
};

Deno.test("GET verify echoes the challenge and does not require the inbox flag", async () => {
  const res = await handleMessengerWebhookRequest(
    new Request(`https://example.test/messenger-webhook?hub.mode=subscribe&hub.verify_token=${TOKEN}&hub.challenge=abc123`),
    { enabled: false, verifyToken: TOKEN, appSecret: SECRET },
  );
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "abc123");
});

Deno.test("a bad signature is not applied", async () => {
  let applied = false;
  const res = await handleMessengerWebhookRequest(
    new Request("https://example.test/messenger-webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=00" },
      body: JSON.stringify(pageMessage),
    }),
    {
      enabled: true,
      appSecret: SECRET,
      apply: () => {
        applied = true;
        return Promise.resolve();
      },
    },
  );
  assertEquals(res.status, 200);
  assertEquals(applied, false);
});

Deno.test("flag off acknowledges Meta and does not create a conversation", async () => {
  let applied = false;
  Deno.env.set("MESSENGER_INBOX_ENABLED", "false");
  const res = await handleMessengerWebhookRequest(await signed(pageMessage), {
    appSecret: SECRET,
    apply: () => {
      applied = true;
      return Promise.resolve();
    },
  });
  assertEquals(res.status, 200);
  assertEquals(applied, false);
});

Deno.test("flag on applies the inbound message", async () => {
  const seen: string[] = [];
  const res = await handleMessengerWebhookRequest(await signed(pageMessage), {
    enabled: true,
    appSecret: SECRET,
    pageId: "111",
    apply: (events) => {
      seen.push(...events.map((event) => event.kind));
      return Promise.resolve();
    },
    recordEvent: () => Promise.resolve(),
  });
  assertEquals(res.status, 200);
  assertEquals(seen, ["inbound"]);
});
