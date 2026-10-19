// Unit tests for the out-of-credit detector and its Slack report.
//
// Run locally:
//   deno test --node-modules-dir=none --allow-env supabase/functions/_shared/aiCreditAlert.test.ts
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isCreditExhausted, reportAiCreditExhausted } from "./aiCreditAlert.ts";

// The exact body Anthropic returned on 19 Oct 2026.
const OUT_OF_CREDIT =
  '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}';

Deno.test("recognises Anthropic's out-of-credit error", () => {
  assert(isCreditExhausted(OUT_OF_CREDIT));
});

Deno.test("ignores every other Anthropic error", () => {
  assertFalse(isCreditExhausted('{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'));
  assertFalse(isCreditExhausted('{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'));
  assertFalse(isCreditExhausted(""));
});

Deno.test("reports to slack-alerts in ai_credit mode with the webhook secret", async () => {
  Deno.env.set("SUPABASE_URL", "http://supabase.test");
  Deno.env.set("WEBHOOK_SECRET", "hook-secret");
  const realFetch = globalThis.fetch;
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  try {
    await reportAiCreditExhausted("whatsapp-agent");
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(seen.length, 1);
  assertEquals(seen[0].url, "http://supabase.test/functions/v1/slack-alerts");
  assertEquals((seen[0].init?.headers as Record<string, string>).Authorization, "Bearer hook-secret");
  assertEquals(JSON.parse(String(seen[0].init?.body)), { mode: "ai_credit", source: "whatsapp-agent" });
});

Deno.test("a failed report never throws into the caller", async () => {
  Deno.env.set("SUPABASE_URL", "http://supabase.test");
  Deno.env.set("WEBHOOK_SECRET", "hook-secret");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;
  try {
    await reportAiCreditExhausted("dashboard-summary");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("does nothing without a webhook secret", async () => {
  Deno.env.set("SUPABASE_URL", "http://supabase.test");
  Deno.env.delete("WEBHOOK_SECRET");
  const realFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  try {
    await reportAiCreditExhausted("whatsapp-agent");
  } finally {
    globalThis.fetch = realFetch;
  }
  assertFalse(called);
});
