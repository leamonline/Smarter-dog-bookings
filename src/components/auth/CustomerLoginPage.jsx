import { useState, useEffect, useRef } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { Eye, EyeOff } from "lucide-react";
import { ScribbleUnderline } from "../ui/ScribbleUnderline.jsx";
import { DogSilhouetteScatter } from "./DogSilhouetteScatter.jsx";
import { normaliseUkMobile } from "../../utils/phone.js";

// Cloudflare's published test key — always passes, no real challenge.
// Supabase accepts it as long as the project's Turnstile secret key is also
// the matching test secret (0x4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA).
const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

const OTP_RESEND_SECONDS = 60;
// Keep the format hint gentle — getting your phone number wrong is the most
// common slip on this page, and harsh copy makes a small mistake feel like
// a wall.
const PHONE_FORMAT_ERROR = "That number doesn't look quite right. Try a UK mobile starting with 07.";
const CAPTCHA_PENDING_ERROR = "Just finishing the security check — please try again in a moment.";

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

/**
 * Phone-first customer sign-in.
 *
 * Stage 1 (phone): enter mobile → onCheckPhone (NO SMS) returns whether the
 *   number is on file and whether its account has a password.
 *     • has password   → stage "password"
 *     • on file, no pw  → first login: onSendOtp() → stage "code"
 *     • not on file     → error (stays on phone stage)
 * Stage "password": phone + password → onSignInWithPassword. "Forgotten your
 *   password? Text me a code" sends an OTP for a reset.
 * Stage "code": 6-digit code → onVerifyOtp. After verify, CustomerApp shows
 *   the required set-password gate (set, or new password after a reset).
 *
 * `otpSent`/`phone` are owned by the auth hook; the password-vs-phone split is
 * local. Turnstile is rendered on both stages that make a Supabase auth call
 * (phone-send and password); its token is single-use, so we reset the widget
 * after a failed attempt.
 */
export function CustomerLoginPage({
  onCheckPhone,
  onSendOtp,
  onSignInWithPassword,
  onVerifyOtp,
  onResetOtp,
  otpSent,
  phone,
  error,
}) {
  // Phone is split into a locked +44 prefix and the local-number digits the
  // customer types. Storing only the digits keeps the field tidy and makes it
  // impossible to delete the country code.
  const [localDigits, setLocalDigits] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  // Internal stage flag for "we know this number has a password, ask for it".
  const [awaitingPassword, setAwaitingPassword] = useState(false);
  // "We don't recognise this number" → offer self-signup (Join the Pack).
  const [signupPrompt, setSignupPrompt] = useState(false);
  // Whether the OTP we sent is a forgot-password reset (forces a NEW password)
  // rather than a first-time set.
  const [otpIsReset, setOtpIsReset] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);

  const phoneInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const codeInputRef = useRef(null);
  const captchaTokenRef = useRef(null);
  const turnstileRef = useRef(null);

  // otpSent (code entry) takes precedence; then the signup offer; then the
  // password ask; else phone.
  const stage = otpSent
    ? "code"
    : signupPrompt
      ? "signup"
      : awaitingPassword
        ? "password"
        : "phone";

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
    const target =
      stage === "code"
        ? codeInputRef.current
        : stage === "password"
          ? passwordInputRef.current
          : phoneInputRef.current;
    target?.focus();
  }, [stage]);

  const resetCaptcha = () => {
    turnstileRef.current?.reset();
    captchaTokenRef.current = null;
  };

  // Stage 1: check the phone, then branch to password or OTP.
  const handlePhoneSubmit = async (e) => {
    e.preventDefault();
    if (otpCooldown > 0) {
      setLocalError(`Please wait ${otpCooldown}s before trying again.`);
      return;
    }
    // Glue the locked +44 prefix onto whatever the customer typed.
    const candidate = `+44${localDigits}`;
    const normalised = normaliseUkMobile(candidate);
    if (!normalised) {
      setLocalError(PHONE_FORMAT_ERROR);
      return;
    }
    setLocalError("");
    setSubmitting(true);
    try {
      const result = await onCheckPhone(normalised);
      if (result?.error) {
        // hook set a user-facing error (rate limit / offline)
        return;
      }
      if (!result?.on_file) {
        // Unknown number — offer to register rather than dead-ending.
        setSignupPrompt(true);
        return;
      }
      if (result.has_password) {
        // Returning customer — ask for their password (keep the captcha token
        // for the password call; the pre-flight didn't consume it).
        setAwaitingPassword(true);
        return;
      }
      // First login: text a code straight away.
      if (!captchaTokenRef.current) {
        setLocalError(CAPTCHA_PENDING_ERROR);
        return;
      }
      setOtpIsReset(false);
      const send = await onSendOtp(captchaTokenRef.current);
      if (send?.error) {
        resetCaptcha();
      } else {
        setOtpCooldown(OTP_RESEND_SECONDS);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Stage "password": returning customer signs in with their password.
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!password) {
      setLocalError("Please enter your password.");
      return;
    }
    if (!captchaTokenRef.current) {
      setLocalError(CAPTCHA_PENDING_ERROR);
      return;
    }
    setLocalError("");
    setSubmitting(true);
    try {
      const result = await onSignInWithPassword(password, captchaTokenRef.current);
      // On success the route guard redirects off this page; nothing to do.
      if (result?.error) {
        // Token is single-use — get a fresh one for the retry.
        resetCaptcha();
        setPassword("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // From the signup offer: send the first OTP to a brand-new number. The OTP
  // verify creates the auth account; CustomerApp then walks them through the
  // Join the Pack setup (password, then questions).
  const handleStartSignup = async () => {
    if (otpCooldown > 0) {
      setLocalError(`Please wait ${otpCooldown}s before trying again.`);
      return;
    }
    if (!captchaTokenRef.current) {
      setLocalError(CAPTCHA_PENDING_ERROR);
      return;
    }
    setLocalError("");
    setSubmitting(true);
    try {
      setOtpIsReset(false);
      const send = await onSendOtp(captchaTokenRef.current);
      if (send?.error) {
        resetCaptcha();
      } else {
        setOtpCooldown(OTP_RESEND_SECONDS);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // From the password stage: forgotten password → send a reset code.
  const handleForgotPassword = async () => {
    if (otpCooldown > 0) {
      setLocalError(`Please wait ${otpCooldown}s before requesting another code.`);
      return;
    }
    if (!captchaTokenRef.current) {
      setLocalError(CAPTCHA_PENDING_ERROR);
      return;
    }
    setLocalError("");
    setSubmitting(true);
    try {
      setOtpIsReset(true);
      const send = await onSendOtp(captchaTokenRef.current);
      if (send?.error) {
        resetCaptcha();
        setOtpIsReset(false);
      } else {
        setOtpCooldown(OTP_RESEND_SECONDS);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Stage "code": verify the 6-digit code.
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (code.length < 6) {
      setLocalError("Please enter the 6-digit code.");
      return;
    }
    setLocalError("");
    setSubmitting(true);
    try {
      await onVerifyOtp(code, { isReset: otpIsReset });
    } finally {
      setSubmitting(false);
    }
  };

  // Back to a clean phone-entry stage.
  const handleUseDifferentNumber = () => {
    onResetOtp();
    setAwaitingPassword(false);
    setSignupPrompt(false);
    setOtpIsReset(false);
    setPassword("");
    setCode("");
    setLocalDigits("");
    setLocalError("");
    resetCaptcha();
  };

  const errorText = localError || error;

  // Yellow CTA is reserved for non-booking primary actions across the portal;
  // green stays the booking-only colour.
  const submitButtonClass = `w-full py-3 min-h-[48px] rounded-full font-bold text-base bg-[var(--sd-yellow)] text-[var(--sd-navy)] hover:bg-[var(--sd-yellow-dark)] disabled:opacity-70 transition-colors ${focusRing}`;
  const linkButtonClass = `w-full text-sm font-semibold no-underline rounded text-[var(--sd-navy-soft)] hover:text-[var(--sd-navy)] py-2 ${focusRing}`;

  const heading =
    stage === "code"
      ? "Enter your code"
      : stage === "password"
        ? "Welcome back"
        : stage === "signup"
          ? "New here?"
          : "Sign in";

  const instruction =
    stage === "code"
      ? `We just texted a code to ${phone}. Codes expire after a few minutes.`
      : stage === "password"
        ? `Enter the password for ${phone}.`
        : stage === "signup"
          ? `We don't recognise ${phone} yet. Join the Pack and we'll get you set up.`
          : "Enter your mobile number to sign in.";

  // Shared Turnstile panel for the stages that make a Supabase auth call.
  const turnstilePanel = (
    <div className="rounded-xl border border-[rgba(45,0,75,0.08)] bg-[var(--sd-sky-tint)]/40 px-4 py-4">
      <p className="portal-text-kicker text-center mb-3">Quick security check</p>
      <div className="flex justify-center">
        <Turnstile
          ref={turnstileRef}
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={(token) => {
            captchaTokenRef.current = token;
          }}
          onExpire={() => {
            captchaTokenRef.current = null;
          }}
          onError={() => {
            captchaTokenRef.current = null;
          }}
          options={{ theme: "light", size: "normal" }}
        />
      </div>
      <p className="text-[12px] text-[var(--sd-ink-light)] text-center mt-3 leading-relaxed">
        Just confirms you&apos;re human — no clicks needed.
      </p>
    </div>
  );

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 font-['Montserrat',sans-serif]"
      style={{ background: pageBackground }}
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-elevated px-10 py-12 border border-[rgba(45,0,75,0.06)] relative overflow-hidden">
        {/* Decorative scatter of the brand dog silhouette behind the form. */}
        <DogSilhouetteScatter />

        <div className="relative">
          {/* Logo first — strongest possible "you're in the right place" signal
              for a customer landing here from a text link. */}
          <div className="flex justify-center mb-4">
            <img
              src="/logo.png"
              alt="Smarter Dog Grooming Salon"
              className="h-[72px] w-auto select-none"
              draggable={false}
            />
          </div>
          <p className="portal-text-kicker text-center mb-5" style={{ letterSpacing: "0.12em" }}>
            Customer portal
          </p>

          {/* aria-live wrapper announces the stage change to screen readers. */}
          <div aria-live="polite">
            <h1 className="font-['Quicksand','Montserrat',sans-serif] font-bold text-3xl mb-4 text-center text-[var(--sd-navy)]">
              <span className="relative inline-block">
                {heading}
                <ScribbleUnderline />
              </span>
            </h1>
            {stage === "phone" && (
              <p className="text-sm text-center text-[var(--sd-navy-soft)] mb-4 leading-relaxed">
                Book grooms, see past visits, and keep your details up to date.
              </p>
            )}
            <p id="login-instruction" className="text-sm text-center text-[var(--sd-ink-light)] mb-8 leading-relaxed">
              {instruction}
            </p>
          </div>

          {/* Error region is always present in the DOM so role=alert + aria-live
              announce reliably. Visually empty when there's no error. */}
          <div
            role="alert"
            aria-live="assertive"
            className={errorText ? "portal-alert portal-alert--error mb-6" : "sr-only"}
          >
            {errorText}
          </div>

          {stage === "phone" && (
            <form onSubmit={handlePhoneSubmit} className="space-y-6" noValidate>
              <div>
                <label htmlFor="phone" className="block text-sm font-bold mb-2 text-[var(--sd-navy)]">
                  Mobile number
                </label>
                {/* Locked +44 prefix on the left, digits-only input on the right. */}
                <div className="flex items-stretch rounded-xl border-[1.5px] border-[rgba(45,0,75,0.14)] focus-within:border-[var(--sd-navy)] focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-[var(--sd-navy)] overflow-hidden bg-white">
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center justify-center px-4 min-h-[52px] text-base font-bold border-r border-[rgba(45,0,75,0.14)] select-none text-[var(--sd-navy)]"
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
                      // Accept only digits, strip a leading 0, cap at 10 digits.
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
                    aria-invalid={Boolean(errorText)}
                    aria-describedby="login-instruction"
                    className="flex-1 px-4 py-3 min-h-[52px] focus:outline-none text-base bg-transparent text-[var(--sd-navy)]"
                  />
                </div>
              </div>

              {turnstilePanel}

              <button
                type="submit"
                disabled={submitting || otpCooldown > 0}
                aria-busy={submitting}
                className={submitButtonClass}
                style={{ boxShadow: "var(--shadow-sd-cta-yellow)" }}
              >
                {submitting
                  ? "Checking…"
                  : otpCooldown > 0
                    ? `Try again in ${otpCooldown}s`
                    : "Continue"}
              </button>
            </form>
          )}

          {stage === "signup" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleStartSignup();
              }}
              className="space-y-6"
            >
              {turnstilePanel}

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
                    : "Join the Pack — text me a code"}
              </button>

              <button type="button" onClick={handleUseDifferentNumber} className={linkButtonClass}>
                Use a different number
              </button>
            </form>
          )}

          {stage === "password" && (
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              {/* Hidden username anchor carrying the E.164 phone. The customer
                  already typed their number in stage 1, so this stays visually
                  hidden (sr-only — clip-based, still in the DOM), but it gives
                  the password manager a username matching the saved credential
                  so it can autofill the password here. Kept off the stage-1
                  tel field on purpose: filling E.164 into that 10-digit-only
                  input would trip its pattern. */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={phone ?? ""}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
              />
              <div>
                <label htmlFor="password" className="block text-sm font-bold mb-2 text-[var(--sd-navy)]">
                  Password
                </label>
                <div className="relative">
                  <input
                    ref={passwordInputRef}
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setLocalError("");
                    }}
                    placeholder="Your password"
                    aria-invalid={Boolean(errorText)}
                    aria-describedby="login-instruction"
                    className={`portal-input text-base min-h-[52px] pr-11 ${focusRing}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sd-navy-soft)] hover:text-[var(--sd-navy)] bg-transparent border-none cursor-pointer p-1"
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {turnstilePanel}

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className={submitButtonClass}
                style={{ boxShadow: "var(--shadow-sd-cta-yellow)" }}
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>

              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={submitting || otpCooldown > 0}
                className={linkButtonClass}
              >
                {otpCooldown > 0
                  ? `Try again in ${otpCooldown}s`
                  : "Forgotten your password? Text me a code"}
              </button>
              <button type="button" onClick={handleUseDifferentNumber} className={linkButtonClass}>
                Use a different number
              </button>
            </form>
          )}

          {stage === "code" && (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div>
                <label htmlFor="code" className="block text-sm font-bold mb-2 text-[var(--sd-navy)]">
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
                  aria-invalid={Boolean(errorText)}
                  aria-describedby="login-instruction"
                  className={`portal-input text-base tracking-widest text-center min-h-[52px] ${focusRing}`}
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
              <button type="button" onClick={handleUseDifferentNumber} className={linkButtonClass}>
                Use a different number
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Back link sits beneath the card as an exit ramp. */}
      <a
        href="https://smarterdog.co.uk"
        className={`group mt-5 text-sm font-semibold no-underline rounded inline-flex items-center gap-1 text-[var(--sd-navy-soft)] hover:text-[var(--sd-navy)] ${focusRing}`}
      >
        <span aria-hidden="true" className="transition-transform group-hover:-translate-x-1">←</span>
        Back to Smarter Dog website
      </a>
    </div>
  );
}
