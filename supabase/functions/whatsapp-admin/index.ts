// whatsapp-admin — management actions against Meta Cloud API (not messaging).
// Use for one-off setup and diagnostic calls: list WABA subscriptions,
// subscribe the app to webhook events, check phone number status, etc.
//
// Separate from whatsapp-send (messaging) and whatsapp-register (one-shot
// number registration) because management operations are a different
// concern with different lifecycles — better to keep them decoupled.
//
// Auth: x-internal-secret (no JWT). Only for trusted admin use.
//
// Actions:
//   { "action": "list_subscriptions" }
//     GET /{waba-id}/subscribed_apps — which apps are subscribed to this WABA's webhooks
//   { "action": "subscribe_app" }
//     POST /{waba-id}/subscribed_apps — subscribe the current app (derived from token) to this WABA's webhooks
//   { "action": "phone_status" }
//     GET /{phone-number-id} — returns registration + verification state for the phone number

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN")!;
const META_PHONE_NUMBER_ID = Deno.env.get("META_PHONE_NUMBER_ID")!;
const META_WABA_ID = Deno.env.get("META_WABA_ID")!;
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET")!;

const GRAPH_API_VERSION = "v22.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

async function metaFetch(path: string, method: "GET" | "POST"): Promise<{ status: number; body: string }> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${META_ACCESS_TOKEN}`,
      "Content-Type":  "application/json",
    },
  });
  const body = await res.text();
  return { status: res.status, body };
}

serve(async (req) => {
  try {
    if (req.headers.get("x-internal-secret") !== SEND_INTERNAL_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const payload = await req.json().catch(() => null);
    const action = payload?.action;

    if (action === "list_subscriptions") {
      const r = await metaFetch(`/${META_WABA_ID}/subscribed_apps`, "GET");
      return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json" } });
    }

    if (action === "subscribe_app") {
      const r = await metaFetch(`/${META_WABA_ID}/subscribed_apps`, "POST");
      return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json" } });
    }

    if (action === "phone_status") {
      const r = await metaFetch(`/${META_PHONE_NUMBER_ID}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,platform_type,throughput,status`, "GET");
      return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({ error: "unknown action; must be list_subscriptions | subscribe_app | phone_status" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("whatsapp-admin error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
