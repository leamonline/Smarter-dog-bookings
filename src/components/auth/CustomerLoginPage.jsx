import { useState } from "react";
import { BRAND } from "../../constants/index.js";

export function CustomerLoginPage({ onRequestOtp, onVerifyOtp, onResetOtp, otpSent, phone, error, onDemoMode }) {
  const [phoneInput, setPhoneInput] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");

  // Format phone for display: 07xxx → +44 7xxx
  const normalisePhone = (raw) => {
    let p = raw.replace(/\s+/g, "").replace(/[^0-9+]/g, "");
    if (p.startsWith("07")) p = "+44" + p.slice(1);
    if (p.startsWith("44")) p = "+" + p;
    return p;
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    const normalised = normalisePhone(phoneInput);
    if (normalised.length < 12) {
      setLocalError("Please enter a valid UK mobile number.");
      return;
    }
    setLocalError("");
    setSubmitting(true);
    await onRequestOtp(normalised);
    setSubmitting(false);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (code.length < 6) {
      setLocalError("Please enter the 6-digit code.");
      return;
    }
    setLocalError("");
    setSubmitting(true);
    await onVerifyOtp(code);
    setSubmitting(false);
  };

  const inputStyle = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 10,
    border: `1.5px solid ${BRAND.greyLight}`,
    fontSize: 16,
    fontFamily: "inherit",
    boxSizing: "border-box",
    outline: "none",
    color: BRAND.text,
    transition: "border-color 0.15s",
  };

  const btnStyle = {
    width: "100%", padding: "14px", borderRadius: 10, border: "none",
    background: submitting ? BRAND.greyLight : BRAND.teal,
    color: submitting ? BRAND.textLight : BRAND.white,
    fontSize: 15, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
    fontFamily: "inherit", transition: "all 0.15s", marginTop: 8,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8FFFE", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: BRAND.text }}>
            Smarter<span style={{ color: BRAND.teal }}>Dog</span>
          </div>
          <div style={{ fontSize: 14, color: BRAND.textLight, marginTop: 4 }}>Customer Portal</div>
        </div>

        <div style={{
          background: BRAND.white, borderRadius: 16, padding: 28,
          border: `1px solid ${BRAND.greyLight}`, boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        }}>
          {!otpSent ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.text, marginBottom: 4 }}>
                Welcome
              </div>
              <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 20 }}>
                Enter your mobile number and we'll text you a login code.
              </div>
              <form onSubmit={handleRequestOtp}>
                <label style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Mobile Number</label>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={e => { setPhoneInput(e.target.value); setLocalError(""); }}
                  placeholder="07700 900000"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = BRAND.teal}
                  onBlur={e => e.target.style.borderColor = BRAND.greyLight}
                  autoFocus
                  autoComplete="tel"
                />
                {(localError || error) && (
                  <div style={{ fontSize: 13, color: BRAND.coral, fontWeight: 600, background: BRAND.coralLight, padding: "8px 12px", borderRadius: 8, marginTop: 8 }}>
                    {localError || error}
                  </div>
                )}
                <button type="submit" disabled={submitting} style={btnStyle}>
                  {submitting ? "Sending..." : "Send Login Code"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.text, marginBottom: 4 }}>
                Check your phone
              </div>
              <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 20 }}>
                We sent a 6-digit code to <strong>{phone}</strong>
              </div>
              <form onSubmit={handleVerifyOtp}>
                <label style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={e => { setCode(e.target.value.replace(/\D/g, "")); setLocalError(""); }}
                  placeholder="000000"
                  style={{ ...inputStyle, textAlign: "center", fontSize: 24, letterSpacing: 8, fontWeight: 700 }}
                  onFocus={e => e.target.style.borderColor = BRAND.teal}
                  onBlur={e => e.target.style.borderColor = BRAND.greyLight}
                  autoFocus
                  autoComplete="one-time-code"
                />
                {(localError || error) && (
                  <div style={{ fontSize: 13, color: BRAND.coral, fontWeight: 600, background: BRAND.coralLight, padding: "8px 12px", borderRadius: 8, marginTop: 8 }}>
                    {localError || error}
                  </div>
                )}
                <button type="submit" disabled={submitting} style={btnStyle}>
                  {submitting ? "Verifying..." : "Verify & Sign In"}
                </button>
              </form>
              <button onClick={onResetOtp} style={{
                width: "100%", marginTop: 12, padding: "10px", borderRadius: 10,
                border: `1px solid ${BRAND.greyLight}`, background: BRAND.white,
                fontSize: 13, fontWeight: 600, color: BRAND.textLight,
                cursor: "pointer", fontFamily: "inherit",
              }}>Use a different number</button>
            </>
          )}
        </div>

        {/* Demo mode button — for testing before Twilio is configured */}
        {onDemoMode && (
          <button onClick={onDemoMode} style={{
            width: "100%", marginTop: 16, padding: "12px", borderRadius: 10,
            border: `1.5px dashed ${BRAND.textLight}`, background: "transparent",
            fontSize: 13, fontWeight: 600, color: BRAND.textLight,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = BRAND.teal; e.currentTarget.style.color = BRAND.teal; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = BRAND.textLight; e.currentTarget.style.color = BRAND.textLight; }}>
            Demo Mode — Preview as a customer
          </button>
        )}
      </div>
    </div>
  );
}
