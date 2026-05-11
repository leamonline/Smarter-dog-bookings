import { useState, useEffect, useRef } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { normaliseUkMobile } from "../../utils/phone.js";

// Cloudflare's published test key — always passes, no real challenge.
// Supabase accepts it as long as the project's Turnstile secret key is also
// the matching test secret (0x4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA).
const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

const OTP_RESEND_SECONDS = 60;
const PHONE_FORMAT_ERROR = "Please enter a valid UK mobile number, for example 07700 900123.";

// Mirrors the smarterdog.co.uk brand palette so the customer portal login
// reads as the same site to a returning customer.
const websiteColors = {
  plum: "#2D004B",
  teal: "#2A6F6B",
  warmBeige: "#FDFBF7",
  green: "#00D94A",
};

const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#2A6F6B]";

export function CustomerLoginPage({ onRequestOtp, onVerifyOtp, onResetOtp, otpSent, phone, error }) {
  // Phone is split into a locked +44 prefix and the local-number digits
  // the customer types. Storing only the digits keeps the field tidy
  // and makes it impossible to delete the country code.
  const [localDigits, setLocalDigits] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);

  const phoneInputRef = useRef(null);
  const codeInputRef = useRef(null);
  const captchaTokenRef = useRef(null);
  const turnstileRef = useRef(null);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  useEffect(() => {
    const target = otpSent ? codeInputRef.current : phoneInputRef.current;
    target?.focus();
  }, [otpSent]);

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (otpCooldown > 0) {
      setLocalError(`Please wait ${otpCooldown}s before requesting another code.`);
      return;
    }
    // Glue the locked +44 prefix onto whatever the customer typed.
    // normaliseUkMobile handles spaces / leading-zero strip / validation.
    const candidate = `+44${localDigits}`;
    const normalised = normaliseUkMobile(candidate);
    if (!normalised) {
      setLocalError(PHONE_FORMAT_ERROR);
      return;
    }
    setLocalError("");
    setSubmitting(true);
    try {
      const result = await onRequestOtp(normalised, captchaTokenRef.current);
      if (!result?.error) {
        setOtpCooldown(OTP_RESEND_SECONDS);
      } else {
        // Reset widget so a fresh token is available for the next attempt
        turnstileRef.current?.reset();
        captchaTokenRef.current = null;
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (code.length < 6) {
      setLocalError("Please enter the 6-digit code.");
      return;
    }
    setLocalError("");
    setSubmitting(true);
    try {
      await onVerifyOtp(code);
    } finally {
      setSubmitting(false);
    }
  };

  const errorText = localError || error;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 font-['Montserrat',sans-serif]"
      style={{ backgroundColor: websiteColors.warmBeige }}
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg p-8">
        <div className="text-center mb-6">
          <a
            href="https://smarterdog.co.uk"
            className={`text-sm font-medium underline rounded ${focusRing}`}
            style={{ color: websiteColors.teal }}
          >
            <span aria-hidden="true">← </span>
            Back to smarterdog.co.uk
          </a>
        </div>

        {/* aria-live wrapper announces the stage change (heading + instruction)
            to screen readers when otpSent flips. */}
        <div aria-live="polite">
          <h1
            className="font-display font-bold text-3xl mb-2 text-center"
            style={{ color: websiteColors.teal, letterSpacing: "0.02em" }}
          >
            {!otpSent ? "Sign in to your account" : "Enter your code"}
          </h1>
          <p id="login-instruction" className="text-sm text-center text-gray-600 mb-6">
            {!otpSent
              ? "Pop in your mobile number — we'll text you a 6-digit code."
              : `We just texted a code to ${phone}. Codes expire after a few minutes.`}
          </p>
        </div>

        {/* Error region is always present in the DOM so role=alert + aria-live
            announce reliably across SR/browser combos. Visually empty when
            there's no error. */}
        <div
          role="alert"
          aria-live="assertive"
          className={
            errorText
              ? "mb-5 p-3 rounded-lg bg-red-50 text-red-700 text-sm"
              : "sr-only"
          }
        >
          {errorText}
        </div>

        {!otpSent ? (
          <form onSubmit={handleRequestOtp} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-bold mb-1"
                style={{ color: websiteColors.teal }}
              >
                Mobile number
              </label>
              {/* Locked +44 prefix on the left, digits-only input on the
                  right. The bordered wrapper shows the focus ring so the
                  field reads as one control. */}
              <div className="flex items-stretch rounded-xl border-2 border-gray-200 focus-within:border-[#2A6F6B] focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-[#2A6F6B] overflow-hidden bg-white">
                <span
                  aria-hidden="true"
                  className="inline-flex items-center justify-center px-3 min-h-[48px] bg-gray-50 text-base font-bold border-r border-gray-200 select-none"
                  style={{ color: websiteColors.teal }}
                >
                  +44
                </span>
                <input
                  ref={phoneInputRef}
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  required
                  value={localDigits}
                  onChange={(e) => {
                    // Accept only digits, strip a leading 0 (UK mobile
                    // typed in 07… form), cap at 10 digits.
                    const digits = e.target.value
                      .replace(/\D/g, "")
                      .replace(/^0+/, "")
                      .slice(0, 10);
                    setLocalDigits(digits);
                    setLocalError("");
                  }}
                  placeholder="7700 900123"
                  pattern="7[0-9]{9}"
                  title={PHONE_FORMAT_ERROR}
                  aria-invalid={!otpSent && Boolean(errorText)}
                  aria-describedby="login-instruction"
                  className="flex-1 px-3 py-3 min-h-[48px] focus:outline-none text-base bg-transparent"
                />
              </div>
            </div>
            <Turnstile
              ref={turnstileRef}
              siteKey={TURNSTILE_SITE_KEY}
              onSuccess={(token) => { captchaTokenRef.current = token; }}
              onExpire={() => { captchaTokenRef.current = null; }}
              onError={() => { captchaTokenRef.current = null; }}
              options={{ theme: "light", size: "normal" }}
            />
            <button
              type="submit"
              disabled={submitting || otpCooldown > 0}
              aria-busy={submitting}
              className={`w-full py-3 min-h-[48px] rounded-full font-bold text-base disabled:opacity-70 ${focusRing}`}
              style={{ backgroundColor: websiteColors.green, color: websiteColors.plum }}
            >
              {submitting
                ? "Sending…"
                : otpCooldown > 0
                  ? `Try again in ${otpCooldown}s`
                  : "Text me a code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label
                htmlFor="code"
                className="block text-sm font-bold mb-1"
                style={{ color: websiteColors.teal }}
              >
                6-digit code
              </label>
              <input
                ref={codeInputRef}
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                  setLocalError("");
                }}
                placeholder="123456"
                aria-invalid={otpSent && Boolean(errorText)}
                aria-describedby="login-instruction"
                className={`w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-200 focus:border-[#2A6F6B] text-base tracking-widest text-center ${focusRing}`}
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className={`w-full py-3 min-h-[48px] rounded-full font-bold text-base disabled:opacity-70 ${focusRing}`}
              style={{ backgroundColor: websiteColors.green, color: websiteColors.plum }}
            >
              {submitting ? "Checking…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={onResetOtp}
              className={`w-full text-sm font-medium underline rounded ${focusRing}`}
              style={{ color: websiteColors.teal }}
            >
              Use a different number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
