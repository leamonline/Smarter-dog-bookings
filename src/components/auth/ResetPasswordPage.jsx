import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase/client.js";
import { BRAND } from "../../constants/index.js";

/**
 * Handles the Supabase password recovery flow.
 * Supabase redirects here after the user clicks the reset link in their email.
 * The recovery token arrives in the URL hash — Supabase picks it up automatically
 * via onAuthStateChange (PASSWORD_RECOVERY event), giving us a session to work with.
 */
export function ResetPasswordPage() {
  const [ready, setReady] = useState(false);       // recovery session established
  const [expired, setExpired] = useState(false);   // link is invalid/expired
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Use a ref so the timeout can read the *current* ready value, not a stale closure
  const readyRef = useRef(false);

  useEffect(() => {
    if (!supabase) { setExpired(true); return; }

    // Listen for PASSWORD_RECOVERY — Supabase fires this automatically when
    // the URL hash contains a valid recovery token.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        readyRef.current = true;
        setReady(true);
      }
    });

    // Also check if we already have a recovery session (e.g. page refresh)
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        readyRef.current = true;
        setReady(true);
      }
    });

    // If nothing happens within 6 seconds, the link is probably expired
    const timeout = setTimeout(() => {
      if (!readyRef.current) setExpired(true);
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (err) {
      setError(err.message || "Could not update password. The link may have expired.");
      return;
    }

    setDone(true);
    // Redirect to dashboard after a short pause
    setTimeout(() => { window.location.href = "/"; }, 2500);
  };

  const containerStyle = {
    minHeight: "100vh",
    background: "#F8FFFE",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const cardStyle = {
    width: "100%",
    maxWidth: 400,
    background: BRAND.white,
    borderRadius: 16,
    padding: 28,
    border: `1px solid ${BRAND.greyLight}`,
    boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
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
  };

  const labelStyle = {
    fontSize: 12,
    fontWeight: 700,
    color: BRAND.textLight,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    display: "block",
    marginBottom: 6,
  };

  // ── Success ──────────────────────────────────────────
  if (done) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.text, marginBottom: 8 }}>
            Password updated!
          </div>
          <div style={{ fontSize: 13, color: BRAND.textLight }}>
            Taking you to the dashboard…
          </div>
        </div>
      </div>
    );
  }

  // ── Expired / invalid link ────────────────────────────
  if (expired) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏱️</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.text, marginBottom: 8 }}>
            Link expired
          </div>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 20 }}>
            This reset link has expired or is invalid. Request a new one from the sign-in page.
          </div>
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: BRAND.blue,
              color: BRAND.white,
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  // ── Waiting for recovery session ──────────────────────
  if (!ready) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: BRAND.textLight }}>Verifying reset link…</div>
        </div>
      </div>
    );
  }

  // ── Set new password form ─────────────────────────────
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: BRAND.text }}>
            Smarter<span style={{ color: BRAND.blue }}>Dog</span>
          </div>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>Salon Bookings</div>
        </div>

        <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.text, marginBottom: 4 }}>
          Set a new password
        </div>
        <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 20 }}>
          Choose something strong — at least 8 characters.
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>New password</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              placeholder="Min. 8 characters"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = BRAND.blue)}
              onBlur={e => (e.target.style.borderColor = BRAND.greyLight)}
              autoFocus
            />
          </div>

          <div>
            <label style={labelStyle}>Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(""); }}
              placeholder="Same again"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = BRAND.blue)}
              onBlur={e => (e.target.style.borderColor = BRAND.greyLight)}
            />
          </div>

          {error && (
            <div style={{
              fontSize: 13, color: BRAND.coral, fontWeight: 600,
              background: BRAND.coralLight, padding: "8px 12px", borderRadius: 8,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              width: "100%", padding: "12px", borderRadius: 10, border: "none",
              background: saving ? BRAND.greyLight : BRAND.blue,
              color: saving ? BRAND.textLight : BRAND.white,
              fontSize: 14, fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "inherit", marginTop: 4,
            }}
          >
            {saving ? "Saving…" : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
