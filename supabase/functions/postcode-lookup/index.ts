// ============================================================
// postcode-lookup
//
// Proxies a UK postcode -> address list lookup to APITier's UK
// PostCode API, so the customer onboarding screen can offer a
// "type postcode -> pick your address" flow that returns the real
// Royal Mail PAF address (e.g. "6 Back Lane, Mottram, Hyde, SK14 6JE").
//
// This is an Edge Function rather than a browser call for two reasons:
//   1. APITier's key is a paid credential and their docs require it
//      stays server-side — never in frontend code.
//   2. APITier charges per lookup, so we apply the same per-IP +
//      global rate limiting as customer-phone-on-file to keep abuse
//      from burning credit (the Twilio rationale, one API over).
//
// Request:
//   POST /functions/v1/postcode-lookup
//   body: { postcode: "SK14 6JE" }
//
// Response (200):
//   { postcode: "SK14 6JE", addresses: [ { line, postcode, udprn }, ... ] }
//   (empty addresses array = valid request, no premises matched)
//
// Coverage note: APITier's postcode product is Royal Mail PAF only. PAF does
// NOT include the Multiple Residence dataset (flats, sub-divided houses, halls
// of residence, multi-business premises — ~800k UK addresses) or very new
// builds, so those legitimately won't appear here and there's no APITier
// parameter that adds them. The onboarding UI covers this gap with a
// manual-entry fallback. A genuine completeness upgrade would mean moving to a
// provider that exposes Multiple Residence / AddressBase (e.g. Ideal Postcodes,
// getAddress.io, OS Places) — intentionally out of scope for now.
//
// Errors:
//   400 — invalid/garbage postcode input
//   429 — rate-limited
//   500 — server misconfigured (no API key)
//   502 — upstream APITier failure
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APITIER_API_KEY = Deno.env.get("APITIER_API_KEY") ?? "";

const APITIER_BASE = "https://postcode.apitier.com/v1/postcodes";

// Per-IP rate limit. A customer onboarding only needs a couple of
// lookups even if they fat-finger the postcode; anything beyond this
// is abuse and we'd rather drop it than spend an APITier lookup.
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

// Normalise to the canonical "OUTCODE INCODE" form APITier expects.
// Returns null for input that can't be a UK postcode so we never spend
// a lookup (or count it toward the rate limit) on obvious garbage.
function normalisePostcode(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/\s+/g, "");
  // UK postcodes are 5-7 chars; allow letters + digits only.
  if (!/^[A-Z0-9]{5,7}$/.test(compact)) return null;
  // Inward code is always the last 3 chars: <digit><letter><letter>.
  const outward = compact.slice(0, -3);
  const inward = compact.slice(-3);
  if (!/^[0-9][A-Z]{2}$/.test(inward)) return null;
  return `${outward} ${inward}`;
}

interface ApitierAddress {
  address?: string;
  postcode?: string;
  post_town?: string;
  udprn?: string;
  uprn?: string;
}

async function lookupAddresses(
  postcode: string,
): Promise<{ postcode: string; addresses: Array<{ line: string; postcode: string; udprn: string | null }> }> {
  const url = `${APITIER_BASE}/${encodeURIComponent(postcode)}?x-api-key=${encodeURIComponent(APITIER_API_KEY)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });

  // 5xx = APITier is unhealthy -> surface as a retryable upstream error.
  if (res.status >= 500) {
    throw new Error(`apitier_upstream_${res.status}`);
  }

  // 4xx (e.g. unknown postcode) -> treat as "no matches", let the UI
  // offer manual entry rather than showing a scary error.
  let body: { result?: { postcode?: string; addresses?: ApitierAddress[] } } = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }

  const result = body?.result;
  const rawAddresses = Array.isArray(result?.addresses) ? result!.addresses! : [];
  const addresses = rawAddresses
    .map((a) => ({
      line: (a.address ?? "").trim(),
      postcode: (a.postcode ?? result?.postcode ?? postcode).trim(),
      udprn: a.udprn ?? null,
    }))
    .filter((a) => a.line !== "");

  return { postcode: result?.postcode ?? postcode, addresses };
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

  if (!APITIER_API_KEY) {
    console.error(
      "postcode-lookup: APITIER_API_KEY is not set. Run `supabase secrets set APITIER_API_KEY=...`",
    );
    return new Response(JSON.stringify({ error: "not_configured" }), {
      status: 500,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  }

  let body: { postcode?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  }

  const rawPostcode = typeof body.postcode === "string" ? body.postcode : "";
  const postcode = normalisePostcode(rawPostcode);
  if (!postcode) {
    // Reject before the rate-limit count so a mistyped postcode on a real
    // customer doesn't eat into their bucket.
    return new Response(JSON.stringify({ error: "invalid_postcode" }), {
      status: 400,
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
    const payload = await lookupAddresses(postcode);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  } catch (err) {
    console.error("postcode-lookup upstream error:", err);
    return new Response(JSON.stringify({ error: "upstream" }), {
      status: 502,
      headers: { ...corsFor(req), "content-type": "application/json" },
    });
  }
});
