import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  lazy,
  Suspense,
} from "react";
import { Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";

import { supabase } from "./supabase/client.js";
import { getStaffAuthRouteState } from "./components/auth/routeGuards.js";
import { getDefaultOpenForDate } from "./engine/utils.js";
import { useAuth } from "./supabase/hooks/useAuth.js";
import { useHumans } from "./supabase/hooks/useHumans.js";
import { useDogs } from "./supabase/hooks/useDogs.js";
import { useBookings } from "./supabase/hooks/useBookings.js";
import { useSalonConfig } from "./supabase/hooks/useSalonConfig.js";
import { useDaySettings } from "./supabase/hooks/useDaySettings.js";
import { useWeekNav } from "./hooks/useWeekNav.js";
import { useOfflineState } from "./hooks/useOfflineState.js";
import { useModalState } from "./hooks/useModalState.js";
import { useBookingActions } from "./hooks/useBookingActions.js";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.js";
import { useRebookFlow } from "./hooks/useRebookFlow.js";
import { SalonProvider } from "./contexts/SalonContext.js";
import { ToastProvider } from "./contexts/ToastContext.jsx";
import { LoadingSpinner } from "./components/ui/LoadingSpinner.jsx";
import { AppFrame } from "./components/ui/PageShell.jsx";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.jsx";
import { ErrorBanner } from "./components/ui/ErrorBanner.jsx";
import { OfflineDemoBanner } from "./components/ui/OfflineDemoBanner.jsx";
import { NetworkOfflineBanner } from "./components/ui/NetworkOfflineBanner.jsx";
import { AppToolbar } from "./components/layout/AppToolbar.jsx";
// Dev-only preview catalogue for the right-rail tones. Tree-shaken
// out of production bundles by Vite (the route below is gated on
// `import.meta.env.DEV`, which folds to `false` in prod).
const RightRailPreview = import.meta.env.DEV
  ? lazy(() =>
      import("./components/dev/RightRailPreview.jsx").then((module) => ({
        default: module.RightRailPreview,
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
const HumanCardModal = lazy(() =>
  import("./components/modals/HumanCardModal.jsx").then((module) => ({
    default: module.HumanCardModal,
  })),
);
const DogCardModal = lazy(() =>
  import("./components/modals/DogCardModal.jsx").then((module) => ({
    default: module.DogCardModal,
  })),
);
const SettingsView = lazy(() =>
  import("./components/views/SettingsView.jsx").then((module) => ({
    default: module.SettingsView,
  })),
);
const HumansView = lazy(() =>
  import("./components/views/HumansView.jsx").then((module) => ({
    default: module.HumansView,
  })),
);
const DogsView = lazy(() =>
  import("./components/views/DogsView.jsx").then((module) => ({
    default: module.DogsView,
  })),
);
const WeekCalendarView = lazy(() =>
  import("./components/layout/WeekCalendarView.jsx").then((module) => ({
    default: module.WeekCalendarView,
  })),
);
const ReportsView = lazy(() =>
  import("./components/views/ReportsView.jsx").then((module) => ({
    default: module.ReportsView,
  })),
);
const InboxView = lazy(() =>
  import("./components/views/inbox/InboxView.jsx").then((module) => ({
    default: module.InboxView,
  })),
);
const NewBookingModal = lazy(() =>
  import("./components/modals/NewBookingModal.jsx").then((module) => ({
    default: module.NewBookingModal,
  })),
);
const BookingDetailModal = lazy(() =>
  import("./components/modals/BookingDetailModal.jsx").then((module) => ({
    default: module.BookingDetailModal,
  })),
);
const AddDogModal = lazy(() =>
  import("./components/modals/AddDogModal.jsx").then((module) => ({
    default: module.AddDogModal,
  })),
);
const AddHumanModal = lazy(() =>
  import("./components/modals/AddHumanModal.jsx").then((module) => ({
    default: module.AddHumanModal,
  })),
);
const CollectionNoticeModal = lazy(() =>
  import("./components/modals/collection-notice/CollectionNoticeModal.jsx").then((module) => ({
    default: module.CollectionNoticeModal,
  })),
);
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
  } = useAuth();
  const isOnline = !!supabase;
  const from = location.state?.from;

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

function AuthedApp({ user, staffProfile, isOwner, signOut, isOnline }) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    selectedHumanId, setSelectedHumanId,
    selectedDogId, setSelectedDogId,
    showDatePicker, setShowDatePicker,
    showNewBooking, setShowNewBooking,
    showAddDogModal, setShowAddDogModal,
    showAddHumanModal, setShowAddHumanModal,
    rebookData, setRebookData,
    showRebookDatePicker, setShowRebookDatePicker,
    collectionNotice, setCollectionNotice,
    selectedBooking, setSelectedBooking,
    openNewBooking,
  } = useModalState();

  // ── Profile-page routing (task 4 of the May 2026 review) ───────
  // /dogs/:id and /humans/:id are shareable URLs that open the dog
  // or human profile. The route is the source of truth; the modal
  // state mirrors it for backward compat with non-URL callers (the
  // inbox customer context, the booking detail modal, etc.).
  useEffect(() => {
    const dogMatch = location.pathname.match(/^\/dogs\/([^/]+)$/);
    const humanMatch = location.pathname.match(/^\/humans\/([^/]+)$/);
    if (dogMatch && selectedDogId !== dogMatch[1]) {
      setSelectedDogId(dogMatch[1]);
    } else if (!dogMatch && location.pathname.startsWith("/dogs") && selectedDogId) {
      // /dogs (index) — close any modal that was opened from a profile URL
      setSelectedDogId(null);
    }
    if (humanMatch && selectedHumanId !== humanMatch[1]) {
      setSelectedHumanId(humanMatch[1]);
    } else if (!humanMatch && location.pathname.startsWith("/humans") && selectedHumanId) {
      setSelectedHumanId(null);
    }
  }, [
    location.pathname,
    selectedDogId,
    selectedHumanId,
    setSelectedDogId,
    setSelectedHumanId,
  ]);

  const handleOpenDog = useCallback(
    (id) => {
      if (!id) return;
      // Profile pages get a URL — call sites still pass through here so
      // direct navigation (e.g. /dogs/abc123 from a Slack share) and
      // in-app clicks land on the same modal.
      navigate(`/dogs/${id}`);
    },
    [navigate],
  );
  const handleOpenHuman = useCallback(
    (id) => {
      if (!id) return;
      navigate(`/humans/${id}`);
    },
    [navigate],
  );
  const handleCloseDogProfile = useCallback(() => {
    setSelectedDogId(null);
    if (/^\/dogs\/[^/]+$/.test(location.pathname)) navigate("/dogs");
  }, [navigate, location.pathname, setSelectedDogId]);
  const handleCloseHumanProfile = useCallback(() => {
    setSelectedHumanId(null);
    if (/^\/humans\/[^/]+$/.test(location.pathname)) navigate("/humans");
  }, [navigate, location.pathname, setSelectedHumanId]);

  const {
    weekStart,
    selectedDay,
    setSelectedDay,
    dates,
    currentDateObj,
    currentDateStr,
    currentDayConfig,
    goToNextWeek,
    goToPrevWeek,
    handleDatePick: rawDatePick,
  } = useWeekNav();

  const handleDatePick = useCallback(
    (pickedDate) => {
      rawDatePick(pickedDate);
      setShowDatePicker(false);
    },
    [rawDatePick, setShowDatePicker],
  );

  useKeyboardShortcuts({
    activeOnPath: "/",
    currentPath: location.pathname,
    goToPrevWeek,
    goToNextWeek,
    jumpToToday: useCallback(() => rawDatePick(new Date()), [rawDatePick]),
    openNewBooking: useCallback(
      () => setShowNewBooking({ dateStr: currentDateStr, slot: "" }),
      [currentDateStr, setShowNewBooking],
    ),
  });

  const {
    humans: sbHumans,
    humansById,
    loading: hl,
    error: he,
    updateHuman: sbUpdateHuman,
    addHuman: sbAddHuman,
    deleteHuman: sbDeleteHuman,
    fetchHumanById: sbFetchHumanById,
    findHumanByFullName: sbFindHumanByFullName,
    searchHumansByTerm: sbSearchHumansByTerm,
    ensureHumansByIds: sbEnsureHumansByIds,
    hasMore: humansHasMore,
    totalCount: humansTotalCount,
    loadMore: humansLoadMore,
    searchHumans: humansSearchHumans,
    searchQuery: humansSearchQuery,
    isSearching: humansIsSearching,
  } = useHumans();
  const {
    dogs: sbDogs,
    dogsById,
    dogsByHumanId,
    ensureDogsForHumans,
    ensureDogsByIds: sbEnsureDogsByIds,
    loading: dl,
    error: de,
    updateDog: sbUpdateDog,
    addDog: sbAddDog,
    deleteDog: sbDeleteDog,
    fetchDogById,
    hasMore: dogsHasMore,
    totalCount: dogsTotalCount,
    loadMore: dogsLoadMore,
    searchDogs: dogsSearchDogs,
    clearSearch: dogsClearSearch,
    searchQuery: dogsSearchQuery,
    isSearching: dogsIsSearching,
  } = useDogs(humansById);
  const {
    bookingsByDate: sbBookings,
    loading: bl,
    error: be,
    addBooking: sbAddBooking,
    removeBooking: sbRemoveBooking,
    updateBooking: sbUpdateBooking,
    fetchBookingHistoryForDog: sbFetchBookingHistoryForDog,
    refetch: refetchBookings,
  } = useBookings(weekStart, dogsById, humansById, {
    onReadyForPickup: setCollectionNotice,
  });
  const {
    config: sbConfig,
    loading: cl,
    updateConfig: sbUpdateConfig,
  } = useSalonConfig({ canSeed: isOwner });
  const {
    daySettings: sbDaySettings,
    loading: dsl,
    toggleDayOpen: sbToggleDayOpen,
    setOverride: sbSetOverride,
    addExtraSlot: sbAddExtraSlot,
    removeExtraSlot: sbRemoveExtraSlot,
  } = useDaySettings(weekStart);

  // ── Owner pre-fetch ────────────────────────────────────────────
  // useHumans paginates so the local map only holds the first page.
  // Without pre-fetching, every dog or booking whose owner sits past
  // the page boundary renders as "Unknown owner" because dog.humanId
  // falls back to the raw UUID and formatOwnerLabel refuses to render
  // that. ensureHumansByIds dedupes + caches so re-renders are cheap.
  useEffect(() => {
    if (!sbEnsureHumansByIds) return;
    const ids = new Set();
    for (const d of Object.values(sbDogs || {})) {
      if (d?._humanId) ids.add(d._humanId);
    }
    if (ids.size > 0) sbEnsureHumansByIds([...ids]);
  }, [sbDogs, sbEnsureHumansByIds]);

  useEffect(() => {
    if (!sbEnsureHumansByIds) return;
    const ids = new Set();
    for (const list of Object.values(sbBookings || {})) {
      for (const b of list || []) {
        if (b?._ownerId) ids.add(b._ownerId);
        if (b?._pickupById) ids.add(b._pickupById);
      }
    }
    if (ids.size > 0) sbEnsureHumansByIds([...ids]);
  }, [sbBookings, sbEnsureHumansByIds]);

  // Same pattern as the owner pre-fetch above, but for dogs. useDogs
  // paginates by name so any booking whose dog row sits past the first
  // page would render as "Unknown" on the day view (and lose its size,
  // breed and alerts in the detail modal). Resolving the missing rows
  // by id here closes that gap.
  useEffect(() => {
    if (!sbEnsureDogsByIds) return;
    const ids = new Set();
    for (const list of Object.values(sbBookings || {})) {
      for (const b of list || []) {
        if (b?._dogId) ids.add(b._dogId);
      }
    }
    if (ids.size > 0) sbEnsureDogsByIds([...ids]);
  }, [sbBookings, sbEnsureDogsByIds]);

  const offline = useOfflineState(weekStart, currentDateStr, currentDateObj);

  const {
    dogs, humans, bookingsByDate, salonConfig, daySettings,
    handleAdd, handleAddToDate, handleRemove, handleUpdate,
    toggleDayOpen, handleOverride, handleAddSlot, handleRemoveSlot,
    updateDog, updateHuman, updateConfig, addHuman, addDog,
  } = useBookingActions({
    isOnline,
    currentDateStr,
    supabase: {
      sbAddBooking, sbRemoveBooking, sbUpdateBooking,
      sbToggleDayOpen, sbSetOverride, sbAddExtraSlot, sbRemoveExtraSlot,
      sbUpdateDog, sbUpdateHuman, sbUpdateConfig, sbAddHuman, sbAddDog,
    },
    offline,
    onlineData: {
      dogs: sbDogs, humans: sbHumans, bookingsByDate: sbBookings,
      config: sbConfig, daySettings: sbDaySettings,
    },
  });

  const isLoading = isOnline && (hl || dl || cl || dsl);
  const bookingsLoading = bl;
  const dataError = he || de || be;
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => { setErrorDismissed(false); }, [dataError]);

  const currentSettings = daySettings[currentDateStr] || {
    isOpen: getDefaultOpenForDate(currentDateObj),
    overrides: {},
    extraSlots: [],
  };
  const dayOpenState = useMemo(() => {
    const state = {};
    for (const d of dates) {
      state[d.dateStr] =
        daySettings[d.dateStr]?.isOpen ?? getDefaultOpenForDate(d.dateObj);
    }
    return state;
  }, [dates, daySettings]);

  const { handleOpenRebook } = useRebookFlow({
    currentDateObj, daySettings, dayOpenState, bookingsByDate,
    setRebookData, setShowRebookDatePicker,
  });

  // Open a single booking's detail modal by id. Used by the human profile
  // (at-a-glance + booking history) which only has booking ids to hand.
  // The week calendar opens its own per-card BookingDetailModal; this is
  // the global entry point so any view can deep-open a booking.
  const handleOpenBooking = useCallback(
    (bookingId) => {
      if (!bookingId) return;
      for (const list of Object.values(bookingsByDate || {})) {
        const match = (list || []).find((b) => b.id === bookingId);
        if (match) {
          setSelectedBooking(match);
          return;
        }
      }
    },
    [bookingsByDate, setSelectedBooking],
  );

  // Task 11 of the May 2026 review pass: don't return a full-screen
  // overlay during the initial data fetch. Render the toolbar and
  // routes immediately; each view shows a skeleton when its own data
  // is still loading. Old behaviour blocked every navigation behind a
  // big spinner.
  return (
    <ToastProvider>
      <AppFrame className="text-slate-800 pb-20 md:pb-5">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow-lg focus:text-sky-600 focus:font-medium"
        >
          Skip to content
        </a>
        <OfflineDemoBanner isOnline={isOnline} />
        <NetworkOfflineBanner />
        {dataError && !errorDismissed && (
          <ErrorBanner message={dataError} onClose={() => setErrorDismissed(true)} />
        )}

        <AppToolbar
          onSignOut={signOut}
          isOnline={isOnline}
          user={user}
          onNewBooking={() => setShowNewBooking({ dateStr: currentDateStr, slot: "" })}
          onOpenOverview={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("smarterdog:open-overview"));
            }
          }}
        />

        <SalonProvider
          dogs={dogs}
          humans={humans}
          bookingsByDate={bookingsByDate}
          daySettings={daySettings}
          dayOpenState={dayOpenState}
          currentDateStr={currentDateStr}
          currentDateObj={currentDateObj}
          onAdd={handleAdd}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
          onUpdateDog={updateDog}
          onOpenHuman={handleOpenHuman}
          onOpenDog={handleOpenDog}
          onRebook={handleOpenRebook}
        >
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <main id="main-content">
                <Routes>
                  <Route path="/settings" element={
                    <SettingsView
                      config={salonConfig}
                      onUpdateConfig={updateConfig}
                      isOwner={isOwner}
                      canEdit={isOwner || !isOnline}
                      user={user}
                      staffProfile={staffProfile}
                    />
                  } />
                  <Route path="/humans" element={
                    <HumansView
                      humans={humans}
                      dogs={dogs}
                      dogsByHumanId={dogsByHumanId}
                      ensureDogsForHumans={ensureDogsForHumans}
                      onOpenHuman={handleOpenHuman}
                      onAddHuman={addHuman}
                      onUpdateDog={updateDog}
                      findHumanByFullName={sbFindHumanByFullName}
                      hasMore={humansHasMore}
                      totalCount={humansTotalCount}
                      loadMore={humansLoadMore}
                      onSearch={humansSearchHumans}
                      searchQuery={humansSearchQuery}
                      isSearching={humansIsSearching}
                      isInitialLoading={isLoading}
                      isOnline={isOnline}
                      loadError={he}
                    />
                  } />
                  {/* Profile route: shows the same HumansView underneath with the
                      profile modal opened by the URL → state effect. */}
                  <Route path="/humans/:id" element={
                    <HumansView
                      humans={humans}
                      dogs={dogs}
                      dogsByHumanId={dogsByHumanId}
                      ensureDogsForHumans={ensureDogsForHumans}
                      onOpenHuman={handleOpenHuman}
                      onAddHuman={addHuman}
                      onUpdateDog={updateDog}
                      findHumanByFullName={sbFindHumanByFullName}
                      hasMore={humansHasMore}
                      totalCount={humansTotalCount}
                      loadMore={humansLoadMore}
                      onSearch={humansSearchHumans}
                      searchQuery={humansSearchQuery}
                      isSearching={humansIsSearching}
                      loadError={he}
                      isInitialLoading={isLoading}
                      isOnline={isOnline}
                    />
                  } />
                  <Route path="/dogs" element={
                    <DogsView
                      dogs={dogs}
                      humans={humans}
                      onOpenDog={handleOpenDog}
                      onAddDog={addDog}
                      onAddHuman={addHuman}
                      hasMore={dogsHasMore}
                      totalCount={dogsTotalCount}
                      loadMore={dogsLoadMore}
                      onSearch={dogsSearchDogs}
                      searchQuery={dogsSearchQuery}
                      isSearching={dogsIsSearching}
                      isInitialLoading={isLoading}
                      isOnline={isOnline}
                      loadError={de}
                    />
                  } />
                  <Route path="/dogs/:id" element={
                    <DogsView
                      dogs={dogs}
                      humans={humans}
                      onOpenDog={handleOpenDog}
                      onAddDog={addDog}
                      onAddHuman={addHuman}
                      hasMore={dogsHasMore}
                      totalCount={dogsTotalCount}
                      loadMore={dogsLoadMore}
                      onSearch={dogsSearchDogs}
                      searchQuery={dogsSearchQuery}
                      isSearching={dogsIsSearching}
                      isInitialLoading={isLoading}
                      isOnline={isOnline}
                      loadError={de}
                    />
                  } />
                  <Route path="/reports" element={<ReportsView loadError={be || de || he} />} />
                  <Route path="/inbox" element={
                    <InboxView
                      onOpenHuman={handleOpenHuman}
                      onOpenDog={handleOpenDog}
                    />
                  } />
                  <Route path="/whatsapp" element={<Navigate to="/inbox" replace />} />
                  <Route path="/" element={
                    <WeekCalendarView
                      selectedDay={selectedDay}
                      setSelectedDay={setSelectedDay}
                      dates={dates}
                      currentDateObj={currentDateObj}
                      currentDateStr={currentDateStr}
                      currentDayConfig={currentDayConfig}
                      goToNextWeek={goToNextWeek}
                      goToPrevWeek={goToPrevWeek}
                      bookingsByDate={bookingsByDate}
                      bookingsLoading={bookingsLoading}
                      bookingsError={be}
                      daySettings={daySettings}
                      dayOpenState={dayOpenState}
                      dogs={dogs}
                      dogsByHumanId={dogsByHumanId}
                      ensureDogsForHumans={ensureDogsForHumans}
                      humans={humans}
                      currentSettings={currentSettings}
                      handleAdd={handleAdd}
                      handleRemove={handleRemove}
                      handleUpdate={handleUpdate}
                      handleOverride={handleOverride}
                      handleAddSlot={handleAddSlot}
                      handleRemoveSlot={handleRemoveSlot}
                      toggleDayOpen={toggleDayOpen}
                      showDatePicker={showDatePicker}
                      setShowDatePicker={setShowDatePicker}
                      handleDatePick={handleDatePick}
                      rebookData={rebookData}
                      setRebookData={setRebookData}
                      showRebookDatePicker={showRebookDatePicker}
                      setShowRebookDatePicker={setShowRebookDatePicker}
                      setShowNewBooking={setShowNewBooking}
                      onOpenHuman={handleOpenHuman}
                      onRefresh={refetchBookings}
                    />
                  } />
                  {import.meta.env.DEV && (
                    <Route
                      path="/dev/right-rail-preview"
                      element={<RightRailPreview />}
                    />
                  )}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </Suspense>
          </ErrorBoundary>

          {selectedHumanId && (
            <ErrorBoundary>
              <Suspense fallback={<LoadingSpinner />}>
                <HumanCardModal
                  humanId={selectedHumanId}
                  onClose={handleCloseHumanProfile}
                  onOpenHuman={handleOpenHuman}
                  onOpenDog={handleOpenDog}
                  humans={humans}
                  dogs={dogs}
                  dogsByHumanId={dogsByHumanId}
                  ensureDogsForHumans={ensureDogsForHumans}
                  onUpdateHuman={updateHuman}
                  onAddHuman={addHuman}
                  onDeleteHuman={sbDeleteHuman}
                  bookingsByDate={bookingsByDate}
                  fetchHumanById={sbFetchHumanById}
                  findHumanByFullName={sbFindHumanByFullName}
                  searchHumansByTerm={sbSearchHumansByTerm}
                  onNewBookingForHuman={(hid) => {
                    handleCloseHumanProfile();
                    setShowNewBooking({
                      dateStr: currentDateStr,
                      slot: "",
                      initialHumanId: hid,
                    });
                  }}
                  onSendMessage={(hid) => {
                    handleCloseHumanProfile();
                    navigate(`/inbox?human=${hid}`);
                  }}
                  onOpenBooking={handleOpenBooking}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {selectedDogId && (
            <ErrorBoundary>
              <Suspense fallback={<LoadingSpinner />}>
                <DogCardModal
                  dogId={selectedDogId}
                  onClose={handleCloseDogProfile}
                  onOpenHuman={handleOpenHuman}
                  dogs={dogs}
                  humans={humans}
                  onUpdateDog={updateDog}
                  onUpdateHuman={updateHuman}
                  onAddHuman={addHuman}
                  onDeleteDog={sbDeleteDog}
                  bookingsByDate={bookingsByDate}
                  fetchBookingHistoryForDog={sbFetchBookingHistoryForDog}
                  fetchDogById={fetchDogById}
                  handleAdd={handleAdd}
                  findHumanByFullName={sbFindHumanByFullName}
                  searchHumansByTerm={sbSearchHumansByTerm}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {showNewBooking && (
            <ErrorBoundary>
              <Suspense fallback={<LoadingSpinner />}>
                <NewBookingModal
                  onClose={() => {
                    setShowNewBooking(null);
                    dogsClearSearch();
                  }}
                  onAdd={(bookingOrArray, dateStr) => {
                    const list = Array.isArray(bookingOrArray) ? bookingOrArray : [bookingOrArray];
                    list.forEach(b => handleAddToDate(b, b._bookingDate || dateStr));
                    setShowNewBooking(null);
                    dogsClearSearch();
                  }}
                  dogs={dogs}
                  humans={humans}
                  dogsByHumanId={dogsByHumanId}
                  ensureDogsForHumans={ensureDogsForHumans}
                  bookingsByDate={bookingsByDate}
                  dayOpenState={dayOpenState}
                  daySettings={daySettings}
                  onOpenAddDog={() => setShowAddDogModal(true)}
                  onOpenAddHuman={() => setShowAddHumanModal(true)}
                  initialDateStr={showNewBooking.dateStr}
                  initialSlot={showNewBooking.slot}
                  initialHumanId={showNewBooking.initialHumanId}
                  initialStaffCapacityOverride={showNewBooking.capacityOverride === true}
                  sourceConversationId={showNewBooking.sourceConversationId}
                  sourceMessageText={showNewBooking.sourceMessageText}
                  ownerName={showNewBooking.ownerName}
                  onSearchDogs={dogsSearchDogs}
                  isSearchingDogs={dogsIsSearching}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {selectedBooking && (
            <ErrorBoundary>
              <Suspense fallback={null}>
                <BookingDetailModal
                  booking={selectedBooking}
                  onClose={() => setSelectedBooking(null)}
                  onAdd={handleAdd}
                  onRemove={handleRemove}
                  onOpenHuman={handleOpenHuman}
                  onOpenDog={handleOpenDog}
                  onUpdate={handleUpdate}
                  currentDateStr={currentDateStr}
                  currentDateObj={currentDateObj}
                  bookingsByDate={bookingsByDate}
                  dayOpenState={dayOpenState}
                  dogs={dogs}
                  humans={humans}
                  onUpdateDog={updateDog}
                  onRebook={handleOpenRebook}
                  daySettings={daySettings}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {showAddDogModal && (
            <ErrorBoundary>
              <Suspense fallback={<LoadingSpinner />}>
                <AddDogModal
                  onClose={() => setShowAddDogModal(false)}
                  onAdd={async (dogData) => {
                    const result = await addDog(dogData);
                    return result;
                  }}
                  humans={humans}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {showAddHumanModal && (
            <ErrorBoundary>
              <Suspense fallback={<LoadingSpinner />}>
                <AddHumanModal
                  onClose={() => setShowAddHumanModal(false)}
                  onAdd={async (humanData) => {
                    const result = await addHuman(humanData);
                    return result;
                  }}
                  dogs={dogs}
                  humans={humans}
                  onUpdateDog={updateDog}
                  findHumanByFullName={sbFindHumanByFullName}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {collectionNotice && (
            <ErrorBoundary>
              <Suspense fallback={null}>
                <CollectionNoticeModal
                  booking={collectionNotice}
                  onClose={() => setCollectionNotice(null)}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </SalonProvider>
        {import.meta.env.PROD ? <Analytics /> : null}
      </AppFrame>
    </ToastProvider>
  );
}
