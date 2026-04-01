import { useState } from "react";
import { BRAND } from "../../constants/index.js";
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
    if (password.length < 6) {
      setLocalError("Password must be at least 6 characters.");
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

  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 10,
    border: `1.5px solid ${BRAND.greyLight}`,
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
    outline: "none",
    color: BRAND.text,
    transition: "border-color 0.15s",
  };

  if (isOffline) {
    return (
      <div
        style={{
          maxWidth: 400,
          margin: "80px auto",
          padding: "0 20px",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: BRAND.text }}>
            Smarter<span style={{ color: BRAND.blue }}>Dog</span>
          </div>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>
            Salon Bookings
          </div>
        </div>
        <div
          style={{
            background: BRAND.yellowLight,
            border: `1px solid ${BRAND.yellow}`,
            borderRadius: 12,
            padding: 20,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#92400E",
              marginBottom: 8,
            }}
          >
            Offline Mode
          </div>
          <div style={{ fontSize: 13, color: "#92400E" }}>
            Supabase is not configured. The app will run with sample data and no
            authentication.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 400,
        margin: "80px auto",
        padding: "0 20px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: BRAND.text }}>
          Smarter<span style={{ color: BRAND.blue }}>Dog</span>
        </div>
        <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>
          Salon Bookings
        </div>
      </div>

      <div
        style={{
          background: BRAND.white,
          borderRadius: 16,
          padding: 28,
          border: `1px solid ${BRAND.greyLight}`,
          boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: BRAND.text,
            marginBottom: 4,
          }}
        >
          Welcome back
        </div>
        <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 20 }}>
          Sign in to manage the salon.
        </div>

        {/* ── Forgot password mode ── */}
        {forgotMode && (
          <div style={{ marginBottom: 20 }}>
            {resetSent ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📧</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text, marginBottom: 6 }}>Check your inbox</div>
                <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 16 }}>
                  We've sent a password reset link to <strong>{resetEmail}</strong>.
                </div>
                <button
                  onClick={() => { setForgotMode(false); setResetSent(false); setResetEmail(""); }}
                  style={{ fontSize: 13, color: BRAND.blue, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                >
                  ← Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text, marginBottom: 2 }}>Reset your password</div>
                <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 4 }}>
                  Enter your email and we'll send you a reset link.
                </div>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={e => { setResetEmail(e.target.value); setResetError(""); }}
                  placeholder="you@smarterdog.co.uk"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = BRAND.blue)}
                  onBlur={e => (e.target.style.borderColor = BRAND.greyLight)}
                  autoFocus
                />
                {resetError && (
                  <div style={{ fontSize: 13, color: BRAND.coral, fontWeight: 600, background: BRAND.coralLight, padding: "8px 12px", borderRadius: 8 }}>
                    {resetError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={resetSending}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 10, border: "none",
                    background: resetSending ? BRAND.greyLight : BRAND.blue,
                    color: resetSending ? BRAND.textLight : BRAND.white,
                    fontSize: 14, fontWeight: 700, cursor: resetSending ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {resetSending ? "Sending…" : "Send reset link"}
                </button>
                <button
                  type="button"
                  onClick={() => { setForgotMode(false); setResetError(""); setResetEmail(""); }}
                  style={{ fontSize: 13, color: BRAND.textLight, background: "none", border: "none", cursor: "pointer", textAlign: "center" }}
                >
                  ← Back to sign in
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── Sign in form ── */}
        {!forgotMode && <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: BRAND.textLight,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                display: "block",
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setLocalError("");
              }}
              placeholder="you@smarterdog.co.uk"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = BRAND.blue)}
              onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)}
              autoFocus
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: BRAND.textLight,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                display: "block",
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setLocalError("");
              }}
              placeholder="Min. 6 characters"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = BRAND.blue)}
              onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)}
            />
          </div>

          {(localError || error) && (
            <div
              style={{
                fontSize: 13,
                color: BRAND.coral,
                fontWeight: 600,
                background: BRAND.coralLight,
                padding: "8px 12px",
                borderRadius: 8,
              }}
            >
              {localError || error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 10,
              border: "none",
              background: submitting ? BRAND.greyLight : BRAND.blue,
              color: submitting ? BRAND.textLight : BRAND.white,
              fontSize: 14,
              fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
              marginTop: 4,
            }}
            onMouseEnter={(e) => {
              if (!submitting)
                e.currentTarget.style.background = BRAND.blueDark;
            }}
            onMouseLeave={(e) => {
              if (!submitting) e.currentTarget.style.background = BRAND.blue;
            }}
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>

          <button
            type="button"
            onClick={() => { setForgotMode(true); setLocalError(""); setResetEmail(email); }}
            style={{
              background: "none", border: "none", color: BRAND.textLight,
              fontSize: 13, cursor: "pointer", textAlign: "center",
              padding: "4px 0", fontFamily: "inherit",
            }}
          >
            Forgot password?
          </button>
        </form>}

        <div
          style={{
            marginTop: 20,
            padding: "12px 14px",
            background: BRAND.greyLight,
            borderRadius: 8,
          }}
        >
          <div
            style={{ fontSize: 12, color: BRAND.textLight, lineHeight: 1.5 }}
          >
            <strong style={{ color: BRAND.text }}>Need an account?</strong> Ask
            the salon owner to add your email in Supabase Auth, then use the
            password reset link to set your password.
          </div>
        </div>
      </div>
    </div>
  );
}
