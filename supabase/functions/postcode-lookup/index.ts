// Geoapify UK address suggestions through the existing public-rate-limited
// postcode-lookup route. New callers send { text }; cached callers can still
// send { postcode }. Responses retain { postcode, addresses }, with null UDPRN.
// The server holds GEOAPIFY_API_KEY; the browser receives only suggestions.
// Open-data coverage is incomplete, so manual signup entry stays available.
// 400 invalid input; 429 rate limit; 500 missing key; 502 provider failure.

import { lookupAddresses, providerErrorCode } from "./provider.ts";
import { parseLookupInput } from "./input.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEOAPIFY_API_KEY = Deno.env.get("GEOAPIFY_API_KEY") ?? "";

// Per-IP rate limit. A customer onboarding only needs a couple of
// explicit searches; limit repeated requests to protect the free quota.
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_ATTEMPTS = 8;

// Global cap across all IPs in the same window — an attacker can rotate
// IPs, so a global ceiling keeps credit-burning enumeration uneconomic.
const GLOBAL_RATE_LIMIT_MAX_ATTEMPTS = 300;

// Bucket-key prefixes keep the postcode rate-limit buckets isolated
// from customer-phone-on-file's (both share the generic
// customer_phone_lookup_rate_limit counter RPC).
const GLOBAL_BUCKET_KEY = "pc:__global__";

const ALLOWED_ORIGINS = buildAllowedOrigins("POSTCODE_LOOKUP_ALLOWED_ORIGINS");
const corsFor = (req: Request) => buildCorsHeaders(req, ALLOWED_ORIGINS);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function getClientIp(req: Request): string {
  // Prefer cf-connecting-ip: x-forwarded-for is forgeable by the client,
  // which would let an attacker rotate the per-IP bucket every request.
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}

async function checkAndRecordAttempt(
  key: string,
  maxAttempts: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "customer_phone_lookup_rate_limit",
    {
      p_ip: key,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      p_max_attempts: maxAttempts,
    },
  );
  if (error) {
    console.error("rate-limit RPC error:", error);
    return false; // fail closed
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  }

  const input = parseLookupInput(body);
  if ("error" in input) {
    // Invalid input never consumes rate-limit capacity or provider credit.
    return new Response(JSON.stringify({ error: input.error }), {
      status: 400,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  }

  if (!GEOAPIFY_API_KEY) {
    console.error("postcode-lookup: GEOAPIFY_API_KEY is not configured");
    return new Response(JSON.stringify({ error: "not_configured" }), {
      status: 500,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  }

  const ip = getClientIp(req);

  const perIpAllowed = await checkAndRecordAttempt(`pc:${ip}`, RATE_LIMIT_MAX_ATTEMPTS);
  const globalAllowed = perIpAllowed
    ? await checkAndRecordAttempt(GLOBAL_BUCKET_KEY, GLOBAL_RATE_LIMIT_MAX_ATTEMPTS)
    : false;

  if (!perIpAllowed || !globalAllowed) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Too many lookups. Please wait a minute and try again.",
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
    const payload = await lookupAddresses(input.text, GEOAPIFY_API_KEY);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  } catch (err) {
    // Fetch failures can include the URL (and its API key). Log only our own
    // bounded diagnostic codes, never the provider body, URL or raw exception.
    const code = providerErrorCode(err);
    console.error("postcode-lookup upstream error:", code);
    return new Response(JSON.stringify({ error: "upstream" }), {
      status: 502,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  }
});
