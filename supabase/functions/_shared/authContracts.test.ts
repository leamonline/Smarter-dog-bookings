// Negative contract tests for the primitives every Edge Function auth family
// is built from, plus the invariants the manifest must hold.
//
// WHY THESE AND NOT HTTP-LEVEL TESTS
//
// Every entrypoint calls `serve(...)` at module scope, so importing one starts
// an HTTP server — they cannot be exercised in-process without restructuring 27
// production functions, which is a far larger change than this contract is
// worth. The boundary is instead pinned from both ends:
//
//   • scripts/check-edge-function-auth.mjs proves, statically, that each
//     function still calls the primitives its declared family requires.
//   • this file proves those primitives refuse everything they should refuse.
//
// Together that covers "function X is in family Y" and "family Y's check fails
// closed", which is what the distributed boundary actually depends on.
//
// Runs under `deno test --allow-env`: no filesystem or network access, so the
// manifest arrives via a JSON import rather than a read.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { isAuthorizedWebhook, timingSafeEqualHeader } from "./webhook-auth.ts";
import { buildCorsHeaders } from "./cors.ts";
import {
  AUTH_FAMILIES,
  type AuthFamilyId,
  edgeFunctionNames,
  authFor,
  familyFor,
  functionsInFamily,
} from "./authManifest.ts";

const SECRET = "s3cret-value-with-enough-entropy";

// ---------------------------------------------------------------------------
// timingSafeEqualHeader — guards internal-secret, agent-secret, and the
// service half of staff-jwt-or-internal-secret and
// webhook-bearer-or-internal-secret.
// ---------------------------------------------------------------------------

Deno.test("timingSafeEqualHeader rejects a missing header", () => {
  assertFalse(timingSafeEqualHeader(null, SECRET));
  assertFalse(timingSafeEqualHeader(undefined, SECRET));
});

Deno.test("timingSafeEqualHeader rejects an empty header", () => {
  assertFalse(timingSafeEqualHeader("", SECRET));
});

Deno.test("timingSafeEqualHeader rejects when the expected secret is unset", () => {
  // The important one: a deployment that lost SEND_INTERNAL_SECRET must refuse
  // every caller, not accept the one who also sends nothing.
  assertFalse(timingSafeEqualHeader(SECRET, ""));
  assertFalse(timingSafeEqualHeader(SECRET, null));
  assertFalse(timingSafeEqualHeader(SECRET, undefined));
  assertFalse(timingSafeEqualHeader("", ""));
  assertFalse(timingSafeEqualHeader(null, null));
});

Deno.test("timingSafeEqualHeader rejects wrong values, including near misses", () => {
  assertFalse(timingSafeEqualHeader("wrong", SECRET));
  assertFalse(timingSafeEqualHeader(SECRET.slice(0, -1), SECRET)); // truncated
  assertFalse(timingSafeEqualHeader(SECRET + "x", SECRET)); // extended
  assertFalse(timingSafeEqualHeader(SECRET.toUpperCase(), SECRET)); // case
  assertFalse(timingSafeEqualHeader(` ${SECRET}`, SECRET)); // padded
  assertFalse(timingSafeEqualHeader(SECRET.replace(/.$/, "!"), SECRET)); // last char
});

Deno.test("timingSafeEqualHeader accepts only an exact match", () => {
  assert(timingSafeEqualHeader(SECRET, SECRET));
});

// ---------------------------------------------------------------------------
// isAuthorizedWebhook — guards webhook-bearer and the bearer half of the
// two hybrid webhook families.
// ---------------------------------------------------------------------------

Deno.test("isAuthorizedWebhook rejects a missing Authorization header", () => {
  assertFalse(isAuthorizedWebhook(null, SECRET));
  assertFalse(isAuthorizedWebhook(undefined, SECRET));
  assertFalse(isAuthorizedWebhook("", SECRET));
});

Deno.test("isAuthorizedWebhook requires the Bearer prefix", () => {
  // The raw secret alone must not authenticate.
  assertFalse(isAuthorizedWebhook(SECRET, SECRET));
  assertFalse(isAuthorizedWebhook(`bearer ${SECRET}`, SECRET)); // lowercase
  assertFalse(isAuthorizedWebhook(`Bearer  ${SECRET}`, SECRET)); // double space
  assertFalse(isAuthorizedWebhook(`Basic ${SECRET}`, SECRET));
});

Deno.test("isAuthorizedWebhook rejects an unset secret", () => {
  // Regression guard. Before this was fixed, `isAuthorizedWebhook("Bearer ", "")`
  // compared "Bearer " against "Bearer " + "" and returned true — so a
  // deployment that lost WEBHOOK_SECRET would authorise anyone sending the
  // literal header "Bearer ". Callers guard this too; the primitive must not
  // depend on them remembering.
  assertFalse(isAuthorizedWebhook("Bearer ", ""));
  assertFalse(isAuthorizedWebhook("Bearer", ""));
  assertFalse(isAuthorizedWebhook(`Bearer ${SECRET}`, ""));
});

Deno.test("isAuthorizedWebhook rejects a wrong secret", () => {
  assertFalse(isAuthorizedWebhook("Bearer wrong", SECRET));
  assertFalse(isAuthorizedWebhook(`Bearer ${SECRET.slice(0, -1)}`, SECRET));
  assertFalse(isAuthorizedWebhook(`Bearer ${SECRET}x`, SECRET));
});

Deno.test("isAuthorizedWebhook accepts only the exact bearer credential", () => {
  assert(isAuthorizedWebhook(`Bearer ${SECRET}`, SECRET));
});

// ---------------------------------------------------------------------------
// CORS origin policy — the only caller control the public-rate-limited family
// has, and defence in depth for every browser-callable function.
// ---------------------------------------------------------------------------

const ALLOWED = new Set(["https://smarterdog.vercel.app"]);

function corsFor(origin: string | null, allowInternalSecret = false) {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  const req = new Request("https://example.test/", { headers });
  return buildCorsHeaders(req, ALLOWED, { allowInternalSecret });
}

Deno.test("a disallowed origin gets no Access-Control-Allow-Origin", () => {
  // Without this, any site could call these functions from a victim's browser.
  const headers = corsFor("https://evil.example");
  assertEquals(headers["Access-Control-Allow-Origin"], undefined);
});

Deno.test("a missing origin gets no Access-Control-Allow-Origin", () => {
  assertEquals(corsFor(null)["Access-Control-Allow-Origin"], undefined);
});

Deno.test("origin matching is exact, not prefix or suffix based", () => {
  for (
    const origin of [
      "https://smarterdog.vercel.app.evil.example",
      "https://evil.example/https://smarterdog.vercel.app",
      "http://smarterdog.vercel.app", // scheme differs
      "https://smarterdog.vercel.app:443", // explicit port
      "https://SMARTERDOG.vercel.app", // case differs
    ]
  ) {
    assertEquals(
      corsFor(origin)["Access-Control-Allow-Origin"],
      undefined,
      `origin ${origin} must not be allowed`,
    );
  }
});

Deno.test("an allowed origin is echoed back exactly", () => {
  const headers = corsFor("https://smarterdog.vercel.app");
  assertEquals(
    headers["Access-Control-Allow-Origin"],
    "https://smarterdog.vercel.app",
  );
});

Deno.test("Vary: Origin is always set so a rejection cannot be cached as an approval", () => {
  assertEquals(corsFor("https://evil.example").Vary, "Origin");
  assertEquals(corsFor("https://smarterdog.vercel.app").Vary, "Origin");
});

Deno.test("x-internal-secret is only advertised when the function opts in", () => {
  assertFalse(
    corsFor("https://smarterdog.vercel.app")["Access-Control-Allow-Headers"]
      .includes("x-internal-secret"),
  );
  assert(
    corsFor("https://smarterdog.vercel.app", true)[
      "Access-Control-Allow-Headers"
    ].includes("x-internal-secret"),
  );
});

// ---------------------------------------------------------------------------
// Manifest invariants. The Node guard checks the manifest against the sources;
// these are the rules that hold within the manifest itself, so they fail here
// too rather than only in a Node-only script.
// ---------------------------------------------------------------------------

Deno.test("every classified function names a known auth family", () => {
  for (const name of edgeFunctionNames()) {
    const family = familyFor(name); // throws on an unknown family
    assert(family.description.length > 0, `${name}: family lacks a description`);
  }
});

Deno.test("no function claims the gateway verifies its JWT", () => {
  // CI deploys everything with --no-verify-jwt, so any `true` here would be a
  // false sense of safety.
  for (const name of edgeFunctionNames()) {
    assertEquals(
      authFor(name).gatewayVerifyJwt,
      false,
      `${name}: gatewayVerifyJwt must be false`,
    );
  }
});

Deno.test("unauthenticated functions all carry an origin allowlist", () => {
  // public-rate-limited has no caller identity to check, so the origin
  // allowlist and the rate limits are the entire control set. A member without
  // an origin policy would be a wide-open endpoint.
  const publicFunctions = functionsInFamily("public-rate-limited");
  assert(publicFunctions.length > 0, "expected at least one public function");
  for (const name of publicFunctions) {
    const entry = authFor(name);
    assert(
      typeof entry.originPolicy === "string" && entry.originPolicy.length > 0,
      `${name}: an unauthenticated function must declare an origin allowlist`,
    );
    assert(
      /rate limit/i.test(entry.replayDefence),
      `${name}: an unauthenticated function must document its rate limiting`,
    );
  }
});

Deno.test("every function states what happens when its secret is unset", () => {
  for (const name of edgeFunctionNames()) {
    const entry = authFor(name);
    assert(
      entry.emptySecretBehaviour.trim().length > 0,
      `${name}: emptySecretBehaviour must be stated`,
    );
  }
});

Deno.test("a family that can fail open must justify itself", () => {
  for (const [id, family] of Object.entries(AUTH_FAMILIES)) {
    if (family.failsClosedOnEmptySecret) continue;
    assert(
      family.emptySecretRationale.trim().length > 0,
      `family ${id}: must explain why failing open is acceptable`,
    );
    // And every member must describe its own degraded mode, so the exception
    // is visible per function rather than only at the family level.
    for (const name of functionsInFamily(id as AuthFamilyId)) {
      assert(
        /degrad|unset|skip|sole auth|not processed/i.test(
          authFor(name).emptySecretBehaviour,
        ),
        `${name}: belongs to fail-open family ${id} and must describe its degraded mode`,
      );
    }
  }
});

Deno.test("secret-bearing families declare a 401 or 403 refusal", () => {
  // meta-signature is excluded deliberately: whatsapp-webhook answers an
  // invalid signature with 200 because Meta retries non-2xx forever. It records
  // the event and stops processing, which is a refusal despite the status.
  for (const [id, family] of Object.entries(AUTH_FAMILIES)) {
    if (id === "meta-signature" || id === "public-rate-limited") continue;
    assert(
      family.unauthorizedStatuses.some((status) => status === 401 || status === 403),
      `family ${id}: must refuse unauthorised callers with 401 or 403`,
    );
  }
});
