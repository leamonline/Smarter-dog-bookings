import { Navigate, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useCustomerAuth } from "./supabase/hooks/useCustomerAuth.js";
import { getCustomerAuthRouteState } from "./components/auth/routeGuards.js";
import { CustomerLoginPage } from "./components/auth/CustomerLoginPage.jsx";
import { CustomerDashboard } from "./components/customer/CustomerDashboard.jsx";
import { BookingWizard } from "./components/customer/booking/BookingWizard.js";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.jsx";
import { NetworkOfflineBanner } from "./components/ui/NetworkOfflineBanner.jsx";
import { CenteredScreen, PortalCard } from "./components/ui/PageShell.jsx";
import { PawPrint } from "lucide-react";
import "./customer-portal.css";

export default function CustomerApp() {
  const navigate = useNavigate();
  const location = useLocation();
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

  const authRoute = getCustomerAuthRouteState({
    loading,
    user,
    location: {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    },
    from: location.state?.from,
  });

  if (authRoute.status === "loading") {
    return (
      <CenteredScreen fontClassName="font-['Montserrat',sans-serif]">
        <div className="w-full max-w-[400px] px-5 flex flex-col gap-4">
          <div className="h-8 w-40 mx-auto bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-4 w-32 mx-auto bg-slate-200 rounded animate-pulse" />
          <div className="h-48 bg-slate-200 rounded-xl animate-pulse" />
          <div className="h-12 bg-slate-200 rounded-lg animate-pulse" />
        </div>
      </CenteredScreen>
    );
  }

  if (authRoute.status === "redirect") {
    return (
      <Navigate
        to={authRoute.to}
        state={authRoute.state}
        replace
      />
    );
  }

  if (authRoute.status === "login") {
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

  // Authenticated but no matching human — give them a way to reach the salon.
  if (!humanRecord) {
    return (
      <CenteredScreen fontClassName="font-sans">
        <PortalCard className="rounded-xl shadow-sm text-center">
          <PawPrint size={32} className="text-brand-purple mx-auto mb-3" aria-hidden="true" />
          <div className="text-lg font-bold text-brand-purple font-display mb-2">
            We don&apos;t have your number on file yet
          </div>
          <div className="text-sm text-slate-500 mb-5 font-medium leading-relaxed">
            Drop us a message and we&apos;ll add you in. Once we&apos;ve done that, come back here and try again.
          </div>
          <a
            href="https://wa.me/447507731487"
            target="_blank"
            rel="noopener noreferrer"
            className="portal-btn portal-btn--cta w-full inline-flex items-center justify-center gap-2 mb-2 no-underline"
          >
            <span>Message Smarter Dog on WhatsApp</span>
          </a>
          <a
            href="tel:07507731487"
            className="portal-btn portal-btn--secondary w-full inline-block no-underline mb-3"
          >
            Or call 07507 731487
          </a>
          <button
            onClick={signOut}
            className="text-[13px] text-slate-500 bg-transparent border-none cursor-pointer font-semibold py-1"
          >
            Sign out
          </button>
        </PortalCard>
      </CenteredScreen>
    );
  }

  // Authenticated + matched
  return (
    <ErrorBoundary>
      <NetworkOfflineBanner />
      <Routes>
        <Route path="book" element={
          <BookingWizard
            humanRecord={humanRecord}
            onComplete={() => navigate("/customer")}
            onCancel={() => navigate("/customer")}
          />
        } />
        <Route path="*" element={
          <CustomerDashboard humanRecord={humanRecord} onSignOut={signOut} />
        } />
      </Routes>
    </ErrorBoundary>
  );
}
