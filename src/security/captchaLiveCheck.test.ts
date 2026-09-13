// Guards scripts/check-captcha-live.mjs — the check that answers "is the login
// captcha actually enforced on this project?".
//
// The question matters because nothing in the app can tell you. The Turnstile
// widget issues a challenge, the visitor solves it, and the token goes to
// Supabase as options.captchaToken — which Supabase ignores unless CAPTCHA
// protection is enabled under Authentication -> Attack Protection. On
// 11 September 2026 it was not: Cloudflare reported 0 siteverify requests
// against 5 solved challenges, and a probe of the production token endpoint
// reached the password check both with an invalid token and with none at all.
//
// The verdict is three-state on purpose. Guessing is what produced the
// original problem, so an unrecognised response says so rather than picking
// the reassuring answer.
import { describe, expect, it } from "vitest";
import { classifyCaptchaResponse } from "../../scripts/check-captcha-live.mjs";

describe("classifyCaptchaResponse", () => {
  it("reads a captcha rejection as enforced", () => {
    expect(
      classifyCaptchaResponse({
        code: 400,
        error_code: "validation_failed",
        msg: "captcha protection: request disallowed (invalid-input-response)",
      }),
    ).toBe("enforced");
    expect(
      classifyCaptchaResponse({
        code: 400,
        error_code: "validation_failed",
        msg: "captcha protection: request disallowed (missing-input-response)",
      }),
    ).toBe("enforced");
  });

  it("reads a password rejection as not enforced", () => {
    // Verbatim from the production probe on 11 September 2026. Reaching the
    // password check at all means the captcha was never consulted.
    expect(
      classifyCaptchaResponse({
        code: 400,
        error_code: "invalid_credentials",
        msg: "Invalid login credentials",
      }),
    ).toBe("not-enforced");
  });

  it("understands the older GoTrue error shape too", () => {
    // Older releases answer with error/error_description rather than
    // error_code/msg. A project on either shape must classify the same.
    expect(
      classifyCaptchaResponse({
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      }),
    ).toBe("not-enforced");
    expect(
      classifyCaptchaResponse({
        error: "validation_failed",
        error_description: "captcha protection: request disallowed",
      }),
    ).toBe("enforced");
  });

  it("says unknown rather than guessing", () => {
    // Saying "enforced" on no evidence is the one answer that would let the
    // unverified state persist unnoticed — the exact failure being fixed.
    expect(classifyCaptchaResponse({})).toBe("unknown");
    expect(classifyCaptchaResponse(null)).toBe("unknown");
    expect(classifyCaptchaResponse("rate limited")).toBe("unknown");
    expect(
      classifyCaptchaResponse({ error_code: "over_request_rate_limit" }),
    ).toBe("unknown");
  });
});
