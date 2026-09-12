import { useRef, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { useStaffAuthActions } from "../../supabase/hooks/useStaffAuthActions";
import { ScribbleUnderline } from "../ui/ScribbleUnderline.jsx";
import { DogSilhouetteScatter } from "./DogSilhouetteScatter.jsx";
import { turnstileConfig, CAPTCHA_PENDING_ERROR } from "../../lib/turnstile";

// Page background + silhouette scatter are intentionally kept in sync with
// CustomerLoginPage.jsx so the customer and staff entry points read as one
// brand surface. If you tweak the decoration here, mirror it there.
const pageBackground =
  "radial-gradient(900px 280px at 12% -80px, rgba(16, 194, 252, 0.15), transparent 70%), " +
  "radial-gradient(800px 240px at 100% 0%, rgba(254, 204, 19, 0.13), transparent 65%), " +
  "var(--sd-paper)";

const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--sd-navy)]";

const kickerClass =
  "font-bold text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-light)]";

// Tailwind stand-ins for portal-input / portal-alert--error from
// customer-portal.css, which isn't loaded on the staff app.
const fieldInputClass =
  "w-full px-4 py-3 min-h-[46px] sm:min-h-[52px] rounded-xl border-[1.5px] border-[rgba(45,0,75,0.14)] bg-white " +
  "text-base text-[var(--sd-navy)] placeholder:text-slate-500 placeholder:font-medium " +
  "outline-none transition-colors focus:border-[var(--sd-navy)] " + focusRing;

const alertErrorClass =
  "flex items-start gap-2.5 px-3.5 py-3 rounded-xl font-semibold text-body leading-[1.45] " +
  "bg-[var(--sd-coral-tint)] text-brand-coral-text border border-[rgba(231,84,108,0.30)]";

// Yellow CTA matches the customer portal — primary, non-booking action.
const submitButtonClass =
  "w-full py-3 min-h-[48px] rounded-full font-bold text-base bg-[var(--sd-yellow)] text-[var(--sd-navy)] " +
  "hover:bg-[var(--sd-yellow-dark)] disabled:opacity-70 transition-colors " + focusRing;

const linkButtonClass =
  "w-full text-sm font-semibold rounded text-[var(--sd-navy-soft)] hover:text-[var(--sd-navy)] py-2 " +
  "bg-transparent border-none cursor-pointer " + focusRing;

function PortalShell({ children }) {
  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-4 py-3 sm:py-12 font-['Montserrat',sans-serif]"
      style={{ background: pageBackground }}
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-elevated px-6 py-4 sm:px-10 sm:py-12 border border-[rgba(45,0,75,0.06)] relative overflow-hidden">
        <DogSilhouetteScatter mobileSparse />
        <div className="relative">
          <div className="flex justify-center mb-2 sm:mb-4">
            <img
              src="/logo.png"
              alt="Smarter Dog Grooming Salon"
              className="h-10 sm:h-[72px] w-auto select-none"
              draggable={false}
            />
          </div>
          <p className={`${kickerClass} text-center mb-1 sm:mb-5`} style={{ letterSpacing: "0.12em" }}>
            Staff portal
          </p>
          {children}
        </div>
      </div>
      <a
        href="https://smarterdog.co.uk"
        className={`group mt-3 sm:mt-5 text-sm font-semibold no-underline rounded inline-flex items-center gap-1 text-[var(--sd-navy-soft)] hover:text-[var(--sd-navy)] ${focusRing}`}
      >
        <span aria-hidden="true" className="transition-transform group-hover:-translate-x-1">←</span>
        Back to Smarter Dog website
      </a>
    </div>
  );
}

/**
 * Stands in for the security check when the deploy carries no Turnstile site
 * key. Sign-in is blocked rather than quietly allowed through: a captcha that
 * always passes is worse than none, because it invites the assumption of
 * safety. The actionable detail — which variable is missing — goes to Sentry
 * from src/lib/turnstile.ts, not onto a staff member's screen.
 */
function CaptchaUnavailable() {
  return (
    <div role="alert" className="text-center">
      <p className="text-sm font-bold text-[var(--sd-navy)] mb-1">
        Sign-in is unavailable right now
      </p>
      <p className="text-xs text-[var(--sd-ink-light)] leading-relaxed">
        The security check can&apos;t load, so we can&apos;t sign anyone in
        until it&apos;s sorted. Please try again shortly.
      </p>
    </div>
  );
}

/**
 * Staff login page — sign-in only.
 * New staff accounts must be created by an owner directly in Supabase
 * Auth (or via an invite flow). Public self-registration is intentionally
 * removed to prevent unauthorised users from gaining dashboard access.
 */
export function LoginPage({ onSignIn, error, isOffline }) {
  const authActions = useStaffAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState("");

  // Null only when the deploy is misconfigured; src/lib/turnstile.ts has
  // already reported it to Sentry by the time we render.
  const captchaUnavailable = turnstileConfig.configError !== null;

  const signInCaptchaRef = useRef(null);
  const signInTurnstileRef = useRef(null);
  const resetCaptchaRef = useRef(null);
  const resetTurnstileRef = useRef(null);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setResetError("We need your email to send the reset link.");
      return;
    }
    // With Supabase CAPTCHA protection on, sending without a token gets a raw
    // "captcha protection: request disallowed" back. Catch it here instead,
    // and send the token unconditionally now that we know we have one.
    if (!resetCaptchaRef.current) {
      setResetError(CAPTCHA_PENDING_ERROR);
      return;
    }
    setResetSending(true);
    setResetError("");
    const { error: err } = await authActions.requestPasswordReset(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken: resetCaptchaRef.current,
    });
    setResetSending(false);
    if (err) {
      resetTurnstileRef.current?.reset();
      resetCaptchaRef.current = null;
      setResetError(err.message);
      return;
    }
    setResetSent(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setLocalError("We need both your email and password.");
      return;
    }
    if (!signInCaptchaRef.current) {
      setLocalError(CAPTCHA_PENDING_ERROR);
      return;
    }
    setLocalError("");
    setSubmitting(true);
    try {
      const result = await onSignIn(email.trim(), password, signInCaptchaRef.current);
      if (result?.error) {
        signInTurnstileRef.current?.reset();
        signInCaptchaRef.current = null;
        setSubmitting(false);
      }
    } catch {
      signInTurnstileRef.current?.reset();
      signInCaptchaRef.current = null;
      setSubmitting(false);
    }
  };

  if (isOffline) {
    return (
      <PortalShell>
        <h1 className="font-['Quicksand','Montserrat',sans-serif] font-bold text-2xl sm:text-3xl mb-2 sm:mb-4 text-center text-[var(--sd-navy)]">
          <span className="relative inline-block">
            Sample data
            <ScribbleUnderline />
          </span>
        </h1>
        <p className="text-sm text-center text-[var(--sd-ink-light)] leading-relaxed">
          Supabase isn't set up yet, so you're seeing sample data. No authentication right now.
        </p>
      </PortalShell>
    );
  }

  const errorText = localError || error;

  // Sign-in (default) view
  if (!forgotMode) {
    return (
      <PortalShell>
        <div aria-live="polite">
          <h1 className="font-['Quicksand','Montserrat',sans-serif] font-bold text-2xl sm:text-3xl mb-2 sm:mb-4 text-center text-[var(--sd-navy)]">
            <span className="relative inline-block">
              Hello again
              <ScribbleUnderline />
            </span>
          </h1>
          <p className="text-sm text-center text-[var(--sd-ink-light)] mb-3 sm:mb-8 leading-relaxed hidden sm:block">
            Sign in to get started.
          </p>
        </div>

        <div
          role="alert"
          aria-live="assertive"
          className={errorText ? `${alertErrorClass} mb-6` : "sr-only"}
        >
          {errorText}
        </div>

        <form onSubmit={handleSubmit} className="space-y-2.5 sm:space-y-6">
          <div>
            <label htmlFor="staff-email" className="block text-sm font-bold mb-1 sm:mb-2 text-[var(--sd-navy)]">
              Email
            </label>
            <input
              id="staff-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setLocalError(""); }}
              placeholder="you@smarterdog.co.uk"
              className={fieldInputClass}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="staff-password" className="block text-sm font-bold mb-1 sm:mb-2 text-[var(--sd-navy)]">
              Password
            </label>
            <input
              id="staff-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setLocalError(""); }}
              placeholder="Your password"
              className={fieldInputClass}
            />
          </div>

          <div className="rounded-xl border border-transparent sm:border-[rgba(45,0,75,0.08)] bg-transparent sm:bg-[var(--sd-sky-tint)]/40 px-0 sm:px-4 py-0 sm:py-4">
            {captchaUnavailable ? (
              <CaptchaUnavailable />
            ) : (
              <>
                <p className={`${kickerClass} text-center mb-2 sm:mb-3 hidden sm:block`}>
                  Quick security check
                </p>
                <div className="flex justify-center">
                  <Turnstile
                    ref={signInTurnstileRef}
                    siteKey={turnstileConfig.siteKey}
                    onSuccess={(token) => { signInCaptchaRef.current = token; }}
                    onExpire={() => { signInCaptchaRef.current = null; }}
                    onError={() => { signInCaptchaRef.current = null; }}
                    options={{ theme: "light", size: "normal" }}
                  />
                </div>
                <p className="text-xs text-[var(--sd-ink-light)] text-center mt-2 sm:mt-3 leading-relaxed hidden sm:block">
                  Just confirms you&apos;re human — no clicks needed.
                </p>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || captchaUnavailable}
            aria-busy={submitting}
            className={submitButtonClass}
            style={{ boxShadow: "var(--shadow-sd-cta-yellow)" }}
          >
            {submitting ? "Just a sec…" : "Sign in"}
          </button>

          <button
            type="button"
            onClick={() => { setForgotMode(true); setLocalError(""); setResetEmail(email); }}
            className={linkButtonClass}
          >
            Forgot password?
          </button>
        </form>

        <div className="mt-3 sm:mt-6 rounded-xl border border-[rgba(45,0,75,0.08)] bg-[var(--sd-buttercup-tint)]/50 px-4 py-2 sm:py-3 hidden sm:block">
          <p className="text-xs text-[var(--sd-navy-soft)] leading-relaxed">
            <strong className="text-[var(--sd-navy)]">Need an account?</strong> Ask the salon owner to send you an invite — the link in their email sets your password up.
          </p>
        </div>
      </PortalShell>
    );
  }

  // Forgot-password — request sent confirmation
  if (resetSent) {
    return (
      <PortalShell>
        <div aria-live="polite">
          <h1 className="font-['Quicksand','Montserrat',sans-serif] font-bold text-2xl sm:text-3xl mb-2 sm:mb-4 text-center text-[var(--sd-navy)]">
            <span className="relative inline-block">
              Check your inbox
              <ScribbleUnderline />
            </span>
          </h1>
          <p className="text-sm text-center text-[var(--sd-ink-light)] mb-3 sm:mb-8 leading-relaxed">
            We've sent a password reset link to{" "}
            <strong className="text-[var(--sd-navy)]">{resetEmail}</strong>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setForgotMode(false); setResetSent(false); setResetEmail(""); }}
          className={linkButtonClass}
        >
          ← Back to sign in
        </button>
      </PortalShell>
    );
  }

  // Forgot-password — request form
  return (
    <PortalShell>
      <div aria-live="polite">
        <h1 className="font-['Quicksand','Montserrat',sans-serif] font-bold text-2xl sm:text-3xl mb-2 sm:mb-4 text-center text-[var(--sd-navy)]">
          <span className="relative inline-block">
            Reset your password
            <ScribbleUnderline />
          </span>
        </h1>
        <p className="text-sm text-center text-[var(--sd-ink-light)] mb-3 sm:mb-8 leading-relaxed">
          Enter your email and we'll send you a link.
        </p>
      </div>

      <div
        role="alert"
        aria-live="assertive"
        className={resetError ? `${alertErrorClass} mb-6` : "sr-only"}
      >
        {resetError}
      </div>

      <form onSubmit={handleResetPassword} className="space-y-6">
        <div>
          <label htmlFor="reset-email" className="block text-sm font-bold mb-1 sm:mb-2 text-[var(--sd-navy)]">
            Email
          </label>
          <input
            id="reset-email"
            name="email"
            type="email"
            autoComplete="email"
            value={resetEmail}
            onChange={(e) => { setResetEmail(e.target.value); setResetError(""); }}
            placeholder="you@smarterdog.co.uk"
            className={fieldInputClass}
            autoFocus
          />
        </div>

        <div className="rounded-xl border border-[rgba(45,0,75,0.08)] bg-[var(--sd-sky-tint)]/40 px-4 py-2 sm:py-4">
          {captchaUnavailable ? (
            <CaptchaUnavailable />
          ) : (
            <>
              <p className={`${kickerClass} text-center mb-2 sm:mb-3 hidden sm:block`}>
                Quick security check
              </p>
              <div className="flex justify-center">
                <Turnstile
                  ref={resetTurnstileRef}
                  siteKey={turnstileConfig.siteKey}
                  onSuccess={(token) => { resetCaptchaRef.current = token; }}
                  onExpire={() => { resetCaptchaRef.current = null; }}
                  onError={() => { resetCaptchaRef.current = null; }}
                  options={{ theme: "light", size: "normal" }}
                />
              </div>
            </>
          )}
        </div>

        <button
          type="submit"
          disabled={resetSending || captchaUnavailable}
          aria-busy={resetSending}
          className={submitButtonClass}
          style={{ boxShadow: "var(--shadow-sd-cta-yellow)" }}
        >
          {resetSending ? "Just a sec…" : "Send reset link"}
        </button>
        <button
          type="button"
          onClick={() => { setForgotMode(false); setResetError(""); setResetEmail(""); }}
          className={linkButtonClass}
        >
          ← Back to sign in
        </button>
      </form>
    </PortalShell>
  );
}
