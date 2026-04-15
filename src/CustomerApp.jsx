import { useState, useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { useCustomerAuth } from "./supabase/hooks/useCustomerAuth.js";
import { CustomerLoginPage } from "./components/auth/CustomerLoginPage.jsx";
import { CustomerDashboard } from "./components/customer/CustomerDashboard.jsx";
import { BookingWizard } from "./components/customer/booking/BookingWizard.js";
import { customerSupabase as supabase } from "./supabase/customerClient.js";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.jsx";
import { PawPrint } from "lucide-react";
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

  const [demoMode, setDemoMode] = useState(false);
  const [demoHuman, setDemoHuman] = useState(null);
  const [demoList, setDemoList] = useState([]);
  const [demoLoading, setDemoLoading] = useState(false);

  const loadDemoList = async () => {
    if (!import.meta.env.DEV || !supabase) return;
    setDemoLoading(true);
    const { data } = await supabase.rpc("get_demo_customers");
    setDemoList(data || []);
    setDemoLoading(false);
  };

  const handleDemoSelect = async (humanId) => {
    if (!import.meta.env.DEV || !supabase) return;
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

  // Demo mode — customer picker
  if (demoMode) {
    return (
      <div className="min-h-screen bg-brand-paper flex items-center justify-center font-['DM_Sans',sans-serif] p-5">
        <div className="w-full max-w-[400px] bg-white rounded-xl p-7 border border-slate-200 shadow-sm">
          <div className="text-lg font-bold text-brand-purple font-['Sora',sans-serif] mb-1 text-center">
            Demo Mode
          </div>
          <div className="text-[13px] text-slate-500 mb-5 text-center font-medium">
            Pick a customer to view their dashboard
          </div>

          {demoLoading ? (
            <div className="text-center text-slate-500 py-5 text-sm">Loading...</div>
          ) : demoList.length === 0 ? (
            <div className="text-center text-slate-500 py-5 text-sm">No customers found</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {demoList.map((h) => (
                <button
                  key={h.id}
                  onClick={() => handleDemoSelect(h.id)}
                  className="flex justify-between items-center py-3 px-3.5 rounded-lg border-2 border-slate-200 bg-white cursor-pointer font-[inherit] transition-all text-left hover:border-brand-purple hover:bg-purple-50"
                >
                  <div>
                    <div className="text-sm font-bold text-brand-purple">
                      {h.name} {h.surname}
                    </div>
                    <div className="text-xs text-slate-500 font-medium">
                      {h.phone}
                    </div>
                  </div>
                  <span className="text-lg text-brand-purple">{"\u2192"}</span>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={exitDemo}
            className="portal-btn portal-btn--secondary w-full mt-4 text-[13px]"
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
      <div className="min-h-screen bg-brand-paper flex items-center justify-center font-['DM_Sans',sans-serif]">
        <div className="w-full max-w-[400px] px-5 flex flex-col gap-4">
          <div className="h-8 w-40 mx-auto bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-4 w-32 mx-auto bg-slate-200 rounded animate-pulse" />
          <div className="h-48 bg-slate-200 rounded-xl animate-pulse" />
          <div className="h-12 bg-slate-200 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  // Not authenticated
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

  // Authenticated but no matching human
  if (!humanRecord) {
    return (
      <div className="min-h-screen bg-brand-paper flex items-center justify-center font-['DM_Sans',sans-serif] p-5">
        <div className="max-w-[400px] text-center bg-white rounded-xl p-7 border border-slate-200 shadow-sm">
          <PawPrint size={32} className="text-brand-purple mx-auto mb-3" />
          <div className="text-lg font-bold text-brand-purple font-['Sora',sans-serif] mb-2">
            Phone not recognised
          </div>
          <div className="text-sm text-slate-500 mb-5 font-medium">
            Your number isn't linked to a customer account yet. Please contact
            the salon so they can add your details.
          </div>
          <button
            onClick={signOut}
            className="portal-btn portal-btn--primary w-full py-3 text-sm"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Authenticated + matched
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
