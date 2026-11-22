import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  apnsHost,
  buildApnsJwt,
  classifyApnsResponse,
  normaliseApnsToken,
  normaliseBundleId,
  normalisePem,
  sendApnsAlert,
} from "./apns.ts";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function testPem(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${bytesToBase64(pkcs8)}\n-----END PRIVATE KEY-----`;
  return { pem, publicKey: pair.publicKey };
}

function b64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.test("normaliseApnsToken accepts a 64-hex device token and rejects junk", () => {
  const token = "ab".repeat(32);
  assertEquals(normaliseApnsToken(`  ${token.toUpperCase()}  `), token);
  assertEquals(normaliseApnsToken("abc"), null);
  assertEquals(normaliseApnsToken(123), null);
  assertEquals(normaliseApnsToken(`${token}zz`), null);
});

Deno.test("normaliseBundleId accepts the app id and rejects a smuggled topic", () => {
  assertEquals(normaliseBundleId("uk.co.smarterdog.app"), "uk.co.smarterdog.app");
  assertEquals(normaliseBundleId(" uk.co.smarterdog.app "), "uk.co.smarterdog.app");
  assertEquals(normaliseBundleId("not a bundle"), null);
  assertEquals(normaliseBundleId("uk.co..app"), null);
  assertEquals(normaliseBundleId(""), null);
});

Deno.test("normalisePem turns a one-line secret back into a PEM", () => {
  assertEquals(normalisePem("-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----"), "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----");
});

Deno.test("sandbox and production use different Apple hosts", () => {
  assertEquals(apnsHost("sandbox"), "https://api.sandbox.push.apple.com");
  assertEquals(apnsHost("production"), "https://api.push.apple.com");
});

Deno.test("buildApnsJwt is an ES256 token for this team and key, signed by the .p8", async () => {
  const { pem, publicKey } = await testPem();
  const jwt = await buildApnsJwt({
    keyId: "KEYID12345",
    teamId: "TEAMID1234",
    privateKeyPem: pem,
    nowSeconds: 1_700_000_000,
  });
  const [header, payload, sig] = jwt.split(".");
  assertEquals(JSON.parse(new TextDecoder().decode(b64urlToBytes(header))), { alg: "ES256", kid: "KEYID12345" });
  assertEquals(JSON.parse(new TextDecoder().decode(b64urlToBytes(payload))), { iss: "TEAMID1234", iat: 1_700_000_000 });
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    b64urlToBytes(sig),
    new TextEncoder().encode(`${header}.${payload}`),
  );
  assertEquals(valid, true);
});

Deno.test("classifyApnsResponse drops dead tokens and keeps live ones on auth or outage errors", () => {
  assertEquals(classifyApnsResponse(200, ""), { kind: "sent", apnsId: null });
  assertEquals(classifyApnsResponse(410, "{\"reason\":\"Unregistered\"}"), {
    kind: "invalid_token",
    status: 410,
    reason: "Unregistered",
  });
  assertEquals(classifyApnsResponse(400, "{\"reason\":\"BadDeviceToken\"}"), {
    kind: "invalid_token",
    status: 400,
    reason: "BadDeviceToken",
  });
  assertEquals(classifyApnsResponse(400, "{\"reason\":\"DeviceTokenNotForTopic\"}"), {
    kind: "invalid_token",
    status: 400,
    reason: "DeviceTokenNotForTopic",
  });
  assertEquals(classifyApnsResponse(403, "{\"reason\":\"ExpiredProviderToken\"}"), {
    kind: "rejected",
    status: 403,
    reason: "ExpiredProviderToken",
  });
  assertEquals(classifyApnsResponse(400, "{\"reason\":\"BadTopic\"}"), {
    kind: "rejected",
    status: 400,
    reason: "BadTopic",
  });
  assertEquals(classifyApnsResponse(429, ""), { kind: "unavailable", status: 429, reason: "http_429" });
  assertEquals(classifyApnsResponse(503, ""), { kind: "unavailable", status: 503, reason: "http_503" });
});

Deno.test("sendApnsAlert posts to the environment host and returns the apns-id", async () => {
  const { pem } = await testPem();
  const token = "cd".repeat(32);
  let called = "";
  const fetchImpl: typeof fetch = (input, init) => {
    called = String(input);
    const headers = new Headers(init?.headers);
    assertEquals(headers.get("apns-topic"), "uk.co.smarterdog.app");
    assertEquals(headers.get("apns-push-type"), "alert");
    assertEquals(headers.get("authorization")?.startsWith("bearer "), true);
    const body = JSON.parse(String(init?.body));
    assertEquals(body.aps.alert.title, "Smarter Dog Grooming");
    assertEquals(body.kind, "booking_reminder");
    return Promise.resolve(new Response("", { status: 200, headers: { "apns-id": "apple-1" } }));
  };
  const result = await sendApnsAlert(
    {
      deviceToken: token,
      environment: "sandbox",
      bundleId: "uk.co.smarterdog.app",
      title: "Smarter Dog Grooming",
      body: "See you tomorrow",
      data: { kind: "booking_reminder" },
    },
    { keyId: "KEYID12345", teamId: "TEAMID1234", privateKeyPem: pem },
    fetchImpl,
    1_700_000_000,
  );
  assertEquals(called, `https://api.sandbox.push.apple.com/3/device/${token}`);
  assertEquals(result, { kind: "sent", apnsId: "apple-1" });
});
