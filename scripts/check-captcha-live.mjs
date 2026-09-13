// Is the login captcha actually ENFORCED on a deployed Supabase project?
//
// WHY THIS EXISTS
//
// Both login pages render a Cloudflare Turnstile widget, the visitor solves
// it, and the token is handed to Supabase as options.captchaToken. Supabase
// only checks it — by calling Cloudflare's siteverify endpoint — when CAPTCHA
// protection is enabled under Authentication -> Attack Protection. With the
// setting off, the token is accepted, ignored and discarded, and everything
// looks exactly the same from the outside.
//
// On 11 September 2026 that was the live state. The widget reported 0
// siteverify requests against 5 solved challenges in 24 hours, while the
// README, the architecture overview and a code comment all described Turnstile
// as active login protection.
//
// THE SIGNAL
//
// GoTrue applies captcha verification as middleware, before the credential
// check. So a deliberately wrong password tells you which one ran first:
//
//   enforced      -> "captcha protection: request disallowed (...)"
//   not enforced  -> "Invalid login credentials"
//
// This asks about a PROJECT's live configuration, not about a build, which is
// why it cannot be answered by reading the bundle the way check-sentry-live
// does.
//
// SAFETY
//
// The probe signs in as a nonsense address in the reserved .invalid TLD, so it
// cannot match a real account and cannot cause mail to be sent. It carries no
// real credentials and writes nothing.
//
// It probes the PASSWORD grant only. Never point this at /auth/v1/otp: if
// captcha is not enforced, that endpoint sends a real SMS, at real cost,
// possibly to a real person. The password grant shares the same captcha
// middleware and answers the same question for free.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./lib/load-env-local.mjs";

// Reserved TLD (RFC 2606) — resolves nowhere and can match no account.
const PROBE_EMAIL = "captcha-probe@smarter-dog.invalid";
const PROBE_PASSWORD = "not-a-real-password";
const INVALID_CAPTCHA_TOKEN = "definitely-not-a-valid-turnstile-token";

/**
 * Which check ran first — the captcha, or the password?
 *
 * Three-state on purpose. Guessing produced the original problem, so an
 * unrecognised response says "unknown" rather than picking the reassuring
 * answer.
 */
export function classifyCaptchaResponse(body) {
  if (!body || typeof body !== "object") return "unknown";

  // GoTrue answers with error_code/msg on current releases and
  // error/error_description on older ones. Read both.
  const message =
    (typeof body.msg === "string" && body.msg) ||
    (typeof body.error_description === "string" && body.error_description) ||
    "";
  const code = body.error_code || body.error;

  if (/captcha protection/i.test(message)) return "enforced";
  if (code === "invalid_credentials" || code === "invalid_grant") {
    return "not-enforced";
  }
  return "unknown";
}

function readFlag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * One probe. Returns the verdict plus the raw body, so an "unknown" can be
 * shown rather than described.
 */
async function probe({ url, key, captchaToken }) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: PROBE_EMAIL,
      password: PROBE_PASSWORD,
      ...(captchaToken
        ? { gotrue_meta_security: { captcha_token: captchaToken } }
        : {}),
    }),
  });
  const body = await response.json().catch(() => null);
  return { verdict: classifyCaptchaResponse(body), body, status: response.status };
}

/**
 * Probe /auth/v1/verify with a code that cannot be valid. This endpoint CHECKS
 * an existing code and never sends one, and the number is from Ofcom's reserved
 * drama range, so nothing is texted and no account can match.
 */
async function probeVerify({ url, key }) {
  const response = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: "+447700900000",
      token: "000000",
      type: "sms",
    }),
  });
  const body = await response.json().catch(() => null);
  const verdict = classifyCaptchaResponse(body);
  // "not-enforced" here means it reached the code check, which is what we want.
  return {
    verdict: verdict === "unknown" ? "not-enforced" : verdict,
    body,
    status: response.status,
  };
}

async function main() {
  loadEnvLocal();

  // Both values are public — the publishable key ships in the browser bundle.
  const url = (readFlag("url") || process.env.VITE_SUPABASE_URL || "").replace(
    /\/+$/,
    "",
  );
  const key =
    readFlag("key") ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Need a Supabase URL and publishable key. Set VITE_SUPABASE_URL and " +
        "VITE_SUPABASE_PUBLISHABLE_KEY (in .env.local or the shell), or pass " +
        "--url and --key. Both are public values.",
    );
  }

  process.stdout.write(`Checking login captcha enforcement at ${url}\n`);

  const probes = [
    { label: "invalid captcha token", captchaToken: INVALID_CAPTCHA_TOKEN },
    { label: "no captcha token", captchaToken: null },
  ];

  const results = [];
  for (const { label, captchaToken } of probes) {
    const result = await probe({ url, key, captchaToken });
    results.push({ label, ...result });
    process.stdout.write(`  ${label} — ${result.verdict} (HTTP ${result.status})\n`);
    if (result.verdict === "unknown") {
      process.stdout.write(`    ${JSON.stringify(result.body)}\n`);
    }
  }

  // Informational, and deliberately NOT part of the pass/fail verdict.
  //
  // The customer login page leaves its OTP-verify button ungated on the
  // understanding that GoTrue does not apply captcha middleware to /verify.
  // That is inferred (the SDK's captchaToken on verifyOtp is @deprecated), not
  // contracted — Supabase publishes no endpoint list. If it were wrong, a
  // customer holding a valid texted code could never get in, and that stage has
  // no widget and no resend to rescue them.
  //
  // Safe: a reserved-range UK number that can match no account, with a junk
  // code. /verify CHECKS a code, it never sends one, so this costs nothing and
  // texts nobody.
  const verifyProbe = await probeVerify({ url, key });
  process.stdout.write(
    `  /verify (informational) — ${verifyProbe.verdict} (HTTP ${verifyProbe.status})\n`,
  );
  if (verifyProbe.verdict === "enforced") {
    process.stdout.write(
      "    ^ WARNING: /verify appears to be captcha-gated after all. The customer\n" +
        "      login page's OTP code stage renders no captcha widget, so customers\n" +
        "      holding a valid SMS code cannot complete sign-in. See the comment on\n" +
        "      the code-stage submit in src/components/auth/CustomerLoginPage.jsx.\n",
    );
  }

  if (results.some((result) => result.verdict === "unknown")) {
    process.stdout.write(
      "\nUNKNOWN: a probe came back in a shape this check does not recognise.\n" +
        "Rate limiting is the usual cause — wait a minute and run it again.\n" +
        "Do not read this as either verdict.\n",
    );
    return 2;
  }

  if (results.every((result) => result.verdict === "enforced")) {
    process.stdout.write(
      "\nLogin captcha is ENFORCED: Supabase refused both an invalid token and\n" +
        "a missing one before ever reaching the password check.\n",
    );
    return 0;
  }

  process.stdout.write(
    "\nLogin captcha is NOT ENFORCED: Supabase reached the password check with\n" +
      "a bad captcha token. The Turnstile widget on the login pages is being\n" +
      "solved and then ignored — no siteverify call is made.\n" +
      "Enable CAPTCHA under Authentication -> Attack Protection. See\n" +
      "docs/superpowers/runbooks/2026-09-11-login-captcha-enablement.md\n",
  );
  return 1;
}

// Exit code carries the verdict. Deliberately NOT wired into CI: like
// check:sentry this needs the network and a live project, and asks about a
// deployed configuration rather than about the code under test.
//
// Guarded so the pure classifier above can be imported by tests without firing
// a network request, matching scripts/check-sentry-live.mjs.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(`check-captcha-live failed: ${error.message}\n`);
      process.exit(2);
    });
}
