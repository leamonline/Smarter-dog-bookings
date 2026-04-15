import { useState } from "react";
import { supabase } from "../../supabase/client.js";

/**
 * Staff login page — sign-in only.
 * New staff accounts must be created by an owner directly in Supabase
 * Auth (or via an invite flow). Public self-registration is intentionally
 * removed to prevent unauthorised users from gaining dashboard access.
 */
export function LoginPage({ onSignIn, error, isOffline }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Forgot password
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState("");

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetEmail.trim()) { setResetError("Please enter your email address."); return; }
    setResetSending(true);
    setResetError("");
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetSending(false);
    if (err) { setResetError(err.message); return; }
    setResetSent(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setLocalError("Please enter both email and password.");
      return;
    }
    if (password.length < 12) {
      setLocalError("Password must be at least 12 characters.");
      return;
    }
    setLocalError("");
    setSubmitting(true);
    try {
      const result = await onSignIn(email.trim(), password);
      if (result?.error) setSubmitting(false);
    } catch {
      setSubmitting(false);
    }
  };

  if (isOffline) {
    return (
      <div className="max-w-[400px] mx-auto mt-20 px-5 font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]">
        <div className="text-center mb-8">
          <div className="text-[28px] font-extrabold text-slate-800">
            Smarter<span className="text-brand-cyan">Dog</span>
          </div>
          <div className="text-[13px] text-slate-500 mt-1">Salon Bookings</div>
        </div>
        <div className="bg-amber-50 border border-amber-400 rounded-xl p-5 text-center">
          <div className="text-[15px] font-bold text-amber-800 mb-2">Offline Mode</div>
          <div className="text-[13px] text-amber-800">
            Supabase is not configured. The app will run with sample data and no authentication.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[400px] mx-auto mt-20 px-5 font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]">
      <div className="text-center mb-8">
        <div className="text-[28px] font-extrabold text-slate-800">
          Smarter<span className="text-brand-cyan">Dog</span>
        </div>
        <div className="text-[13px] text-slate-500 mt-1">Salon Bookings</div>
      </div>

      <div className="bg-white rounded-2xl p-7 border border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
        <div className="text-lg font-extrabold text-slate-800 mb-1">Welcome back</div>
        <div className="text-[13px] text-slate-500 mb-5">Sign in to manage the salon.</div>

        {/* Forgot password mode */}
        {forgotMode && (
          <div className="mb-5">
            {resetSent ? (
              <div className="text-center">
                <div className="text-[32px] mb-2.5">{"\uD83D\uDCE7"}</div>
                <div className="text-[15px] font-bold text-slate-800 mb-1.5">Check your inbox</div>
                <div className="text-[13px] text-slate-500 mb-4">
                  We've sent a password reset link to <strong>{resetEmail}</strong>.
                </div>
                <button
                  onClick={() => { setForgotMode(false); setResetSent(false); setResetEmail(""); }}
                  className="text-[13px] text-brand-cyan bg-transparent border-none cursor-pointer font-semibold"
                >
                  {"\u2190"} Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="flex flex-col gap-3">
                <div className="text-[15px] font-bold text-slate-800 mb-0.5">Reset your password</div>
                <div className="text-[13px] text-slate-500 mb-1">
                  Enter your email and we'll send you a reset link.
                </div>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={e => { setResetEmail(e.target.value); setResetError(""); }}
                  placeholder="you@smarterdog.co.uk"
                  className="w-full py-3 px-4 rounded-[10px] border-[1.5px] border-slate-200 text-sm font-[inherit] box-border outline-none text-slate-800 transition-colors focus:border-brand-cyan"
                  autoFocus
                />
                {resetError && (
                  <div className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light py-2 px-3 rounded-lg">
                    {resetError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={resetSending}
                  className={`w-full py-3 rounded-[10px] border-none text-sm font-bold font-[inherit] ${
                    resetSending
                      ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                      : "bg-brand-cyan text-white cursor-pointer"
                  }`}
                >
                  {resetSending ? "Sending..." : "Send reset link"}
                </button>
                <button
                  type="button"
                  onClick={() => { setForgotMode(false); setResetError(""); setResetEmail(""); }}
                  className="text-[13px] text-slate-500 bg-transparent border-none cursor-pointer text-center"
                >
                  {"\u2190"} Back to sign in
                </button>
              </form>
            )}
          </div>
        )}

        {/* Sign in form */}
        {!forgotMode && <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3"
        >
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setLocalError(""); }}
              placeholder="you@smarterdog.co.uk"
              className="w-full py-3 px-4 rounded-[10px] border-[1.5px] border-slate-200 text-sm font-[inherit] box-border outline-none text-slate-800 transition-colors focus:border-brand-cyan"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setLocalError(""); }}
              placeholder="Min. 12 characters"
              className="w-full py-3 px-4 rounded-[10px] border-[1.5px] border-slate-200 text-sm font-[inherit] box-border outline-none text-slate-800 transition-colors focus:border-brand-cyan"
            />
          </div>

          {(localError || error) && (
            <div className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light py-2 px-3 rounded-lg">
              {localError || error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-3 rounded-[10px] border-none text-sm font-bold font-[inherit] transition-all mt-1 ${
              submitting
                ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-brand-cyan text-white cursor-pointer hover:bg-brand-cyan-dark"
            }`}
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>

          <button
            type="button"
            onClick={() => { setForgotMode(true); setLocalError(""); setResetEmail(email); }}
            className="bg-transparent border-none text-slate-500 text-[13px] cursor-pointer text-center py-1 font-[inherit]"
          >
            Forgot password?
          </button>
        </form>}

        <div className="mt-5 py-3 px-3.5 bg-slate-200 rounded-lg">
          <div className="text-xs text-slate-500 leading-relaxed">
            <strong className="text-slate-800">Need an account?</strong> Ask the salon owner to add your email in Supabase Auth, then use the password reset link to set your password.
          </div>
        </div>
      </div>
    </div>
  );
}
