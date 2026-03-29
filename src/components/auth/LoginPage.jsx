import { useState } from "react";
import { BRAND } from "../../constants/index.js";

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
    const result = await onSignIn(email.trim(), password);
    if (result?.error) setSubmitting(false);
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
            Salon Dashboard
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
          Salon Dashboard
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

        <form
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
        </form>

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
