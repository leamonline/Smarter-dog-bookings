// Which Turnstile site key does this build render, and is this deploy
// misconfigured?
//
// Until 11 September 2026 the answer was a one-line fallback to Cloudflare's
// published test key, which always passes. Any environment missing
// VITE_TURNSTILE_SITE_KEY therefore showed visitors a security check that
// could not fail — and said nothing about it. That is worse than no captcha,
// because the widget invites the assumption of safety.
//
// The shape here deliberately mirrors `supabaseConfigError` in
// src/supabase/client.ts: resolve, expose a configError, fail closed in a
// production build, degrade to something usable in development.
import { logger } from "./logger";

/**
 * Cloudflare's published test site key. It always passes, and mints tokens
 * that no real secret key can verify. A development convenience only — never
 * a production fallback.
 */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

/**
 * Shown when the visitor submits before the widget has produced a token.
 * Lives here so the staff and customer pages say exactly the same thing.
 */
export const CAPTCHA_PENDING_ERROR =
  "Just finishing the security check — please try again in a moment.";

/**
 * Does this auth error mean GoTrue refused the call for a captcha reason?
 *
 * When CAPTCHA protection is on, a captcha-gated endpoint called without a
 * valid token answers with a message containing "captcha protection: request
 * disallowed (...)". That string is accurate and completely useless to the
 * person reading it.
 *
 * This only RECOGNISES the condition; it deliberately does not supply the
 * replacement copy, because the honest advice differs by surface. A login page
 * can fairly say "reload and try again" — it has a widget that might mint a
 * fresh token. A settings page with no widget cannot say that without lying.
 */
export function isCaptchaRejection(message?: string | null): boolean {
  return typeof message === "string" && /captcha protection/i.test(message);
}

export interface TurnstileEnvironment {
  siteKey?: string | null;
  forceOffline?: boolean;
  isProduction?: boolean;
}

export interface TurnstileConfig {
  /** The site key to render, or null when the deploy is misconfigured. */
  siteKey: string | null;
  /** Why sign-in is blocked, or null when all is well. */
  configError: string | null;
  /** True when the always-passes test key is in use. */
  usingTestKey: boolean;
}

const MISSING_KEY_ERROR = "Missing VITE_TURNSTILE_SITE_KEY";
const TEST_KEY_IN_PRODUCTION_ERROR =
  "VITE_TURNSTILE_SITE_KEY is set to Cloudflare's always-passes test key";

export function resolveTurnstileConfig({
  siteKey,
  forceOffline = false,
  isProduction = false,
}: TurnstileEnvironment): TurnstileConfig {
  // Offline/sample-data mode short-circuits everything: there is no Supabase
  // client, so there is no auth call for a captcha to protect. This must come
  // first — E2E builds are production builds (`npm run build`) carrying
  // VITE_FORCE_OFFLINE=1 and no site key, so without it every login spec
  // would fail closed. src/supabase/client.ts short-circuits identically.
  if (forceOffline) {
    return {
      siteKey: TURNSTILE_TEST_SITE_KEY,
      configError: null,
      usingTestKey: true,
    };
  }

  // Blank counts as absent: `VITE_TURNSTILE_SITE_KEY=` arrives as an empty
  // string, which the old `??` accepted and handed to the widget.
  const configured = typeof siteKey === "string" ? siteKey.trim() : "";

  if (configured && configured !== TURNSTILE_TEST_SITE_KEY) {
    return { siteKey: configured, configError: null, usingTestKey: false };
  }

  // Either nothing is set, or the test key is set explicitly. In production
  // both mean the same thing — no real challenge — so both fail closed.
  if (isProduction) {
    return {
      siteKey: null,
      configError: configured ? TEST_KEY_IN_PRODUCTION_ERROR : MISSING_KEY_ERROR,
      usingTestKey: false,
    };
  }

  return {
    siteKey: TURNSTILE_TEST_SITE_KEY,
    configError: null,
    usingTestKey: true,
  };
}

const forceOffline = import.meta.env.VITE_FORCE_OFFLINE === "1";

export const turnstileConfig = resolveTurnstileConfig({
  siteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
  forceOffline,
  isProduction: import.meta.env.PROD,
});

if (turnstileConfig.configError) {
  // logger.error forwards to Sentry, live in production since 28 August 2026.
  // This is where the actionable detail goes; the on-screen copy stays calm
  // and free of variable names.
  logger.error(
    `[Smarter Dog] ${turnstileConfig.configError}. Sign-in is blocked until a real ` +
      "Turnstile site key is set on the host (Vercel) and the app is redeployed.",
  );
} else if (turnstileConfig.usingTestKey && !forceOffline) {
  logger.warn(
    "Turnstile is using Cloudflare's always-passes test key — this challenge " +
      "cannot fail. Set VITE_TURNSTILE_SITE_KEY in .env.local to exercise the " +
      "real widget. A production build without it blocks sign-in instead.",
  );
}
