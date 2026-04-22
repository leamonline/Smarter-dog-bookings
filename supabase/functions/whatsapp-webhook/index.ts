// ============================================================
// supabase/functions/whatsapp-webhook/index.ts
//
// The single public entrypoint for Meta WhatsApp Cloud API.
// Does three things and three things only:
//
//   1. Handle GET — Meta's one-time verification handshake when
//      the webhook URL is registered. Echoes `hub.challenge` if
//      `hub.verify_token` matches our shared secret.
//
//   2. Handle POST — verify the X-Hub-Signature-256 HMAC using
//      META_APP_SECRET on the raw body, then persist the payload
//      to whatsapp_events. Return 200 within ~200ms.
//
//   3. Log everything — even invalid signatures are written
//      (with signature_valid = false) so we have a forensic trail.
//
// What this function does NOT do:
//   - Call Claude. That happens downstream via pg_net trigger.
//   - Update conversations or messages tables. Downstream job.
//   - Send replies. That's whatsapp-send.
//
// Deployment note:
//   Meta will not send a JWT with its webhook calls. Deploy with:
//     supabase functions deploy whatsapp-webhook --no-verify-jwt
//   This is safe because we do our own signature check.
//
// Env vars required:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   META_APP_SECRET            — from Meta App Dashboard → Settings → Basic
//   META_WEBHOOK_VERIFY_TOKEN  — any long random string, matches the one
//                                entered in the Meta webhook config UI
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Environment ─────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_APP_SECRET = Deno.env.get("META_APP_SECRET")!;
const META_WEBHOOK_VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN")!;

// ── Types (minimal — we keep the full payload in jsonb) ──────
interface MetaChange {
  field: string;
  value: {
    messaging_product?: string;
    metadata?: { display_phone_number?: string; phone_number_id?: string };
    contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
    messages?: Array<{ id?: string; from?: string; type?: string }>;
    statuses?: Array<{ id?: string; recipient_id?: string; status?: string }>;
  };
}

interface MetaWebhookBody {
  object?: string;
  entry?: Array<{ id?: string; changes?: MetaChange[] }>;
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Verify Meta's X-Hub-Signature-256 header against the raw body.
 * The signature is sha256 HMAC of the raw body using the app secret.
 * We use Web Crypto and a timing-safe compare.
 *
 * CRITICAL: `body` must be the RAW, byte-exact request body.
 * If we JSON.parse and re-stringify, whitespace differences break
 * the HMAC. That's why the caller reads the ArrayBuffer first.
 */
async function verifySignature(
  rawBody: ArrayBuffer,
  headerValue: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!headerValue) return false;

  // Meta sends "sha256=<hex>"
  const [algo, hex] = headerValue.split("=");
  if (algo !== "sha256" || !hex) return false;

  // Derive HMAC key from app secret
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigBuf = await crypto.subtle.sign("HMAC", key, rawBody);

  // Convert both to Uint8Array of equal length, then compare byte-by-byte.
  const expected = new Uint8Array(sigBuf);
  const got = hexToBytes(hex);
  if (got.length !== expected.length) return false;

  // Timing-safe compare (constant-time)
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ got[i];
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

/**
 * Best-effort extraction of the event type and first message/phone.
 * We persist the full payload regardless; these fields just make
 * whatsapp_events queryable by hand during debugging.
 */
function summarise(body: MetaWebhookBody): {
  event_type: string | null;
  phone_e164: string | null;
  meta_message_id: string | null;
} {
  const change = body.entry?.[0]?.changes?.[0];
  if (!change) return { event_type: null, phone_e164: null, meta_message_id: null };

  const eventType = change.field ?? null;

  // Prefer inbound message, fall back to status event
  const msg = change.value?.messages?.[0];
  const stat = change.value?.statuses?.[0];

  const waId =
    change.value?.contacts?.[0]?.wa_id ??
    msg?.from ??
    stat?.recipient_id ??
    null;

  // Meta returns wa_id like "447700900123" (no +). Normalise to E.164.
  const phone = waId ? `+${waId.replace(/\D/g, "")}` : null;
  const metaMessageId = msg?.id ?? stat?.id ?? null;

  return {
    event_type: eventType,
    phone_e164: phone,
    meta_message_id: metaMessageId,
  };
}

// ── Handler ──────────────────────────────────────────────────
serve(async (req) => {
  const url = new URL(req.url);

  // ───── GET: Meta's verification handshake ─────
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === META_WEBHOOK_VERIFY_TOKEN && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Any other GET — reject without echoing the challenge
    return new Response("forbidden", { status: 403 });
  }

  // ───── POST: real event ─────
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  // Read raw body for HMAC verification. Note: we MUST NOT
  // JSON.parse first or the stringified form will drift.
  const rawBody = await req.arrayBuffer();
  const signatureHeader = req.headers.get("x-hub-signature-256");

  const signatureValid = await verifySignature(
    rawBody,
    signatureHeader,
    META_APP_SECRET,
  );

  // Parse body regardless — we log failed-signature events too,
  // with signature_valid = false, so we can investigate attacks.
  let parsed: MetaWebhookBody = {};
  try {
    parsed = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    // Keep going with empty body; we'll still log what we can.
  }

  const { event_type, phone_e164, meta_message_id } = summarise(parsed);

  // Write the event row. Use service role so RLS doesn't block.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error: insertError } = await supabase.from("whatsapp_events").insert({
    signature: signatureHeader,
    signature_valid: signatureValid,
    event_type,
    phone_e164,
    meta_message_id,
    payload: parsed,
    processing_status: signatureValid ? "pending" : "failed",
    error_message: signatureValid ? null : "signature verification failed",
  });

  if (insertError) {
    // Don't leak DB errors to Meta — they'll retry on 5xx and
    // we'll just duplicate. Log to function logs instead.
    console.error("whatsapp-webhook insert failed:", insertError);
    return new Response("server error", { status: 500 });
  }

  // If signature was invalid we still return 200 — Meta considers
  // any non-2xx a retry signal, and we don't want retries of bad
  // signatures. We've already logged it for investigation.
  if (!signatureValid) {
    console.warn("whatsapp-webhook invalid signature, event logged");
    return new Response("ok", { status: 200 });
  }

  return new Response("ok", { status: 200 });
});

// ============================================================
// Local test harness (run in supabase functions serve)
//
// 1) Verification handshake:
//    curl "http://localhost:54321/functions/v1/whatsapp-webhook?\
//    hub.mode=subscribe&hub.verify_token=$META_WEBHOOK_VERIFY_TOKEN\
//    &hub.challenge=hello123"
//    → should echo "hello123"
//
// 2) Fake POST (signature will fail intentionally, row still logged):
//    curl -X POST http://localhost:54321/functions/v1/whatsapp-webhook \
//      -H "Content-Type: application/json" \
//      -H "x-hub-signature-256: sha256=deadbeef" \
//      -d '{"object":"whatsapp_business_account","entry":[]}'
//    → 200 ok, whatsapp_events row with signature_valid=false
//
// 3) Real signed POST: use Meta's webhook tester in the App
//    Dashboard (Webhooks → Send Test). Set the URL to your
//    deployed supabase function URL.
// ============================================================
