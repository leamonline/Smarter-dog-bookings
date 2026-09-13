// Guards the decision that used to be a one-line `??` fallback to Cloudflare's
// always-passes test key. On 11 September 2026 that fallback meant any
// environment missing VITE_TURNSTILE_SITE_KEY silently rendered a captcha that
// could not fail — production included. These tests pin every branch of the
// replacement, because the failure mode is invisible: a widget that always
// passes looks exactly like a widget that works.
import { describe, expect, it } from "vitest";
import {
  resolveTurnstileConfig,
  TURNSTILE_TEST_SITE_KEY,
  isCaptchaRejection,
} from "./turnstile";

// The real "Customer Log-in Capture" widget. Public, so safe to write here.
const REAL_KEY = "0x4AAAAAADMvAmN7LsBYiIqZ";

describe("resolveTurnstileConfig", () => {
  it("uses a configured site key in production", () => {
    expect(
      resolveTurnstileConfig({ siteKey: REAL_KEY, isProduction: true }),
    ).toEqual({ siteKey: REAL_KEY, configError: null, usingTestKey: false });
  });

  it("trims whitespace around a configured key", () => {
    expect(
      resolveTurnstileConfig({ siteKey: `  ${REAL_KEY}  `, isProduction: true })
        .siteKey,
    ).toBe(REAL_KEY);
  });

  it("blocks a production build with no site key", () => {
    const config = resolveTurnstileConfig({
      siteKey: undefined,
      isProduction: true,
    });
    expect(config.siteKey).toBeNull();
    expect(config.usingTestKey).toBe(false);
    expect(config.configError).toContain("VITE_TURNSTILE_SITE_KEY");
  });

  it("treats a blank site key as missing", () => {
    // Vite hands `VITE_TURNSTILE_SITE_KEY=` through as an empty string, which
    // `??` accepted and passed straight to the widget.
    expect(
      resolveTurnstileConfig({ siteKey: "", isProduction: true }).siteKey,
    ).toBeNull();
    expect(
      resolveTurnstileConfig({ siteKey: "   ", isProduction: true }).siteKey,
    ).toBeNull();
  });

  it("blocks a production build that sets the test key explicitly", () => {
    // Otherwise the rule has a loophole that spells itself out in an env file
    // and looks deliberate.
    const config = resolveTurnstileConfig({
      siteKey: TURNSTILE_TEST_SITE_KEY,
      isProduction: true,
    });
    expect(config.siteKey).toBeNull();
    expect(config.configError).toContain("always-passes");
  });

  it("falls back to the test key in development", () => {
    expect(
      resolveTurnstileConfig({ siteKey: undefined, isProduction: false }),
    ).toEqual({
      siteKey: TURNSTILE_TEST_SITE_KEY,
      configError: null,
      usingTestKey: true,
    });
  });

  it("short-circuits on forceOffline ahead of every other rule", () => {
    // E2E runs `npm run build` — so PROD is true — with VITE_FORCE_OFFLINE=1
    // and no site key. Without this carve-out every login spec fails closed.
    expect(
      resolveTurnstileConfig({
        siteKey: undefined,
        forceOffline: true,
        isProduction: true,
      }),
    ).toEqual({
      siteKey: TURNSTILE_TEST_SITE_KEY,
      configError: null,
      usingTestKey: true,
    });
  });
});

describe("isCaptchaRejection", () => {
  // GoTrue answers a captcha-gated endpoint called without a valid token with a
  // message containing this phrase. Several surfaces need to recognise it so
  // they can say something a human can act on instead of showing the raw
  // string — but each one chooses its OWN wording, because the honest advice
  // differs. The login page can say "reload and try again"; the settings page
  // cannot, because there is no widget there and retrying will never work.
  it("recognises the GoTrue captcha rejection in both error shapes", () => {
    expect(
      isCaptchaRejection("captcha protection: request disallowed (invalid-input-response)"),
    ).toBe(true);
    expect(
      isCaptchaRejection("captcha protection: request disallowed (missing-input-response)"),
    ).toBe(true);
    expect(isCaptchaRejection("CAPTCHA PROTECTION: request disallowed")).toBe(true);
  });

  it("leaves every other auth error alone", () => {
    // Misclassifying a wrong password as a captcha problem would send a staff
    // member to fix the wrong thing entirely.
    expect(isCaptchaRejection("Invalid login credentials")).toBe(false);
    expect(isCaptchaRejection("Email rate limit exceeded")).toBe(false);
    expect(isCaptchaRejection("")).toBe(false);
  });

  it("does not throw on a non-string", () => {
    // Supabase error objects are not always shaped the way the types promise.
    expect(isCaptchaRejection(undefined)).toBe(false);
    expect(isCaptchaRejection(null)).toBe(false);
    expect(isCaptchaRejection(42 as unknown as string)).toBe(false);
  });
});
