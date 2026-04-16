import {
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";

import { supabase } from "./supabase/client.js";
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
import { ErrorBoundary } from "./components/ui/ErrorBoundary.jsx";
import { ErrorBanner } from "./components/ui/ErrorBanner.jsx";
import { AppToolbar } from "./components/layout/AppToolbar.jsx";
import { CalendarTabs } from "./components/layout/CalendarTabs.jsx";
import { WeekCalendarView } from "./components/layout/WeekCalendarView.jsx";
import { ReportsView } from "./components/views/ReportsView.jsx";
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
const LoginPage = lazy(() =>
  import("./components/auth/LoginPage.jsx").then((module) => ({
    default: module.LoginPage,
  })),
);
import { NewBookingModal } from "./components/modals/NewBookingModal.jsx";
import { AddDogModal } from "./components/modals/AddDogModal.jsx";
import { AddHumanModal } from "./components/modals/AddHumanModal.jsx";

export default function App() {
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

  // --- Navigation (URL-based) ---
  const location = useLocation();
  const {
    selectedHumanId, setSelectedHumanId,
    selectedDogId, setSelectedDogId,
    showDatePicker, setShowDatePicker,
    showNewBooking, setShowNewBooking,
    showAddDogModal, setShowAddDogModal,
    showAddHumanModal, setShowAddHumanModal,
    rebookData, setRebookData,
    showRebookDatePicker, setShowRebookDatePicker,
    openNewBooking,
  } = useModalState();

  // --- Week navigation (extracted hook) ---
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
    [rawDatePick],
  );

  // --- Keyboard shortcuts ---
  useKeyboardShortcuts({
    activeOnPath: "/",
    currentPath: location.pathname,
    goToPrevWeek,
    goToNextWeek,
    jumpToToday: useCallback(() => rawDatePick(new Date()), [rawDatePick]),
    openNewBooking: useCallback(
      () => setShowNewBooking({ dateStr: currentDateStr, slot: "" }),
      [currentDateStr],
    ),
  });

  // --- Supabase hooks ---
  const {
    humans: sbHumans,
    humansById,
    loading: hl,
    error: he,
    updateHuman: sbUpdateHuman,
    addHuman: sbAddHuman,
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
    loading: dl,
    error: de,
    updateDog: sbUpdateDog,
    addDog: sbAddDog,
    fetchDogById,
    hasMore: dogsHasMore,
    totalCount: dogsTotalCount,
    loadMore: dogsLoadMore,
    searchDogs: dogsSearchDogs,
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
  } = useBookings(weekStart, dogsById, humansById);
  const {
    config: sbConfig,
    loading: cl,
    updateConfig: sbUpdateConfig,
  } = useSalonConfig();
  const {
    daySettings: sbDaySettings,
    loading: dsl,
    toggleDayOpen: sbToggleDayOpen,
    setOverride: sbSetOverride,
    addExtraSlot: sbAddExtraSlot,
    removeExtraSlot: sbRemoveExtraSlot,
  } = useDaySettings(weekStart);

  // --- Offline state (extracted hook) ---
  const offline = useOfflineState(weekStart, currentDateStr, currentDateObj);

  // --- Resolve online/offline booking actions ---
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

  // --- Derived state ---
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

  // --- Rebook logic (extracted hook) ---
  const { handleOpenRebook } = useRebookFlow({
    currentDateObj, daySettings, dayOpenState, bookingsByDate,
    setRebookData, setShowRebookDatePicker,
  });

  // --- Loading / Auth gates ---
  if (authLoading) {
    return (
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "20px 16px",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <LoadingSpinner />
      </div>
    );
  }

  if (isOnline && !user) {
    return (
      <Suspense
        fallback={
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 font-sans">
            <LoadingSpinner />
          </div>
        }
      >
        <LoginPage onSignIn={signIn} error={authError} isOffline={false} />
      </Suspense>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 font-sans">
        <LoadingSpinner />
      </div>
    );
  }

  // --- Render ---
  return (
    <ToastProvider>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 font-sans text-slate-800 pb-20 md:pb-5">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow-lg focus:text-sky-600 focus:font-medium"
      >
        Skip to content
      </a>
      {dataError && <ErrorBanner message={dataError} />}

      <AppToolbar
        onSignOut={signOut}
        isOnline={isOnline}
        user={user}
        weekNav={location.pathname === "/" ? (
          <CalendarTabs
            dates={dates}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            bookingsByDate={bookingsByDate}
            dayOpenState={dayOpenState}
            calendarMode="day"
          />
        ) : null}
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
        onOpenHuman={setSelectedHumanId}
        onOpenDog={setSelectedDogId}
        onRebook={handleOpenRebook}
      >
        <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner />}>
          <div id="main-content">
          <Routes>
            <Route path="/settings" element={
              <SettingsView
                config={salonConfig}
                onUpdateConfig={updateConfig}
                isOwner={isOwner}
                user={user}
                staffProfile={staffProfile}
              />
            } />
            <Route path="/humans" element={
              <HumansView
                humans={humans}
                dogs={dogs}
                onOpenHuman={setSelectedHumanId}
                onAddHuman={addHuman}
                hasMore={humansHasMore}
                totalCount={humansTotalCount}
                loadMore={humansLoadMore}
                onSearch={humansSearchHumans}
                searchQuery={humansSearchQuery}
                isSearching={humansIsSearching}
              />
            } />
            <Route path="/dogs" element={
              <DogsView
                dogs={dogs}
                humans={humans}
                onOpenDog={setSelectedDogId}
                onAddDog={addDog}
                onAddHuman={addHuman}
                hasMore={dogsHasMore}
                totalCount={dogsTotalCount}
                loadMore={dogsLoadMore}
                onSearch={dogsSearchDogs}
                searchQuery={dogsSearchQuery}
                isSearching={dogsIsSearching}
              />
            } />
            <Route path="/reports" element={<ReportsView />} />
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
                daySettings={daySettings}
                dayOpenState={dayOpenState}
                dogs={dogs}
                humans={humans}
                currentSettings={currentSettings}
                handleAdd={handleAdd}
                handleRemove={handleRemove}
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
                onOpenHuman={setSelectedHumanId}
                onRefresh={refetchBookings}
              />
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </div>
        </Suspense>
        </ErrorBoundary>

        {selectedHumanId && (
          <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <HumanCardModal
              humanId={selectedHumanId}
              onClose={() => setSelectedHumanId(null)}
              onOpenHuman={setSelectedHumanId}
              onOpenDog={setSelectedDogId}
              humans={humans}
              dogs={dogs}
              onUpdateHuman={updateHuman}
              onAddHuman={addHuman}
              bookingsByDate={bookingsByDate}
            />
          </Suspense>
          </ErrorBoundary>
        )}

        {selectedDogId && (
          <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <DogCardModal
              dogId={selectedDogId}
              onClose={() => setSelectedDogId(null)}
              onOpenHuman={setSelectedHumanId}
              dogs={dogs}
              humans={humans}
              onUpdateDog={updateDog}
              onUpdateHuman={updateHuman}
              onAddHuman={addHuman}
              bookingsByDate={bookingsByDate}
              fetchBookingHistoryForDog={sbFetchBookingHistoryForDog}
              fetchDogById={fetchDogById}
              handleAdd={handleAdd}
            />
          </Suspense>
          </ErrorBoundary>
        )}

        {showNewBooking && (
          <NewBookingModal
            onClose={() => setShowNewBooking(null)}
            onAdd={(bookingOrArray, dateStr) => {
              const list = Array.isArray(bookingOrArray) ? bookingOrArray : [bookingOrArray];
              list.forEach(b => handleAddToDate(b, b._bookingDate || dateStr));
              setShowNewBooking(null);
            }}
            dogs={dogs}
            humans={humans}
            bookingsByDate={bookingsByDate}
            dayOpenState={dayOpenState}
            daySettings={daySettings}
            onOpenAddDog={() => setShowAddDogModal(true)}
            onOpenAddHuman={() => setShowAddHumanModal(true)}
            initialDateStr={showNewBooking.dateStr}
            initialSlot={showNewBooking.slot}
            onSearchDogs={dogsSearchDogs}
            isSearchingDogs={dogsIsSearching}
          />
        )}

        {showAddDogModal && (
          <AddDogModal
            onClose={() => setShowAddDogModal(false)}
            onAdd={async (dogData) => {
              const result = await addDog(dogData);
              return result;
            }}
            humans={humans}
          />
        )}

        {showAddHumanModal && (
          <AddHumanModal
            onClose={() => setShowAddHumanModal(false)}
            onAdd={async (humanData) => {
              const result = await addHuman(humanData);
              return result;
            }}
          />
        )}
      </SalonProvider>
      <Analytics />
    </div>
    </ToastProvider>
  );
}
