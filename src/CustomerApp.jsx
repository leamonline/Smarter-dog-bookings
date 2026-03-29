import { useState, useEffect } from "react";
import { useCustomerAuth } from "./supabase/hooks/useCustomerAuth.js";
import { CustomerLoginPage } from "./components/auth/CustomerLoginPage.jsx";
import { CustomerDashboard } from "./components/customer/CustomerDashboard.jsx";
import { BRAND } from "./constants/index.js";
import { customerSupabase as supabase } from "./supabase/customerClient.js";

export default function CustomerApp() {
  const {
    user,
    humanRecord,
    loading,
    error,
    otpSent,
    phone,
    requestOtp,
    verifyOtp,
    signOut,
    resetOtp,
  } = useCustomerAuth();

  // Demo mode state
  const [demoMode, setDemoMode] = useState(false);
  const [demoHuman, setDemoHuman] = useState(null);
  const [demoList, setDemoList] = useState([]);
  const [demoLoading, setDemoLoading] = useState(false);

  // Fetch demo customers list
  const loadDemoList = async () => {
    if (!supabase) return;
    setDemoLoading(true);
    const { data } = await supabase
      .from("humans")
      .select("id, name, surname, phone")
      .neq("phone", "")
      .order("name");
    setDemoList(data || []);
    setDemoLoading(false);
  };

  const handleDemoSelect = async (humanId) => {
    if (!supabase) return;
    setDemoLoading(true);
    const { data } = await supabase
      .from("humans")
      .select("*")
      .eq("id", humanId)
      .single();
    if (data) {
      setDemoHuman(data);
    }
    setDemoLoading(false);
  };

  const exitDemo = () => {
    setDemoMode(false);
    setDemoHuman(null);
    setDemoList([]);
  };

  // If in demo mode and a human is selected, show dashboard
  if (demoMode && demoHuman) {
    return <CustomerDashboard humanRecord={demoHuman} onSignOut={exitDemo} />;
  }

  // If in demo mode, show customer picker
  if (demoMode) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#F8FFFE",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: 20,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 400,
            background: BRAND.white,
            borderRadius: 16,
            padding: 28,
            border: `1px solid ${BRAND.greyLight}`,
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: BRAND.text,
              marginBottom: 4,
              textAlign: "center",
            }}
          >
            Demo Mode
          </div>
          <div
            style={{
              fontSize: 13,
              color: BRAND.textLight,
              marginBottom: 20,
              textAlign: "center",
            }}
          >
            Pick a customer to view their dashboard
          </div>

          {demoLoading ? (
            <div
              style={{
                textAlign: "center",
                color: BRAND.textLight,
                padding: 20,
              }}
            >
              Loading...
            </div>
          ) : demoList.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: BRAND.textLight,
                padding: 20,
              }}
            >
              No customers found
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {demoList.map((h) => (
                <button
                  key={h.id}
                  onClick={() => handleDemoSelect(h.id)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: `1px solid ${BRAND.greyLight}`,
                    background: BRAND.white,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = BRAND.teal;
                    e.currentTarget.style.background = BRAND.tealLight;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = BRAND.greyLight;
                    e.currentTarget.style.background = BRAND.white;
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: BRAND.text,
                      }}
                    >
                      {h.name} {h.surname}
                    </div>
                    <div style={{ fontSize: 12, color: BRAND.textLight }}>
                      {h.phone}
                    </div>
                  </div>
                  <span style={{ fontSize: 18, color: BRAND.teal }}>→</span>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={exitDemo}
            style={{
              width: "100%",
              marginTop: 16,
              padding: "10px",
              borderRadius: 10,
              border: `1px solid ${BRAND.greyLight}`,
              background: BRAND.white,
              color: BRAND.textLight,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#F8FFFE",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
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
        // Demo mode is dev-only: undefined in production so the button never renders.
        onDemoMode={
          import.meta.env.DEV
            ? () => {
                setDemoMode(true);
                loadDemoList();
              }
            : undefined
        }
      />
    );
  }

  // Authenticated but no matching human record
  if (!humanRecord) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#F8FFFE",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: 20,
        }}
      >
        <div
          style={{
            maxWidth: 400,
            textAlign: "center",
            background: BRAND.white,
            borderRadius: 16,
            padding: 28,
            border: `1px solid ${BRAND.greyLight}`,
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>{"\uD83D\uDC3E"}</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: BRAND.text,
              marginBottom: 8,
            }}
          >
            Phone not recognised
          </div>
          <div
            style={{ fontSize: 14, color: BRAND.textLight, marginBottom: 20 }}
          >
            Your number isn't linked to a customer account yet. Please contact
            the salon so they can add your details.
          </div>
          <button
            onClick={signOut}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 10,
              border: "none",
              background: BRAND.teal,
              color: BRAND.white,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Authenticated + matched — show dashboard
  return <CustomerDashboard humanRecord={humanRecord} onSignOut={signOut} />;
}
