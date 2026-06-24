import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";

import { supabase } from "./supabase/client.js";
import { getStaffAuthRouteState } from "./components/auth/routeGuards.js";
import { getDefaultOpenForDate } from "./engine/utils";
import { useAuth } from "./supabase/hooks/useAuth.js";
import { useHumans } from "./supabase/hooks/useHumans";
import { useDogs } from "./supabase/hooks/useDogs";
import { useBookings } from "./supabase/hooks/useBookings.js";
import { useSalonConfig } from "./supabase/hooks/useSalonConfig.js";
import { useDaySettings } from "./supabase/hooks/useDaySettings.js";
import { useWeekNav } from "./hooks/useWeekNav.js";
import { useDirectoryWarmup } from "./hooks/useDirectoryWarmup.js";
import { useOfflineState } from "./hooks/useOfflineState.js";
import { useModalState } from "./hooks/useModalState";
import { useBookingActions } from "./hooks/useBookingActions";
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

// Route-chunk warming: while the auth gate's spinner is up (user known,
// staff profile still fetching), start downloading the lazy chunk the
// current URL will need so it's cached by the time the gate clears. The
// import specifiers MUST match the lazy() declarations above exactly so
// Vite resolves them to the same chunks. Most-specific prefixes first;
// "/" is the catch-all (the week calendar).
const ROUTE_CHUNK_IMPORTS = [
  ["/inbox", () => import("./components/views/inbox/InboxView.jsx")],
  ["/dogs", () => import("./components/views/DogsView.jsx")],
  ["/humans", () => import("./components/views/HumansView.jsx")],
  ["/settings", () => import("./components/views/SettingsView.jsx")],
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
    pendingBooking, setPendingBooking,
    collectionNotice, setCollectionNotice,
    selectedBooking, setSelectedBooking,
  } = useModalState();

  // A booking-in-progress that staff parked to create a new dog/human mid-flow
  // (see parkBooking/resumeParkedBooking below). Mirrored in a ref so resume can
  // read the latest value synchronously even when called twice in one tick
  // (success path: onAdd resumes, then the modal's onClose fires too).
  const pendingBookingRef = useRef(null);
  // Friendly message from the most recent staff booking insert failure, written
  // by useBookings' onError below and read back (after the awaited insert) so the
  // booking modal can show it instead of a premature "Booking created" toast.
  const bookingInsertErrorRef = useRef(null);

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

  // Boot-path deferral for the two 50-row directory page-0 fetches: hold
  // them back until a directory route / the new-booking modal needs them,
  // or the browser goes idle (~2.5s). Targeted hydration (ensureDogsByIds /
  // ensureHumansByIds below) is independent of page-0 and still runs at
  // boot, so booking-card names keep resolving.
  const directoriesWarm = useDirectoryWarmup({
    newBookingOpen: !!showNewBooking,
  });

  const {
    humans: sbHumans,
    humansById,
    loading: hl,
    error: he,
    updateHuman: sbUpdateHuman,
    addHuman: sbAddHuman,
    deleteHuman: sbDeleteHuman,
    mergeHumans: sbMergeHumans,
    approveSignup: sbApproveSignup,
    rejectSignup: sbRejectSignup,
    fetchArchivedHumans: sbFetchArchivedHumans,
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
    directoryHumans: sbDirectoryHumans,
    availableLetters: sbAvailableLetters,
    dirSort: sbDirSort,
    setDirSort: sbSetDirSort,
    dirFilters: sbDirFilters,
    toggleDirFilter: sbToggleDirFilter,
    dirLetter: sbDirLetter,
    setDirLetter: sbSetDirLetter,
  } = useHumans({ startDirectoryFetch: directoriesWarm });
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
    // Server-driven directory list + controls
    directoryDogs: sbDirectoryDogs,
    dogAvailableLetters: sbDogAvailableLetters,
    dirSort: sbDogDirSort,
    setDirSort: sbSetDogDirSort,
    dirFilters: sbDogDirFilters,
    toggleDirFilter: sbToggleDogDirFilter,
    dirLetter: sbDogDirLetter,
    setDirLetter: sbSetDogDirLetter,
    fetchArchivedDogs: sbFetchArchivedDogs,
  } = useDogs(humansById, { startDirectoryFetch: directoriesWarm });
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
    // Capture the (already-friendly) insert error so the booking modal can
    // surface it after awaiting the save, rather than toasting a false success.
    onError: (msg) => {
      bookingInsertErrorRef.current = msg;
    },
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

  // ── New-customer cold start: park & resume the in-progress booking ──────
  // The booking wizard is dog-first, so onboarding a walk-in means stepping
  // out to create the dog/human. Rather than tearing the wizard down and
  // losing the staff member's date/slot/dog choices, we PARK the in-progress
  // booking, open the create modal, then RE-OPEN the wizard with their work
  // restored and the newly-created dog pre-selected. Pure client-side UI
  // state — the capacity trigger, the three BEFORE INSERT gates, RLS and the
  // staff-direct-INSERT write path are all untouched.
  const parkBooking = useCallback(
    (draft, which) => {
      pendingBookingRef.current = draft || null;
      setPendingBooking(draft || null);
      setShowNewBooking(null);
      dogsClearSearch();
      if (which === "human") setShowAddHumanModal(true);
      else setShowAddDogModal(true);
    },
    [
      setPendingBooking,
      setShowNewBooking,
      dogsClearSearch,
      setShowAddHumanModal,
      setShowAddDogModal,
    ],
  );

  // Re-open the parked booking, restoring its date/slot and dog entries and —
  // when a record was just created — selecting it. Guarded by the ref so the
  // double call on the success path (onAdd resume + the modal's onClose resume)
  // only re-opens once. A no-op when nothing was parked (e.g. the modal was
  // opened outside the booking flow), preserving the old standalone behaviour.
  const resumeParkedBooking = useCallback(
    ({ newDog = null, newHumanId = null } = {}) => {
      const draft = pendingBookingRef.current;
      pendingBookingRef.current = null;
      setPendingBooking(null);
      // Close the add modal and re-open the wizard in the SAME update so the two
      // never mount together (stacked focus-trapped dialogs would fight).
      setShowAddDogModal(false);
      setShowAddHumanModal(false);
      if (!draft) return;
      const entries = [...(draft.entries || [])];
      if (newDog) {
        entries.push({
          dog: newDog,
          humanKey: newDog.humanId || draft.owner?.label || "",
          service: "full-groom",
          addons: [],
        });
      }
      const hasEntries = entries.length > 0;
      setShowNewBooking({
        dateStr: draft.dateStr || currentDateStr,
        slot: draft.slot || "",
        initialEntries: hasEntries ? entries : undefined,
        initialHumanId:
          (newDog && (newDog._humanId || draft.owner?.id)) ||
          (!hasEntries && newHumanId) ||
          draft.owner?.id ||
          undefined,
      });
    },
    [
      setPendingBooking,
      setShowAddDogModal,
      setShowAddHumanModal,
      setShowNewBooking,
      currentDateStr,
    ],
  );

  // "Save & add another dog": append a just-created dog to the PARKED booking
  // without re-opening the wizard, so staff can register several dogs for one
  // customer in a single AddDogModal session. The final dog goes through the
  // normal onAdd -> resumeParkedBooking path, which appends it on top of these.
  // Pure client-side draft state — the capacity/booking gates are untouched.
  const appendDogToParked = useCallback(
    (newDog) => {
      const draft = pendingBookingRef.current;
      if (!draft || !newDog) return;
      const humanKey = newDog.humanId || draft.owner?.label || "";
      const owner =
        draft.owner ||
        (newDog._humanId ? { id: newDog._humanId, label: humanKey, phone: "" } : null);
      const next = {
        ...draft,
        owner,
        entries: [
          ...(draft.entries || []),
          { dog: newDog, humanKey, service: "full-groom", addons: [] },
        ],
      };
      pendingBookingRef.current = next;
      setPendingBooking(next);
    },
    [setPendingBooking],
  );

  // Owner to pre-lock in the add-dog modal when the parked booking already had
  // an owner (e.g. "+ New dog for <owner>"); null on a true cold start so the
  // modal shows its owner search + inline create instead.
  const pendingPresetOwner = pendingBooking?.owner || null;

  // Task 11 of the May 2026 review pass: don't return a full-screen
  // overlay during the initial data fetch. Render the toolbar and
  // routes immediately; each view shows a skeleton when its own data
  // is still loading. Old behaviour blocked every navigation behind a
  // big spinner.
  return (
    <ToastProvider>
      <AppFrame className="text-slate-800 pb-20 lg:pb-5">
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
          onUpdateHuman={updateHuman}
          onOpenHuman={handleOpenHuman}
          onOpenDog={handleOpenDog}
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
                      onUpdateHuman={updateHuman}
                      fetchArchivedHumans={sbFetchArchivedHumans}
                      findHumanByFullName={sbFindHumanByFullName}
                      hasMore={humansHasMore}
                      totalCount={humansTotalCount}
                      loadMore={humansLoadMore}
                      onSearch={humansSearchHumans}
                      searchQuery={humansSearchQuery}
                      isSearching={humansIsSearching}
                      directoryHumans={isOnline ? sbDirectoryHumans : null}
                      availableLetters={sbAvailableLetters}
                      sortMode={sbDirSort}
                      onSortModeChange={sbSetDirSort}
                      filters={sbDirFilters}
                      onToggleFilter={sbToggleDirFilter}
                      activeLetter={sbDirLetter}
                      onLetterChange={sbSetDirLetter}
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
                      onUpdateHuman={updateHuman}
                      fetchArchivedHumans={sbFetchArchivedHumans}
                      findHumanByFullName={sbFindHumanByFullName}
                      hasMore={humansHasMore}
                      totalCount={humansTotalCount}
                      loadMore={humansLoadMore}
                      onSearch={humansSearchHumans}
                      searchQuery={humansSearchQuery}
                      isSearching={humansIsSearching}
                      directoryHumans={isOnline ? sbDirectoryHumans : null}
                      availableLetters={sbAvailableLetters}
                      sortMode={sbDirSort}
                      onSortModeChange={sbSetDirSort}
                      filters={sbDirFilters}
                      onToggleFilter={sbToggleDirFilter}
                      activeLetter={sbDirLetter}
                      onLetterChange={sbSetDirLetter}
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
                      directoryDogs={isOnline ? sbDirectoryDogs : null}
                      availableLetters={sbDogAvailableLetters}
                      sortMode={sbDogDirSort}
                      onSortModeChange={sbSetDogDirSort}
                      filters={sbDogDirFilters}
                      onToggleFilter={sbToggleDogDirFilter}
                      activeLetter={sbDogDirLetter}
                      onLetterChange={sbSetDogDirLetter}
                      fetchArchivedDogs={sbFetchArchivedDogs}
                      onUpdateDog={sbUpdateDog}
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
                      directoryDogs={isOnline ? sbDirectoryDogs : null}
                      availableLetters={sbDogAvailableLetters}
                      sortMode={sbDogDirSort}
                      onSortModeChange={sbSetDogDirSort}
                      filters={sbDogDirFilters}
                      onToggleFilter={sbToggleDogDirFilter}
                      activeLetter={sbDogDirLetter}
                      onLetterChange={sbSetDogDirLetter}
                      fetchArchivedDogs={sbFetchArchivedDogs}
                      onUpdateDog={sbUpdateDog}
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
                      handleRemove={handleRemove}
                      handleUpdate={handleUpdate}
                      handleOverride={handleOverride}
                      handleAddSlot={handleAddSlot}
                      handleRemoveSlot={handleRemoveSlot}
                      toggleDayOpen={toggleDayOpen}
                      showDatePicker={showDatePicker}
                      setShowDatePicker={setShowDatePicker}
                      handleDatePick={handleDatePick}
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
                  onAddDog={addDog}
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
                  onBookAgain={(booking) => {
                    handleCloseHumanProfile();
                    setShowNewBooking({
                      dateStr: currentDateStr,
                      slot: "",
                      initialHumanId: booking._ownerId || selectedHumanId,
                      initialDogId: booking._dogId,
                      initialService: booking.service,
                      initialAddons: booking.addons || [],
                    });
                  }}
                  onMergeHumans={sbMergeHumans}
                  onArchiveHuman={(hid) =>
                    updateHuman(hid, { archivedAt: new Date().toISOString() })
                  }
                  onApproveSignup={sbApproveSignup}
                  onRejectSignup={sbRejectSignup}
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
                  fetchHumanById={sbFetchHumanById}
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
                  onAdd={async (bookingOrArray, dateStr) => {
                    // Truthful save: await the real insert(s) and report the
                    // outcome so the modal only toasts success once the DB
                    // accepts the booking. handleAddToDate resolves to the saved
                    // booking (online), null on a DB rejection — e.g. a
                    // capacity/duplicate race after the client preflight — or
                    // undefined (offline optimistic add, always fine).
                    bookingInsertErrorRef.current = null;
                    const list = Array.isArray(bookingOrArray) ? bookingOrArray : [bookingOrArray];
                    const results = await Promise.all(
                      list.map((b) => handleAddToDate(b, b._bookingDate || dateStr)),
                    );
                    const ok = results.every((r) => r !== null && r !== false);
                    return {
                      ok,
                      error: ok
                        ? null
                        : bookingInsertErrorRef.current ||
                          "Couldn't save the booking — please try again.",
                    };
                  }}
                  dogs={dogs}
                  humans={humans}
                  dogsByHumanId={dogsByHumanId}
                  ensureDogsForHumans={ensureDogsForHumans}
                  bookingsByDate={bookingsByDate}
                  dayOpenState={dayOpenState}
                  daySettings={daySettings}
                  onBookAnother={(ownerId) =>
                    setShowNewBooking({
                      dateStr: currentDateStr,
                      slot: "",
                      initialHumanId: ownerId,
                    })
                  }
                  onOpenAddDog={(draft) => parkBooking(draft, "dog")}
                  onOpenAddHuman={(draft) => parkBooking(draft, "human")}
                  initialDateStr={showNewBooking.dateStr}
                  initialSlot={showNewBooking.slot}
                  initialHumanId={showNewBooking.initialHumanId}
                  initialDogId={showNewBooking.initialDogId}
                  initialEntries={showNewBooking.initialEntries}
                  initialService={showNewBooking.initialService}
                  initialAddons={showNewBooking.initialAddons}
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
                  onUpdateHuman={updateHuman}
                  daySettings={daySettings}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {showAddDogModal && (
            <ErrorBoundary>
              <Suspense fallback={<LoadingSpinner />}>
                <AddDogModal
                  onClose={() => {
                    setShowAddDogModal(false);
                    // Cancel: re-open the parked booking with their work intact
                    // (no new dog). No-op if nothing was parked, or already
                    // resumed by a successful add below.
                    resumeParkedBooking();
                  }}
                  onAdd={async (dogData) => {
                    const result = await addDog(dogData);
                    // Success: re-open the booking with the new dog selected so
                    // staff don't have to re-search for the dog they just made.
                    if (result) resumeParkedBooking({ newDog: result });
                    return result;
                  }}
                  onAddAnother={async (dogData) => {
                    const result = await addDog(dogData);
                    // Accumulate into the parked booking and keep the add-dog
                    // modal open so the next dog for this customer is one form away.
                    if (result) appendDogToParked(result);
                    return result;
                  }}
                  onAddHuman={addHuman}
                  presetOwner={pendingPresetOwner}
                  humans={humans}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {showAddHumanModal && (
            <ErrorBoundary>
              <Suspense fallback={<LoadingSpinner />}>
                <AddHumanModal
                  onClose={() => {
                    setShowAddHumanModal(false);
                    // Cancel: re-open the parked booking (no new dog/human).
                    resumeParkedBooking();
                  }}
                  onAdd={async (humanData) => {
                    const result = await addHuman(humanData);
                    // Success: re-open the booking pre-filled with the new
                    // owner so staff can pick or add their dog without a
                    // re-search.
                    if (result) {
                      resumeParkedBooking({ newHumanId: result.id || result?.[0]?.id });
                    }
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
        {import.meta.env.PROD ? (
          <Suspense fallback={null}>
            <Analytics />
          </Suspense>
        ) : null}
      </AppFrame>
    </ToastProvider>
  );
}
