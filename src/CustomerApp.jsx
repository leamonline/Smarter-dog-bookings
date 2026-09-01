import { Navigate, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useCustomerAuth } from "./supabase/hooks/useCustomerAuth.js";
import { useCustomerProfileGate } from "./supabase/hooks/useCustomerProfileGate.js";
import { useCustomerSignupGate } from "./supabase/hooks/useCustomerSignupGate.js";
import { getCustomerAuthRouteState } from "./components/auth/routeGuards.js";
import { CustomerLoginPage } from "./components/auth/CustomerLoginPage.jsx";
import { CustomerDashboard } from "./components/customer/CustomerDashboard.jsx";
import { ProfileGate } from "./components/customer/onboarding/ProfileGate.jsx";
import { SetPasswordGate } from "./components/customer/onboarding/SetPasswordGate.jsx";
import { JoinThePackWelcome } from "./components/customer/onboarding/JoinThePackWelcome.jsx";
import { JoinThePackOnboarding } from "./components/customer/onboarding/JoinThePackOnboarding.jsx";
import { PendingApprovalGate } from "./components/customer/onboarding/PendingApprovalGate.jsx";
import { BookingWizard } from "./components/customer/booking/BookingWizard";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.jsx";
import { NetworkOfflineBanner } from "./components/ui/NetworkOfflineBanner.jsx";
import { CenteredScreen } from "./components/ui/PageShell.jsx";
import { ToastProvider } from "./contexts/ToastContext.jsx";
import "./customer-portal.css";

export default function CustomerApp() {
  // Wrap the whole app in ToastProvider so customer-facing save flows
  // (MyDetails, dogs, trusted humans) can confirm success or surface
  // failures alongside the existing inline portal-alert--error UI.
  return (
    <ToastProvider>
      <CustomerAppContent />
    </ToastProvider>
  );
}

function CustomerAppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    humanRecord,
    loading,
    error,
    otpSent,
    phone,
    hasPassword,
    mustSetPassword,
    passwordCompromised,
    checkPhone,
    sendOtp,
    signInWithPassword,
    verifyOtp,
    signOut,
    resetOtp,
    refreshHumanRecord,
    createPendingHuman,
    clearMustSetPassword,
  } = useCustomerAuth();

  // Profile-completion gate. Called unconditionally (rules of hooks); it
  // returns complete=true / loading=false while humanRecord is null, so it's
  // a no-op until there's a linked record to gate.
  const gate = useCustomerProfileGate(humanRecord);

  // Self-signup lifecycle gate (Join the Pack). Returns "approved" for every
  // staff-created / existing customer, so it's a no-op for them; only a
  // pending self-signup shell reads as "onboarding" / "pending".
  const signup = useCustomerSignupGate(humanRecord);

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
        onCheckPhone={checkPhone}
        onSendOtp={sendOtp}
        onSignInWithPassword={signInWithPassword}
        onVerifyOtp={verifyOtp}
        onResetOtp={resetOtp}
        otpSent={otpSent}
        phone={phone}
        error={error}
      />
    );
  }

  // Authenticated but no matching human — a brand-new customer. Offer to set
  // them up ("Join the Pack"): the CTA creates a pending shell record, after
  // which the normal gates (set password, then the signup questions) take over.
  if (!humanRecord) {
    return (
      <JoinThePackWelcome onStart={createPendingHuman} onSignOut={signOut} />
    );
  }

  // Authenticated + matched, but no password yet (first login) or a
  // forgot-password reset in progress — require a password before the
  // dashboard. This is what lets returning customers sign in with phone +
  // password instead of a paid SMS code every time.
  //
  // Fail open: only force the gate when has_password is explicitly false.
  // If it's undefined (older Edge Function build, or a link-RPC read error)
  // we skip the gate — a transient glitch must never trap a customer in a
  // lockout loop; the worst case is they keep using codes for now.
  if (hasPassword === false || mustSetPassword) {
    return (
      <SetPasswordGate
        mode={mustSetPassword ? "reset" : "set"}
        reason={passwordCompromised ? "breach" : undefined}
        username={user?.phone ?? phone}
        onSignOut={signOut}
        onComplete={async () => {
          clearMustSetPassword();
          await refreshHumanRecord();
        }}
      />
    );
  }

  // Self-signup lifecycle (Join the Pack). A pending customer (approved_at
  // NULL) goes through the onboarding questions and then a "we're reviewing
  // you" hold — never the regular profile gate or dashboard. Approved /
  // existing customers read as "approved" and fall straight through.
  if (signup.loading) {
    return (
      <CenteredScreen fontClassName="font-['Montserrat',sans-serif]">
        <div className="w-full max-w-[400px] px-5 flex flex-col gap-4">
          <div className="h-8 w-40 mx-auto bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-48 bg-slate-200 rounded-xl animate-pulse" />
          <div className="h-12 bg-slate-200 rounded-lg animate-pulse" />
        </div>
      </CenteredScreen>
    );
  }

  if (signup.status === "onboarding") {
    return (
      <JoinThePackOnboarding
        humanRecord={humanRecord}
        onSignOut={signOut}
        onComplete={async () => {
          await refreshHumanRecord();
          await signup.refresh();
        }}
      />
    );
  }

  if (signup.status === "pending") {
    return (
      <PendingApprovalGate
        onSignOut={signOut}
        onRefresh={async () => {
          await refreshHumanRecord();
          await signup.refresh();
        }}
      />
    );
  }

  // Authenticated + matched, but profile incomplete — block the dashboard and
  // booking until name, surname, address and policy agreement are on file.
  if (gate.loading) {
    return (
      <CenteredScreen fontClassName="font-['Montserrat',sans-serif]">
        <div className="w-full max-w-[400px] px-5 flex flex-col gap-4">
          <div className="h-8 w-40 mx-auto bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-48 bg-slate-200 rounded-xl animate-pulse" />
          <div className="h-12 bg-slate-200 rounded-lg animate-pulse" />
        </div>
      </CenteredScreen>
    );
  }

  if (!gate.complete) {
    return (
      <ProfileGate
        humanRecord={humanRecord}
        onSignOut={signOut}
        onComplete={async () => {
          // Refresh the app-wide humanRecord (so the dashboard shows the
          // freshly-entered name/address) before clearing the gate.
          await refreshHumanRecord();
          await gate.refresh();
        }}
      />
    );
  }

  // Authenticated + matched + complete profile
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
