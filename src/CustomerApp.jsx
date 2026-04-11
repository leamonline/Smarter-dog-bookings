import { useState, useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { useCustomerAuth } from "./supabase/hooks/useCustomerAuth.js";
import { CustomerLoginPage } from "./components/auth/CustomerLoginPage.jsx";
import { CustomerDashboard } from "./components/customer/CustomerDashboard.jsx";
import { BookingWizard } from "./components/customer/booking/BookingWizard.js";
import { customerSupabase as supabase } from "./supabase/customerClient.js";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.jsx";
import "./customer-portal.css";

export default function CustomerApp() {
  const navigate = useNavigate();
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

  // Fetch demo customers list (uses RPC to bypass RLS)
  const loadDemoList = async () => {
    if (!supabase) return;
    setDemoLoading(true);
    const { data } = await supabase.rpc("get_demo_customers");
    setDemoList(data || []);
    setDemoLoading(false);
  };

  const handleDemoSelect = async (humanId) => {
    if (!supabase) return;
    setDemoLoading(true);
    const { data } = await supabase.rpc("get_demo_customer", { p_human_id: humanId }).single();
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

  // If in demo mode and a human is selected, fall through to Routes block below
  const activeHuman = demoMode ? demoHuman : humanRecord;
  const handleSignOut = demoMode ? exitDemo : signOut;

  if (demoMode && demoHuman) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="book" element={
            <BookingWizard
              humanRecord={activeHuman}
              onComplete={() => navigate("/customer")}
              onCancel={() => navigate("/customer")}
            />
          } />
          <Route path="*" element={
            <CustomerDashboard humanRecord={activeHuman} onSignOut={handleSignOut} />
          } />
        </Routes>
      </ErrorBoundary>
    );
  }

  // If in demo mode, show customer picker
  if (demoMode) {
    return (
      <div className="min-h-screen bg-[#F8FFFE] flex items-center justify-center font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif] p-5">
        <div className="w-full max-w-[400px] bg-white rounded-2xl p-7 border border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
          <div className="text-xl font-extrabold text-slate-800 mb-1 text-center">
            Demo Mode
          </div>
          <div className="text-[13px] text-slate-500 mb-5 text-center">
            Pick a customer to view their dashboard
          </div>

          {demoLoading ? (
            <div className="text-center text-slate-500 py-5">
              Loading...
            </div>
          ) : demoList.length === 0 ? (
            <div className="text-center text-slate-500 py-5">
              No customers found
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {demoList.map((h) => (
                <button
                  key={h.id}
                  onClick={() => handleDemoSelect(h.id)}
                  className="flex justify-between items-center py-3 px-3.5 rounded-[10px] border border-slate-200 bg-white cursor-pointer font-[inherit] transition-all text-left hover:border-brand-teal hover:bg-emerald-50"
                >
                  <div>
                    <div className="text-sm font-bold text-slate-800">
                      {h.name} {h.surname}
                    </div>
                    <div className="text-xs text-slate-500">
                      {h.phone}
                    </div>
                  </div>
                  <span className="text-lg text-brand-teal">{"\u2192"}</span>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={exitDemo}
            className="w-full mt-4 py-2.5 rounded-[10px] border border-slate-200 bg-white text-slate-500 text-[13px] font-semibold cursor-pointer font-[inherit]"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  // Loading state — shimmer skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FFFE] flex items-center justify-center font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]">
        <div className="w-full max-w-[400px] px-5 flex flex-col gap-4">
          <div className="h-8 w-40 mx-auto bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-4 w-32 mx-auto bg-slate-200 rounded animate-pulse" />
          <div className="h-48 bg-slate-200 rounded-2xl animate-pulse" />
          <div className="h-12 bg-slate-200 rounded-xl animate-pulse" />
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
      <div className="min-h-screen bg-[#F8FFFE] flex items-center justify-center font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif] p-5">
        <div className="max-w-[400px] text-center bg-white rounded-2xl p-7 border border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
          <div className="text-[32px] mb-3">{"\uD83D\uDC3E"}</div>
          <div className="text-lg font-extrabold text-slate-800 mb-2">
            Phone not recognised
          </div>
          <div className="text-sm text-slate-500 mb-5">
            Your number isn't linked to a customer account yet. Please contact
            the salon so they can add your details.
          </div>
          <button
            onClick={signOut}
            className="w-full py-3 rounded-[10px] border-none bg-brand-teal text-white text-sm font-bold cursor-pointer font-[inherit]"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Authenticated + matched — show dashboard or booking wizard
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="book" element={
          <BookingWizard
            humanRecord={activeHuman}
            onComplete={() => navigate("/customer")}
            onCancel={() => navigate("/customer")}
          />
        } />
        <Route path="*" element={
          <CustomerDashboard humanRecord={activeHuman} onSignOut={handleSignOut} />
        } />
      </Routes>
    </ErrorBoundary>
  );
}
