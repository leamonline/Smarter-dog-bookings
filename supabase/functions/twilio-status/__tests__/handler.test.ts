// The Twilio delivery-status endpoint. It is public, so the signature check is
// the whole security boundary: these tests try to get past it.
// Run locally:  deno test --node-modules-dir=none --allow-env supabase/functions/twilio-status/

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleTwilioStatus } from "../handler.ts";
import { computeTwilioSignature } from "../../_shared/twilioSignature.ts";

const TOKEN = "test-auth-token";
const URL_ = "https://example.supabase.co/functions/v1/twilio-status";

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  return async () => {
    const before: Record<string, string | undefined> = {};
    for (const key of Object.keys(env)) {
      before[key] = Deno.env.get(key);
      if (env[key] === undefined) Deno.env.delete(key); else Deno.env.set(key, env[key]!);
    }
    try { await fn(); } finally {
      for (const [key, value] of Object.entries(before)) {
        if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value);
      }
    }
  };
}
const CONFIGURED = { TWILIO_AUTH_TOKEN: TOKEN, TWILIO_STATUS_CALLBACK_URL: URL_ };

function recorder(message: Record<string, unknown> | null = { id: "m1", status: "sent", content: "[template:booking_confirmed] hi", conversation_id: "c1" }) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      const q: any = {
        select() { return q; }, eq() { return q; }, like() { return q; }, gte() { return q; }, order() { return q; }, limit() { return q; }, filter() { return q; },
        maybeSingle() {
          calls.push(`read:${table}`);
          if (table === "whatsapp_messages") return Promise.resolve({ data: message, error: null });
          return Promise.resolve({ data: { name: "Wendy", surname: "R", human_id: "h1", sort_order: 1 }, error: null });
        },
        then(resolve: (v: unknown) => unknown) {
          calls.push(`read:${table}`);
          if (table === "notification_log") return resolve({ data: [{ id: "l1", human_id: "h1", trigger_type: "confirmed", status: "sent" }], error: null });
          return resolve({ data: [], error: null });
        },
        insert() { calls.push(`write:${table}`); return Promise.resolve({ error: null }); },
        update() {
          // Conditional updates chain eq / in / not / select and resolve with the changed rows.
          const u: any = {
            eq() { return u; }, in() { return u; }, not() { return u; }, select() { return u; },
            then(resolve: (v: unknown) => unknown) { calls.push(`write:${table}`); return resolve({ data: [{ id: "x" }], error: null }); },
          };
          return u;
        },
      };
      return q;
    },
  };
  return { client, calls, writes: () => calls.filter((c) => c.startsWith("write:")) };
}

async function post(params: Record<string, string>, opts: { signature?: string | null; url?: string; method?: string } = {}) {
  const signature = opts.signature === undefined
    ? await computeTwilioSignature(TOKEN, opts.url ?? URL_, params)
    : opts.signature;
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (signature !== null) headers["x-twilio-signature"] = signature;
  return new Request("https://internal.gateway/functions/v1/twilio-status", {
    method: opts.method ?? "POST",
    headers,
    body: opts.method === "GET" ? undefined : new URLSearchParams(params).toString(),
  });
}

const UNDELIVERED = { MessageSid: "SM123", MessageStatus: "undelivered", ErrorCode: "30003", To: "+447700900123", AccountSid: "AC1" };

Deno.test("a correctly signed undelivered callback is recorded", withEnv(CONFIGURED, async () => {
  const r = recorder();
  const res = await handleTwilioStatus(await post(UNDELIVERED), { client: r.client });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.outcome, "undelivered");
  assertEquals(body.matched, true);
  assertEquals(r.writes().length > 0, true);
}));

Deno.test("the signature is checked against the configured URL, not the host the gateway reports", withEnv(CONFIGURED, async () => {
  // post() builds the Request on "internal.gateway" but signs the configured URL.
  const res = await handleTwilioStatus(await post(UNDELIVERED), { client: recorder().client });
  assertEquals(res.status, 200);
  // Signed for some other URL: rejected, whatever host it arrived on.
  const bad = await handleTwilioStatus(await post(UNDELIVERED, { url: "https://internal.gateway/functions/v1/twilio-status" }), { client: recorder().client });
  assertEquals(bad.status, 403);
}));

Deno.test("an unsigned request is refused and nothing is read or written", withEnv(CONFIGURED, async () => {
  const r = recorder();
  const res = await handleTwilioStatus(await post(UNDELIVERED, { signature: null }), { client: r.client });
  assertEquals(res.status, 403);
  assertEquals(r.calls.length, 0);
}));

Deno.test("a wrong signature is refused and nothing is read or written", withEnv(CONFIGURED, async () => {
  const r = recorder();
  const res = await handleTwilioStatus(await post(UNDELIVERED, { signature: "AAAAAAAAAAAAAAAAAAAAAAAAAAA=" }), { client: r.client });
  assertEquals(res.status, 403);
  assertEquals(r.calls.length, 0);
}));

Deno.test("a body tampered after signing is refused", withEnv(CONFIGURED, async () => {
  const r = recorder();
  const signature = await computeTwilioSignature(TOKEN, URL_, UNDELIVERED);
  const res = await handleTwilioStatus(await post({ ...UNDELIVERED, MessageStatus: "delivered" }, { signature }), { client: r.client });
  assertEquals(res.status, 403);
  assertEquals(r.calls.length, 0);
}));

Deno.test("a callback signed with the wrong token is refused", withEnv(CONFIGURED, async () => {
  const r = recorder();
  const signature = await computeTwilioSignature("not-the-token", URL_, UNDELIVERED);
  const res = await handleTwilioStatus(await post(UNDELIVERED, { signature }), { client: r.client });
  assertEquals(res.status, 403);
  assertEquals(r.calls.length, 0);
}));

Deno.test("unconfigured, it refuses everything before reading the body (fail closed)", async () => {
  for (const env of [
    { TWILIO_AUTH_TOKEN: undefined, TWILIO_STATUS_CALLBACK_URL: URL_ },
    { TWILIO_AUTH_TOKEN: TOKEN, TWILIO_STATUS_CALLBACK_URL: undefined },
    { TWILIO_AUTH_TOKEN: "", TWILIO_STATUS_CALLBACK_URL: URL_ },
  ]) {
    await withEnv(env, async () => {
      const r = recorder();
      const res = await handleTwilioStatus(await post(UNDELIVERED), { client: r.client });
      assertEquals(res.status, 500);
      assertEquals(r.calls.length, 0);
    })();
  }
});

Deno.test("only POST is accepted", withEnv(CONFIGURED, async () => {
  const res = await handleTwilioStatus(await post(UNDELIVERED, { method: "GET" }), { client: recorder().client });
  assertEquals(res.status, 405);
}));

Deno.test("a signed callback missing its sid or status is a 400", withEnv(CONFIGURED, async () => {
  assertEquals((await handleTwilioStatus(await post({ MessageStatus: "delivered" }), { client: recorder().client })).status, 400);
  assertEquals((await handleTwilioStatus(await post({ MessageSid: "SM1" }), { client: recorder().client })).status, 400);
}));

Deno.test("an accepted-only callback is acknowledged without touching the database", withEnv(CONFIGURED, async () => {
  const r = recorder();
  const res = await handleTwilioStatus(await post({ MessageSid: "SM1", MessageStatus: "sent" }), { client: r.client });
  assertEquals(res.status, 200);
  assertEquals((await res.json()).outcome, "accepted");
  assertEquals(r.calls.length, 0);
}));

Deno.test("a database failure is a 500, so it is visible rather than silently lost", withEnv(CONFIGURED, async () => {
  const broken = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }) }) }) };
  const res = await handleTwilioStatus(await post(UNDELIVERED), { client: broken });
  assertEquals(res.status, 500);
}));
