import { useState } from "react";
import { BRAND } from "../../constants/index.js";

export function LoginPage({ onSignIn, onSignUp, error, isOffline }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin"); // "signin" or "signup"
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);

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

    if (mode === "signin") {
      const result = await onSignIn(email.trim(), password);
      if (result?.error) setSubmitting(false);
    } else {
      const result = await onSignUp(email.trim(), password);
      if (result?.error) {
        setSubmitting(false);
      } else {
        setSignUpSuccess(true);
        setSubmitting(false);
      }
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
      <div style={{ maxWidth: 400, margin: "80px auto", padding: "0 20px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: BRAND.text }}>
            Smarter<span style={{ color: BRAND.blue }}>Dog</span>
          </div>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>Salon Dashboard</div>
        </div>
        <div style={{ background: BRAND.yellowLight, border: `1px solid ${BRAND.yellow}`, borderRadius: 12, padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#92400E", marginBottom: 8 }}>Offline Mode</div>
          <div style={{ fontSize: 13, color: "#92400E" }}>Supabase is not configured. The app will run with sample data and no authentication.</div>
        </div>
      </div>
    );
  }

  if (signUpSuccess) {
    return (
      <div style={{ maxWidth: 400, margin: "80px auto", padding: "0 20px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: BRAND.text }}>
            Smarter<span style={{ color: BRAND.blue }}>Dog</span>
          </div>
        </div>
        <div style={{ background: BRAND.openGreenBg, border: `1px solid ${BRAND.openGreen}`, borderRadius: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.openGreen, marginBottom: 8 }}>Check your email</div>
          <div style={{ fontSize: 13, color: BRAND.text }}>We've sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then sign in.</div>
        </div>
        <button onClick={() => { setSignUpSuccess(false); setMode("signin"); }} style={{
          width: "100%", marginTop: 16, padding: "12px", borderRadius: 10, border: "none",
          background: BRAND.blue, color: BRAND.white, fontSize: 14, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
        }}>Back to Sign In</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: "80px auto", padding: "0 20px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: BRAND.text }}>
          Smarter<span style={{ color: BRAND.blue }}>Dog</span>
        </div>
        <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>Salon Dashboard</div>
      </div>

      <div style={{
        background: BRAND.white, borderRadius: 16, padding: 28,
        border: `1px solid ${BRAND.greyLight}`, boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.text, marginBottom: 4 }}>
          {mode === "signin" ? "Welcome back" : "Create account"}
        </div>
        <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 20 }}>
          {mode === "signin" ? "Sign in to manage the salon." : "Set up your staff account."}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setLocalError(""); }}
              placeholder="you@smarterdog.co.uk"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = BRAND.blue}
              onBlur={e => e.target.style.borderColor = BRAND.greyLight}
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setLocalError(""); }}
              placeholder="Min. 6 characters"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = BRAND.blue}
              onBlur={e => e.target.style.borderColor = BRAND.greyLight}
            />
          </div>

          {(localError || error) && (
            <div style={{ fontSize: 13, color: BRAND.coral, fontWeight: 600, background: BRAND.coralLight, padding: "8px 12px", borderRadius: 8 }}>
              {localError || error}
            </div>
          )}

          <button type="submit" disabled={submitting} style={{
            width: "100%", padding: "12px", borderRadius: 10, border: "none",
            background: submitting ? BRAND.greyLight : BRAND.blue,
            color: submitting ? BRAND.textLight : BRAND.white,
            fontSize: 14, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
            fontFamily: "inherit", transition: "all 0.15s", marginTop: 4,
          }}
          onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = BRAND.blueDark; }}
          onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = BRAND.blue; }}>
            {submitting ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setLocalError(""); }} style={{
            background: "none", border: "none", fontSize: 13, color: BRAND.blue,
            cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
          }}>
            {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
