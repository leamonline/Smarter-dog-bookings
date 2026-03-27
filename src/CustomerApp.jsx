import { useCustomerAuth } from "./supabase/hooks/useCustomerAuth.js";
import { CustomerLoginPage } from "./components/auth/CustomerLoginPage.jsx";
import { CustomerDashboard } from "./components/customer/CustomerDashboard.jsx";
import { BRAND } from "./constants/index.js";
import { supabase } from "./supabase/client.js";

export default function CustomerApp() {
  const {
    user, humanRecord, loading, error,
    otpSent, phone,
    requestOtp, verifyOtp, signOut, resetOtp,
  } = useCustomerAuth();

  // Loading state
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", background: "#F8FFFE",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{ textAlign: "center", color: BRAND.textLight }}>
          Loading...
        </div>
      </div>
    );
  }
  // Not authenticated — show login
  if (!user) {
    return (
      <CustomerLoginPage
        onRequestOtp={requestOtp}
        onVerifyOtp={verifyOtp}
        onResetOtp={resetOtp}
        otpSent={otpSent}
        phone={phone}
        error={error}
      />
    );
  }

  // Authenticated but no matching human record
  if (!humanRecord) {
    return (
      <div style={{
        minHeight: "100vh", background: "#F8FFFE",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: 20,
      }}>
        <div style={{
          maxWidth: 400, textAlign: "center",
          background: BRAND.white, borderRadius: 16, padding: 28,
          border: `1px solid ${BRAND.greyLight}`,
          boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🐾</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.text, marginBottom: 8 }}>
            Phone not recognised
          </div>
          <div style={{ fontSize: 14, color: BRAND.textLight, marginBottom: 20 }}>
            Your number isn't linked to a customer account yet. Please contact the salon so they can add your details.
          </div>
          <button onClick={signOut} style={{
            width: "100%", padding: "12px", borderRadius: 10,
            border: "none", background: BRAND.teal, color: BRAND.white,
            fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: "inherit",
          }}>Sign Out</button>
        </div>
      </div>
    );
  }

  // Authenticated + matched — show dashboard
  return <CustomerDashboard humanRecord={humanRecord} onSignOut={signOut} />;
}
