// The production CORS default must not admit a local dev server (#875).
// Run locally:  deno test --node-modules-dir=none --allow-env supabase/functions/_shared/cors.test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildAllowedOrigins, buildCorsHeaders, DEFAULT_ALLOWED_ORIGINS } from "./cors.ts";

const UNSET = "CORS_TEST_UNSET_ALLOWED_ORIGINS";

function preflightFrom(origin: string, allowed: Set<string>) {
  const req = new Request("https://example.test", { method: "OPTIONS", headers: { origin } });
  return buildCorsHeaders(req, allowed)["Access-Control-Allow-Origin"];
}

Deno.test("the default list names no localhost origin", () => {
  assertEquals(DEFAULT_ALLOWED_ORIGINS.filter((o) => /localhost|127\.0\.0\.1/.test(o)), []);
});

Deno.test("with no override secret, a dev server's preflight gets no allow-origin", () => {
  Deno.env.delete(UNSET);
  const allowed = buildAllowedOrigins(UNSET);
  assertEquals(preflightFrom("http://localhost:5173", allowed), undefined);
  assertEquals(preflightFrom("https://smarterdog.co.uk", allowed), "https://smarterdog.co.uk");
});

Deno.test("an explicit override secret can still opt a dev server in", () => {
  Deno.env.set(UNSET, "https://smarterdog.co.uk, http://localhost:5173");
  try {
    assertEquals(preflightFrom("http://localhost:5173", buildAllowedOrigins(UNSET)), "http://localhost:5173");
  } finally {
    Deno.env.delete(UNSET);
  }
});
