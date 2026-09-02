import { useCallback, useEffect, lazy, Suspense } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";

import { supabase } from "./supabase/client";
import { getStaffAuthRouteState } from "./components/auth/routeGuards.js";
import { FEATURE_FLAGS } from "./constants/features";
import { safeGet, safeSet } from "./lib/storage";
import { useAuth } from "./supabase/hooks/useAuth";
import { useWeekNav } from "./hooks/useWeekNav";
import { useDirectoryWarmup } from "./hooks/useDirectoryWarmup";
import { useModalState } from "./hooks/useModalState";
import { useStaffAppData } from "./hooks/useStaffAppData";
import { useBookingSession } from "./hooks/useBookingSession";
import { useProfileRouting } from "./hooks/useProfileRouting";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { SalonProvider } from "./contexts/SalonContext";
import { ToastProvider } from "./contexts/ToastContext.jsx";
import { LoadingSpinner } from "./components/ui/LoadingSpinner.jsx";
import { AppFrame } from "./components/ui/PageShell.jsx";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.jsx";
import { ErrorBanner } from "./components/ui/ErrorBanner.jsx";
import { OfflineDemoBanner } from "./components/ui/OfflineDemoBanner.jsx";
import { NetworkOfflineBanner } from "./components/ui/NetworkOfflineBanner.jsx";
import { AppToolbar } from "./components/layout/AppToolbar.jsx";
import { AppContextRow } from "./components/layout/AppContextRow.jsx";
import { MobileNavStrip } from "./components/layout/MobileNavStrip.jsx";
import { StaffRoutes } from "./components/layout/StaffRoutes.jsx";
import { StaffModals } from "./components/layout/StaffModals.jsx";

// Vercel page-view analytics. Dynamically imported so the library stays out
// of the App chunk's boot path — it renders nothing and can arrive whenever.
// PROD-gated the same way it was rendered before; dev gets a no-op.
const Analytics = import.meta.env.PROD
  ? lazy(() =>
      import("@vercel/analytics/react").then((module) => ({
        default: module.Analytics,
      })),
    )
  : () => null;
// Dev-only kitchen-sink catalogue for the shared UI primitives + tokens.
// Same tree-shaking guarantee as RightRailPreview above.
const UiKitchenSink = import.meta.env.DEV
  ? lazy(() =>
      import("./components/dev/UiKitchenSink.jsx").then((module) => ({
        default: module.UiKitchenSink,
      })),
    )
  : () => null;
// Dev-only harness for the customer booking wizard's responsive shell
// (the wizard doesn't fit here otherwise — its real steps fetch live data
// from an authenticated customer session). Same tree-shaking guarantee.

const LoginPage = lazy(() =>
  import("./components/auth/LoginPage.jsx").then((module) => ({
    default: module.LoginPage,
  })),
);

const appLoadingShell = (
  <AppFrame>
    <LoadingSpinner />
  </AppFrame>
);

// Route-chunk warming: while the auth gate's spinner is up (user known,
// staff profile still fetching), start downloading the lazy chunk the
// current URL will need so it's cached by the time the gate clears. The
// import specifiers MUST match the lazy() declarations above exactly so
// Vite resolves them to the same chunks. Most-specific prefixes first;
// "/" is the catch-all (the week calendar).
const ROUTE_CHUNK_IMPORTS = [
  ["/today", () => import("./components/views/TodayView.jsx")],
  ["/booking-workspace", () => import("./components/views/booking-workspace/BookingWorkspaceView.jsx")],
  ["/inbox", () => import("./components/views/inbox/InboxView.jsx")],
  ["/dogs", () => import("./components/views/DogsView.jsx")],
  ["/humans", () => import("./components/views/HumansView.jsx")],
  ["/settings", () => import("./components/views/SettingsView.jsx")],
  ["/needs-attention", () => import("./components/views/NeedsAttentionView.jsx")],
  ["/reports", () => import("./components/views/reports/ReportsLayout.jsx")],
  ["/", () => import("./components/layout/WeekCalendarView.jsx")],
];
let routeChunkWarmed = false;
function warmRouteChunkOnce(pathname) {
  if (routeChunkWarmed) return;
  routeChunkWarmed = true;
  const match = ROUTE_CHUNK_IMPORTS.find(
    ([prefix]) => prefix === "/" || pathname.startsWith(prefix),
  );
  // Failures swallowed — it's a warmup; the real lazy() load surfaces errors.
  match?.[1]().catch(() => {});
}

// Top-level App: only handles auth state + the auth gate.
// Data hooks live in <AuthedApp /> so they don't fire pre-auth (which used to
// produce 406 noise on /login because RLS denied salon_config to anon callers).
export default function App() {
  const location = useLocation();
  const {
    user,
    staffProfile,
    loading: authLoading,
    error: authError,
    signIn,
    signOut,
    isOwner,
    passwordCompromised,
    clearPasswordCompromised,
  } = useAuth();
  const isOnline = !!supabase;
  const from = location.state?.from;

  // Warm the current route's lazy chunk as soon as a user exists — i.e.
  // during the auth-gate spinner, in parallel with the staff-profile fetch.
  useEffect(() => {
    if (!user) return;
    warmRouteChunkOnce(window.location.pathname);
  }, [user]);

  // Dev-only: render the UI kitchen sink before the auth gate so the primitive
  // catalogue is reviewable without signing in. Tree-shaken from production
  // (import.meta.env.DEV folds to false). Placed after the hooks above to keep
  // hook order stable.
  if (import.meta.env.DEV && location.pathname === "/dev/ui") {
    return (
      <Suspense fallback={appLoadingShell}>
        <UiKitchenSink />
      </Suspense>
    );
  }

  const authRoute = getStaffAuthRouteState({
    isOnline,
    loading: authLoading,
    user,
    staffProfile,
    location: {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    },
    from,
  });

  if (authRoute.status === "loading") {
    return appLoadingShell;
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
      <Suspense fallback={appLoadingShell}>
        <LoginPage onSignIn={signIn} error={authError} isOffline={false} />
      </Suspense>
    );
  }

  if (authRoute.status === "denied") {
    return <StaffAccessDeniedPage user={user} onSignOut={signOut} />;
  }

  return (
    <AuthedApp
      user={user}
      staffProfile={staffProfile}
      isOwner={isOwner}
      signOut={signOut}
      isOnline={isOnline}
      passwordCompromised={passwordCompromised}
      onDismissPasswordWarning={clearPasswordCompromised}
    />
  );
}

function StaffAccessDeniedPage({ user, onSignOut }) {
  return (
    <AppFrame>
      <div className="max-w-[420px] mx-auto mt-20 px-5 font-sans">
        <div className="text-center mb-8">
          <div className="text-[28px] font-display font-bold text-brand-purple">
            Smarter<span className="text-brand-yellow">Dog</span>
          </div>
          <div className="text-body text-slate-500 mt-1">Salon Bookings</div>
        </div>

        <div className="bg-white rounded-2xl p-7 border border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.06)] text-center">
          <div className="text-lg font-extrabold text-brand-purple mb-2">
            Staff access needed
          </div>
          <div className="text-body text-slate-500 mb-5 leading-relaxed">
            {user?.email || "This account"} is signed in with Supabase Auth, but it does not have a staff profile for this salon.
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full py-3 rounded-full border-none text-sm font-bold font-[inherit] bg-action text-on-action cursor-pointer hover:bg-brand-yellow-dark"
          >
            Sign out
          </button>
        </div>
      </div>
    </AppFrame>
  );
}

// The authenticated staff shell. Composes:
//   useModalState      — which modal is open
//   useProfileRouting  — /dogs/:id + /humans/:id ↔ profile modal
//   useWeekNav         — the calendar week + selected day
//   useStaffAppData    — every data hook, online/offline resolved
//   useBookingSession  — the new-booking drawer's session + park/resume
// and renders the toolbar, <StaffRoutes> and <StaffModals>. Views and
// modals receive the same props they always did (see those components).
function AuthedApp({
  user,
  staffProfile,
  isOwner,
  signOut,
  isOnline,
  passwordCompromised = false,
  onDismissPasswordWarning,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const canAccessBookingWorkspace =
    FEATURE_FLAGS.booking_workspace_enabled &&
    (isOwner || (import.meta.env.DEV && !isOnline));

  const modals = useModalState();
  const {
    selectedHumanId,
    setSelectedHumanId,
    selectedDogId,
    setSelectedDogId,
    showDatePicker,
    setShowDatePicker,
    showNewBooking,
    setShowNewBooking,
    setShowAddDogModal,
    setShowNewClient,
    pendingBooking,
    setPendingBooking,
    setCollectionNotice,
    setSelectedBooking,
  } = modals;

  const profile = useProfileRouting({
    selectedDogId,
    setSelectedDogId,
    selectedHumanId,
    setSelectedHumanId,
  });

  // A staff push-notification click focuses this window and asks it to route
  // here via React Router (no full reload — see public/push-sw.js). Only honour
  // same-app absolute paths; ignore the customer portal and anything malformed.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;
    const onMessage = (event) => {
      const data = event.data;
      if (
        data?.type === "sw-navigate" &&
        typeof data.url === "string" &&
        data.url.startsWith("/") &&
        !data.url.startsWith("/customer")
      ) {
        navigate(data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  const weekNav = useWeekNav();
  const {
    weekStart,
    dates,
    currentDateObj,
    currentDateStr,
    goToNextWeek,
    goToPrevWeek,
    handleDatePick: rawDatePick,
  } = weekNav;

  const handleDatePick = useCallback(
    (pickedDate) => {
      rawDatePick(pickedDate);
      setShowDatePicker(false);
    },
    [rawDatePick, setShowDatePicker],
  );
  const nav = { ...weekNav, handleDatePick };

  // Land on the Today command centre once per tab session (post-login / first
  // open). `/` stays the calendar and is reachable via the nav + "Open
  // calendar" — only the initial default entry redirects, so a staff member
  // who then clicks through to the calendar is never bounced back.
  useEffect(() => {
    if (safeGet("session", "sd-today-landed") === "1") return;
    safeSet("session", "sd-today-landed", "1");
    if (location.pathname === "/") navigate("/today", { replace: true });
    // Runs once on mount by design (the post-auth entry point).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Boot-path deferral for the two 50-row directory page-0 fetches: hold
  // them back until a directory route / the new-booking modal needs them,
  // or the browser goes idle (~2.5s). Targeted hydration (ensureDogsByIds /
  // ensureHumansByIds inside useStaffAppData) is independent of page-0 and
  // still runs at boot, so booking-card names keep resolving.
  const directoriesWarm = useDirectoryWarmup({
    newBookingOpen: !!showNewBooking,
  });

  // A booking flipping to ready-for-pickup (realtime, or staff pressing
  // "send collection notice") opens the collection-notice modal.
  const openCollectionNotice = useCallback(
    (booking) => setCollectionNotice({ booking }),
    [setCollectionNotice],
  );

  const data = useStaffAppData({
    isOnline,
    isOwner,
    weekStart,
    dates,
    currentDateStr,
    currentDateObj,
    directoriesWarm,
    onReadyForPickup: openCollectionNotice,
  });
  const { bookingsByDate, bookingsApi, dogsApi, salonConfig } = data;
  const { fetchBookingForVisit } = bookingsApi;

  const session = useBookingSession({
    showNewBooking,
    setShowNewBooking,
    pendingBooking,
    setPendingBooking,
    setShowAddDogModal,
    clearDogSearch: dogsApi.clearSearch,
    currentDateStr,
  });
  const { requestNewBooking } = session;

  useKeyboardShortcuts({
    activeOnPath: "/",
    currentPath: location.pathname,
    goToPrevWeek,
    goToNextWeek,
    jumpToToday: useCallback(() => rawDatePick(new Date()), [rawDatePick]),
    openNewBooking: useCallback(
      () => requestNewBooking({ dateStr: currentDateStr, slot: "" }),
      [currentDateStr, requestNewBooking],
    ),
  });

  const openNewClient = useCallback(() => setShowNewClient(true), [setShowNewClient]);

  // Open a single booking's detail modal by id. Used by the human profile
  // (at-a-glance + booking history) which only has booking ids to hand.
  // The week calendar opens its own per-card BookingDetailModal; this is
  // the global entry point so any view can deep-open a booking.
  const handleOpenBooking = useCallback(
    (bookingId, fallbackBooking = null) => {
      if (!bookingId) return;
      for (const list of Object.values(bookingsByDate || {})) {
        const match = (list || []).find((b) => b.id === bookingId);
        if (match) {
          setSelectedBooking(match);
          return;
        }
      }
      // Dog grooming history is fetched independently of the currently
      // loaded calendar week. It supplies the fully transformed booking so
      // older appointments can still open in the shared appointment card.
      if (fallbackBooking?.id === bookingId) {
        setSelectedBooking(fallbackBooking);
      }
    },
    [bookingsByDate, setSelectedBooking],
  );

  const handleOpenClosureVisit = useCallback(
    async (visitId) => {
      const result = await fetchBookingForVisit(visitId);
      if (result?.ok === false || !result?.booking) return result;

      const booking = result.booking;
      if (booking._bookingDate) {
        handleDatePick(new Date(`${booking._bookingDate}T12:00:00`));
      }
      handleOpenBooking(booking.id, booking);
      return { ok: true };
    },
    [fetchBookingForVisit, handleDatePick, handleOpenBooking],
  );

  // Task 11 of the May 2026 review pass: don't return a full-screen
  // overlay during the initial data fetch. Render the toolbar and
  // routes immediately; each view shows a skeleton when its own data
  // is still loading. Old behaviour blocked every navigation behind a
  // big spinner.
  return (
    <ToastProvider>
      {/* Bottom padding clears the iOS home indicator + Safari's collapsed
          toolbar so the last card is never trapped behind browser chrome. */}
      <AppFrame className="text-slate-800 max-lg:pt-0 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow-lg focus:text-sky-600 focus:font-medium"
        >
          Skip to content
        </a>
        <OfflineDemoBanner isOnline={isOnline} />
        <NetworkOfflineBanner />
        {data.dataError && !data.errorDismissed && (
          <ErrorBanner message={data.dataError} onClose={data.dismissError} />
        )}
        {passwordCompromised && (
          <ErrorBanner
            title="Your password has appeared in a data breach"
            message="It still works, but it isn't safe to keep. Sign out, choose “Forgot password?” on the login screen and set a new one."
            onClose={onDismissPasswordWarning}
          />
        )}

        <AppToolbar
          onSignOut={signOut}
          isOnline={isOnline}
          user={user}
          currentDateStr={currentDateStr}
          showBookingWorkspace={canAccessBookingWorkspace}
          onNewBooking={() => requestNewBooking({ dateStr: currentDateStr, slot: "" })}
          onNewClient={openNewClient}
          onOpenOverview={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("smarterdog:open-overview"));
            }
          }}
        />

        <MobileNavStrip
          currentDateStr={currentDateStr}
          showBookingWorkspace={canAccessBookingWorkspace}
        />

        <SalonProvider
          dogs={data.dogs}
          humans={data.humans}
          bookingsByDate={bookingsByDate}
          daySettings={data.daySettings}
          dayOpenState={data.dayOpenState}
          currentDateStr={currentDateStr}
          currentDateObj={currentDateObj}
          onAdd={data.handleAdd}
          onUpdate={data.handleUpdate}
          onRemove={data.handleRemove}
          onUpdateDog={data.updateDog}
          onUpdateHuman={data.updateHuman}
          onAddHuman={data.addHuman}
          onAddDog={data.addDog}
          dogsByHumanId={dogsApi.dogsByHumanId}
          ensureDogsForHumans={dogsApi.ensureDogsForHumans}
          isOnline={isOnline}
          bookingsLoading={data.bookingsLoading}
          bookingsError={data.loadErrors.bookings}
          fetchHumanById={data.humansApi.fetchHumanById}
          findHumanByFullName={data.humansApi.findHumanByFullName}
          searchHumansByTerm={data.humansApi.searchHumansByTerm}
          onOpenHuman={profile.openHuman}
          onOpenDog={profile.openDog}
          configPricing={salonConfig?.pricing}
        >
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <main id="main-content">
                <AppContextRow
                  dateLabel={currentDateObj.toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  onNavigateDay={(delta) => {
                    const target = new Date(currentDateObj);
                    target.setDate(target.getDate() + delta);
                    handleDatePick(target);
                  }}
                  onGoToday={() => {
                    handleDatePick(new Date());
                  }}
                />
                <StaffRoutes
                  data={data}
                  nav={nav}
                  ui={{
                    user,
                    staffProfile,
                    isOwner,
                    isOnline,
                    canAccessBookingWorkspace,
                    showDatePicker,
                    setShowDatePicker,
                    showNewBooking,
                    draftTarget: session.draftTarget,
                    requestNewBooking,
                    openNewClient,
                    onOpenDog: profile.openDog,
                    onOpenHuman: profile.openHuman,
                    onOpenBooking: handleOpenBooking,
                    onOpenClosureVisit: handleOpenClosureVisit,
                    onSendCollection: openCollectionNotice,
                  }}
                />
              </main>
            </Suspense>
          </ErrorBoundary>

          <StaffModals
            data={data}
            nav={nav}
            modals={modals}
            session={session}
            ui={{
              pathname: location.pathname,
              navigate,
              onOpenDog: profile.openDog,
              onOpenHuman: profile.openHuman,
              onOpenBooking: handleOpenBooking,
              onCloseDogProfile: profile.closeDogProfile,
              onCloseHumanProfile: profile.closeHumanProfile,
            }}
          />
        </SalonProvider>
        {import.meta.env.PROD ? (
          <Suspense fallback={null}>
            <Analytics />
          </Suspense>
        ) : null}
      </AppFrame>
    </ToastProvider>
  );
}
