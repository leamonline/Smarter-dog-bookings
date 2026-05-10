import { useState, useEffect } from "react";
import { normaliseUkMobile } from "../../utils/phone.js";

const OTP_RESEND_SECONDS = 60;
const PHONE_FORMAT_ERROR = "Please enter your number in +44xxxxxxxxxx format, for example +447700900123.";

// Mirrors the smarterdog.co.uk brand palette so the customer portal login
// reads as the same site to a returning customer.
const websiteColors = {
  plum: "#2D004B",
  teal: "#2A6F6B",
  warmBeige: "#FDFBF7",
  green: "#00D94A",
};

export function CustomerLoginPage({ onRequestOtp, onVerifyOtp, onResetOtp, otpSent, phone, error }) {
  const [phoneInput, setPhoneInput] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);

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

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (otpCooldown > 0) {
      setLocalError(`Please wait ${otpCooldown}s before requesting another code.`);
      return;
    }
    const normalised = normaliseUkMobile(phoneInput);
    if (!normalised) {
      setLocalError(PHONE_FORMAT_ERROR);
      return;
    }
    setLocalError("");
    setSubmitting(true);
    try {
      const result = await onRequestOtp(normalised);
      if (!result?.error) setOtpCooldown(OTP_RESEND_SECONDS);
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
            className="text-sm font-medium"
            style={{ color: websiteColors.teal }}
          >
            ← Back to smarterdog.co.uk
          </a>
        </div>
        <h1
          className="font-display font-bold text-3xl mb-2 text-center"
          style={{ color: websiteColors.teal, letterSpacing: "0.02em" }}
        >
          {!otpSent ? "Sign in to your account" : "Enter your code"}
        </h1>
        <p className="text-sm text-center text-gray-600 mb-6">
          {!otpSent
            ? "Pop in your mobile number — we'll text you a 6-digit code."
            : `We just texted a code to ${phone}. Codes expire after a few minutes.`}
        </p>

        {errorText && (
          <div className="mb-5 p-3 rounded-lg bg-red-50 text-red-600 text-sm" role="alert">
            {errorText}
          </div>
        )}

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
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={phoneInput}
                onChange={(e) => {
                  setPhoneInput(e.target.value);
                  setLocalError("");
                }}
                placeholder="+447700900123"
                pattern="\+447[0-9]{9}"
                title={PHONE_FORMAT_ERROR}
                aria-invalid={Boolean(errorText)}
                className="w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none text-base"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={submitting || otpCooldown > 0}
              className="w-full py-3 min-h-[48px] rounded-full font-bold text-base disabled:opacity-70"
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
                className="w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none text-base tracking-widest text-center"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 min-h-[48px] rounded-full font-bold text-base disabled:opacity-70"
              style={{ backgroundColor: websiteColors.green, color: websiteColors.plum }}
            >
              {submitting ? "Checking…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={onResetOtp}
              className="w-full text-sm font-medium underline"
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
