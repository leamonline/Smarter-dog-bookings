// ============================================================
// customer-phone-on-file
//
// Pre-auth check: does the salon have this phone number on file?
// Called by the customer login page BEFORE supabase.auth.signInWithOtp
// so we don't pay Twilio to text numbers that aren't ours.
//
// This Edge Function exists rather than a bare RPC so we can do
// per-IP rate limiting. The underlying customer_phone_on_file()
// RPC is granted only to the service_role, so the only path to
// the lookup is through this rate-limited function.
//
// Request:
//   POST /functions/v1/customer-phone-on-file
//   body: { phone: "+447700900123" }
//
// Response (200):
//   { on_file: true | false }
//
// Errors:
//   400 — invalid phone
//   429 — rate-limited
//   500 — internal
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Per-IP rate limit. The customer login flow only needs a handful
// of attempts per minute even for someone fat-fingering their
// number. Anything beyond this is enumeration/abuse and we'd
// rather drop the request than spend Twilio credit.
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

// Global cap across all IPs in the same window. An attacker can
// rotate IPs (or spoof X-Forwarded-For if our proxy ever stops
// stripping it), making the per-IP bucket trivial to bypass. A
// global ceiling means horizontal enumeration of which numbers
// are on file stays uneconomic regardless of source IP.
const GLOBAL_RATE_LIMIT_MAX_ATTEMPTS = 200;
const GLOBAL_BUCKET_KEY = "__global__";

// Browser origins permitted to invoke this function. A wide-open
// Access-Control-Allow-Origin would let any site call the function
// from a victim's browser and use it as a "is this number a Smarter
// Dog customer?" oracle. Keep this list in sync with whatsapp-send's
// ALLOWED_ORIGINS — both functions are called by the same SPA.
const ALLOWED_ORIGINS = buildAllowedOrigins("CUSTOMER_PHONE_ALLOWED_ORIGINS");

const corsFor = (req: Request) => buildCorsHeaders(req, ALLOWED_ORIGINS);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function getClientIp(req: Request): string {
  // Supabase Edge Functions sit behind a Cloudflare-fronted proxy
  // that sets `cf-connecting-ip` to the real client IP. Prefer it:
  // an attacker can forge `x-forwarded-for` (browsers and curl both
  // pass it through verbatim), and using it first lets them rotate
  // the per-IP rate-limit bucket on every request.
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    // x-forwarded-for is a comma-separated list — the first entry is
    // the original client. Trim and take the leftmost.
    return fwd.split(",")[0]!.trim();
  }
  return "unknown";
}

/**
 * Check + record a rate-limit attempt atomically. Returns true if
 * the attempt is allowed (under the threshold), false if rate-limited.
 *
 * Uses a small SQL function so the count + insert happens in one
 * round trip. Falls back to inserting after a separate count if the
 * helper isn't available — but the migration installs it.
 */
async function checkAndRecordAttempt(ip: string): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "customer_phone_lookup_rate_limit",
    {
      p_ip: ip,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      p_max_attempts: RATE_LIMIT_MAX_ATTEMPTS,
    },
  );
  if (error) {
    console.error("rate-limit RPC error:", error);
    // Fail closed: better to block one legitimate request than to
    // let an attacker through.
    return false;
  }
  return data === true;
}

// Global cap across every IP in the same window. Sits next to the
// per-IP bucket so that even a perfectly rotated source IP can't
// turn the endpoint into a high-throughput enumeration oracle.
async function checkAndRecordGlobalAttempt(): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "customer_phone_lookup_rate_limit",
    {
      p_ip: GLOBAL_BUCKET_KEY,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      p_max_attempts: GLOBAL_RATE_LIMIT_MAX_ATTEMPTS,
    },
  );
  if (error) {
    console.error("global rate-limit RPC error:", error);
    return false;
  }
  return data === true;
}

async function lookupPhoneOnFile(phone: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("customer_phone_on_file", {
    p_phone: phone,
  });
  if (error) {
    console.error("customer_phone_on_file RPC error:", error);
    throw error;
  }
  return data === true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsFor(req) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  }

  let body: { phone?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  }

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  // Basic phone shape check — full normalisation happens server-side
  // in the RPC. We only reject obviously empty/garbage inputs here
  // so we never even count them toward the rate limit on real users
  // who fat-fingered the form.
  if (!phone || phone.length < 7 || phone.length > 20) {
    return new Response(JSON.stringify({ error: "invalid_phone" }), {
      status: 400,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  }

  const ip = getClientIp(req);

  // Two-tier rate limit: per-IP bucket catches a single fat-fingering
  // user, the global bucket catches horizontal enumeration that
  // rotates IPs to bypass the per-IP cap.
  const perIpAllowed = await checkAndRecordAttempt(ip);
  if (!perIpAllowed) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Too many attempts. Please wait a minute and try again.",
      }),
      {
        status: 429,
        headers: {
          ...corsFor(req),
          "content-type": "application/json",
          "retry-after": String(RATE_LIMIT_WINDOW_SECONDS),
        },
      },
    );
  }

  const globalAllowed = await checkAndRecordGlobalAttempt();
  if (!globalAllowed) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Service busy — please try again shortly.",
      }),
      {
        status: 429,
        headers: {
          ...corsFor(req),
          "content-type": "application/json",
          "retry-after": String(RATE_LIMIT_WINDOW_SECONDS),
        },
      },
    );
  }

  try {
    const onFile = await lookupPhoneOnFile(phone);
    return new Response(JSON.stringify({ on_file: onFile }), {
      status: 200,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  }
});
