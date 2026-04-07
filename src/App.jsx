import {
  useState,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { BRAND } from "./constants/index.js";
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
import { useRebookFlow } from "./hooks/useRebookFlow.js";
import { SalonProvider } from "./contexts/SalonContext.jsx";
import { LoadingSpinner } from "./components/ui/LoadingSpinner.jsx";
import { ErrorBanner } from "./components/ui/ErrorBanner.jsx";
import { AppToolbar } from "./components/layout/AppToolbar.jsx";
import { WeekCalendarView } from "./components/layout/WeekCalendarView.jsx";
import { ReportsView } from "./components/views/ReportsView.jsx";
const StatsView = lazy(() =>
  import("./components/views/StatsView.jsx").then((m) => ({ default: m.StatsView })),
);
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

  // --- Navigation & view state ---
  const [activeView, setActiveView] = useState("dashboard");
  const {
    selectedHumanId, setSelectedHumanId,
    selectedDogId, setSelectedDogId,
    showDatePicker, setShowDatePicker,
    showNewBooking, setShowNewBooking,
    showAddDogModal, setShowAddDogModal,
    showAddHumanModal, setShowAddHumanModal,
    rebookData, setRebookData,
    showRebookDatePicker, setShowRebookDatePicker,
    openNewBooking, closeNewBooking, closeRebook,
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

  // --- Online callbacks ---
  const onlineHandleAdd = useCallback(
    (booking, targetDateStr = currentDateStr) =>
      sbAddBooking(targetDateStr, booking),
    [sbAddBooking, currentDateStr],
  );
  const onlineHandleAddToDate = useCallback(
    (booking, dateStr) => sbAddBooking(dateStr, booking),
    [sbAddBooking],
  );
  const onlineHandleRemove = useCallback(
    (bookingId) => sbRemoveBooking(currentDateStr, bookingId),
    [sbRemoveBooking, currentDateStr],
  );
  const onlineToggleDayOpen = useCallback(
    () => sbToggleDayOpen(currentDateStr),
    [sbToggleDayOpen, currentDateStr],
  );
  const onlineHandleOverride = useCallback(
    (slot, seatIndex, action) =>
      sbSetOverride(currentDateStr, slot, seatIndex, action),
    [sbSetOverride, currentDateStr],
  );
  const onlineHandleAddSlot = useCallback(
    () => sbAddExtraSlot(currentDateStr),
    [sbAddExtraSlot, currentDateStr],
  );
  const onlineHandleRemoveSlot = useCallback(
    () => sbRemoveExtraSlot(currentDateStr),
    [sbRemoveExtraSlot, currentDateStr],
  );

  // --- Pick online or offline ---
  const dogs = isOnline ? sbDogs : offline.dogs;
  const humans = isOnline ? sbHumans : offline.humans;
  const bookingsByDate = isOnline ? sbBookings : offline.bookingsByDate;
  const salonConfig = isOnline ? sbConfig : offline.config;
  const daySettings = isOnline ? sbDaySettings : offline.daySettings;

  const isLoading = isOnline && (hl || dl || bl || cl || dsl);
  const dataError = he || de || be;

  const updateDog = isOnline ? sbUpdateDog : offline.updateDog;
  const updateHuman = isOnline ? sbUpdateHuman : offline.updateHuman;
  const updateConfig = isOnline ? sbUpdateConfig : offline.updateConfig;
  const addHuman = isOnline ? sbAddHuman : offline.addHuman;
  const addDog = isOnline ? sbAddDog : offline.addDog;
  const handleAdd = isOnline ? onlineHandleAdd : offline.handleAdd;
  const handleAddToDate = isOnline
    ? onlineHandleAddToDate
    : offline.handleAddToDate;
  const handleRemove = isOnline ? onlineHandleRemove : offline.handleRemove;
  const handleUpdate = isOnline ? sbUpdateBooking : offline.handleUpdate;
  const toggleDayOpen = isOnline ? onlineToggleDayOpen : offline.toggleDayOpen;
  const handleOverride = isOnline
    ? onlineHandleOverride
    : offline.handleOverride;
  const handleAddSlot = isOnline ? onlineHandleAddSlot : offline.handleAddSlot;
  const handleRemoveSlot = isOnline
    ? onlineHandleRemoveSlot
    : offline.handleRemoveSlot;

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
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 font-sans">
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 font-sans">
        <LoadingSpinner />
      </div>
    );
  }

  // --- Render ---
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 font-sans text-slate-800 pb-20 md:pb-5">
      {dataError && <ErrorBanner message={dataError} />}

      <AppToolbar
        activeView={activeView}
        setActiveView={setActiveView}
        onSignOut={signOut}
        isOnline={isOnline}
        user={user}
      />

      <SalonProvider
        dogs={dogs}
        humans={humans}
        bookingsByDate={bookingsByDate}
        daySettings={daySettings}
        dayOpenState={dayOpenState}
        currentDateStr={currentDateStr}
        currentDateObj={currentDateObj}
        onUpdate={handleUpdate}
        onRemove={handleRemove}
        onUpdateDog={updateDog}
        onOpenHuman={setSelectedHumanId}
        onOpenDog={setSelectedDogId}
        onRebook={handleOpenRebook}
      >
        <Suspense fallback={<LoadingSpinner />}>
          {activeView === "settings" ? (
            <SettingsView
              config={salonConfig}
              onUpdateConfig={updateConfig}
              isOwner={isOwner}
              user={user}
              staffProfile={staffProfile}
            />
          ) : activeView === "humans" ? (
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
          ) : activeView === "dogs" ? (
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
          ) : activeView === "reports" ? (
            <ReportsView />
          ) : activeView === "stats" ? (
            <StatsView />
          ) : (
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
            />
          )}
        </Suspense>

        {selectedHumanId && (
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
        )}

        {selectedDogId && (
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
              handleAdd={handleAdd}
            />
          </Suspense>
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
    </div>
  );
}
