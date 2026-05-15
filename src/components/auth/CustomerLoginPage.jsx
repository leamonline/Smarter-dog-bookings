import { useState, useEffect, useRef } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { ScribbleUnderline } from "../ui/ScribbleUnderline.jsx";
import { normaliseUkMobile } from "../../utils/phone.js";

// Cloudflare's published test key — always passes, no real challenge.
// Supabase accepts it as long as the project's Turnstile secret key is also
// the matching test secret (0x4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA).
const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

const OTP_RESEND_SECONDS = 60;
const PHONE_FORMAT_ERROR = "Please enter a valid UK mobile number, for example 07700 900123.";

// Focus ring driven by token, not a bespoke colour. Used on every interactive
// control on the page so keyboard navigation reads as one consistent thing.
const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--sd-navy)]";

// Page background mirrors the customer dashboard — same sky + buttercup
// radial gradients on paper, so signing in feels like it's already inside the
// portal rather than a separate teal-themed app.
const pageBackground =
  "radial-gradient(900px 280px at 12% -80px, rgba(16, 194, 252, 0.15), transparent 70%), " +
  "radial-gradient(800px 240px at 100% 0%, rgba(254, 204, 19, 0.13), transparent 65%), " +
  "var(--sd-paper)";

// Decorative scatter of the brand's dog silhouette across the card. Each is
// placed deterministically (so the layout doesn't shift between renders) but
// chosen to feel random — varying size, rotation, colour, and opacity.
// Recolouring is done with CSS mask-image: the PNG becomes a stencil and the
// background-color paints through it.
const SILHOUETTE_SCATTER = [
  { top: "-4%",  left: "-6%",  size: 130, rot: -18, color: "var(--sd-navy)",      opacity: 0.07 },
  { top: "12%",  left: "82%",  size: 70,  rot:  22, color: "var(--sd-yellow)",    opacity: 0.18 },
  { top: "30%",  left: "-8%",  size: 90,  rot:  12, color: "var(--sd-cyan-dark)", opacity: 0.07 },
  { top: "44%",  left: "88%",  size: 50,  rot: -28, color: "var(--sd-coral)",     opacity: 0.12 },
  { top: "58%",  left: "8%",   size: 60,  rot:  35, color: "var(--sd-yellow-dark)", opacity: 0.10 },
  { top: "70%",  left: "70%",  size: 110, rot:  -8, color: "var(--sd-navy-soft)", opacity: 0.06 },
  { top: "88%",  left: "18%",  size: 75,  rot:  18, color: "var(--sd-cyan-dark)", opacity: 0.09 },
  { top: "92%",  left: "82%",  size: 55,  rot: -14, color: "var(--sd-yellow)",    opacity: 0.13 },
];

const SILHOUETTE_URL = "/images/dog-silhouette.png";

function DogSilhouetteScatter() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {SILHOUETTE_SCATTER.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            transform: `rotate(${s.rot}deg)`,
            opacity: s.opacity,
            backgroundColor: s.color,
            WebkitMaskImage: `url(${SILHOUETTE_URL})`,
            maskImage: `url(${SILHOUETTE_URL})`,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskPosition: "center",
            maskPosition: "center",
          }}
        />
      ))}
    </div>
  );
}

export function CustomerLoginPage({ onRequestOtp, onVerifyOtp, onResetOtp, otpSent, phone, error }) {
  // Phone is split into a locked +44 prefix and the local-number digits the
  // customer types. Storing only the digits keeps the field tidy and makes it
  // impossible to delete the country code.
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

  // Yellow CTA is reserved for non-booking primary actions across the portal;
  // green stays the booking-only colour. "Text me a code" / "Sign in" are not
  // bookings, so they use yellow.
  const submitButtonClass = `w-full py-3 min-h-[48px] rounded-full font-bold text-base bg-[var(--sd-yellow)] text-[var(--sd-navy)] hover:bg-[var(--sd-yellow-dark)] disabled:opacity-70 transition-colors ${focusRing}`;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 font-['Montserrat',sans-serif]"
      style={{ background: pageBackground }}
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-elevated p-8 border border-[rgba(45,0,75,0.06)] relative overflow-hidden">
        {/* Decorative scatter of the brand dog silhouette behind the form. */}
        <DogSilhouetteScatter />

        <div className="relative">
          <div className="text-center mb-6">
            <a
              href="https://smarterdog.co.uk"
              className={`group text-sm font-semibold no-underline rounded inline-flex items-center gap-1 text-[var(--sd-navy-soft)] hover:text-[var(--sd-navy)] ${focusRing}`}
            >
              <span aria-hidden="true" className="transition-transform group-hover:-translate-x-1">←</span>
              Back to smarterdog.co.uk
            </a>
          </div>

          {/* aria-live wrapper announces the stage change (heading + instruction)
              to screen readers when otpSent flips. */}
          <div aria-live="polite">
            <h1 className="font-['Quicksand','Montserrat',sans-serif] font-bold text-3xl mb-2 text-center text-[var(--sd-navy)]">
              <span className="relative inline-block">
                {!otpSent ? "Sign in" : "Enter your code"}
                <ScribbleUnderline />
              </span>
            </h1>
            <p id="login-instruction" className="text-sm text-center text-[var(--sd-ink-light)] mb-6">
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
            className={errorText ? "portal-alert portal-alert--error mb-5" : "sr-only"}
          >
            {errorText}
          </div>

          {!otpSent ? (
            <form onSubmit={handleRequestOtp} className="space-y-4" noValidate>
              <div>
                <label htmlFor="phone" className="block text-sm font-bold mb-1 text-[var(--sd-navy)]">
                  Mobile number
                </label>
                {/* Locked +44 prefix on the left, digits-only input on the right.
                    The bordered wrapper shows the focus ring so the field reads
                    as one control. */}
                <div className={`flex items-stretch rounded-xl border-[1.5px] border-[rgba(45,0,75,0.14)] focus-within:border-[var(--sd-navy)] focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-[var(--sd-navy)] overflow-hidden bg-white`}>
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center justify-center px-3 min-h-[48px] text-base font-bold border-r border-[rgba(45,0,75,0.14)] select-none text-[var(--sd-navy)]"
                    style={{ background: "var(--sd-buttercup-tint)" }}
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
                      // Accept only digits, strip a leading 0 (UK mobile typed
                      // in 07… form), cap at 10 digits.
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
                    className="flex-1 px-3 py-3 min-h-[48px] focus:outline-none text-base bg-transparent text-[var(--sd-navy)]"
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
                className={submitButtonClass}
                style={{ boxShadow: "var(--shadow-sd-cta-yellow)" }}
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
                <label htmlFor="code" className="block text-sm font-bold mb-1 text-[var(--sd-navy)]">
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
                  className={`portal-input text-base tracking-widest text-center min-h-[48px] ${focusRing}`}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className={submitButtonClass}
                style={{ boxShadow: "var(--shadow-sd-cta-yellow)" }}
              >
                {submitting ? "Checking…" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={onResetOtp}
                className={`w-full text-sm font-semibold no-underline rounded text-[var(--sd-navy-soft)] hover:text-[var(--sd-navy)] py-1 ${focusRing}`}
              >
                Use a different number
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
