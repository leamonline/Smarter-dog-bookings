// Shared CORS helpers for browser-callable edge functions.
//
// Each function passes in its own ALLOWED_ORIGINS set (typically
// built from a per-function env var like WHATSAPP_SEND_ALLOWED_ORIGINS)
// and an option for whether the x-internal-secret header is part of
// the cross-origin call shape.

export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  // The salon's own domain, where customers and staff reach the app.
  "https://smarterdog.co.uk",
  "https://www.smarterdog.co.uk",
  // The Vercel origin still serves the same deployment and keeps working for
  // anyone on an old bookmark. Remove it only once that traffic has stopped.
  "https://smarterdog.vercel.app",
  // No localhost (#875). A dev server listed here was a first-class caller of
  // the PRODUCTION send functions, so a laptop could message real customers.
  // `npm run dev` now runs on sample data anyway; a deliberate `dev:live`
  // session that truly needs a function sets that function's
  // *_ALLOWED_ORIGINS secret explicitly.
];

export function buildAllowedOrigins(envVarName: string): Set<string> {
  return new Set(
    (Deno.env.get(envVarName) ?? DEFAULT_ALLOWED_ORIGINS.join(","))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export interface CorsOptions {
  allowInternalSecret?: boolean;
}

export function buildCorsHeaders(
  req: Request,
  allowedOrigins: Set<string>,
  options: CorsOptions = {},
): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowedHeaders = options.allowInternalSecret
    ? "authorization, x-client-info, apikey, content-type, x-internal-secret"
    : "authorization, x-client-info, apikey, content-type";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
