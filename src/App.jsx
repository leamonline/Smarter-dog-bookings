import {
  useState,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import {
  BRAND,
  ALL_DAYS,
  SALON_SLOTS,
} from "./constants/index.js";
import { canBookSlot } from "./engine/capacity.js";
import { supabase } from "./supabase/client.js";
import { toDateStr } from "./supabase/transforms.js";
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
import { SalonProvider } from "./contexts/SalonContext.jsx";
import { LoadingSpinner } from "./components/ui/LoadingSpinner.jsx";
import { ErrorBanner } from "./components/ui/ErrorBanner.jsx";
import { AppToolbar } from "./components/layout/AppToolbar.jsx";
import { WeekCalendarView } from "./components/layout/WeekCalendarView.jsx";
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
  } = useHumans();
  const {
    dogs: sbDogs,
    dogsById,
    loading: dl,
    error: de,
    updateDog: sbUpdateDog,
    addDog: sbAddDog,
  } = useDogs(humansById);
  const {
    bookingsByDate: sbBookings,
    loading: bl,
    error: be,
    addBooking: sbAddBooking,
    removeBooking: sbRemoveBooking,
    updateBooking: sbUpdateBooking,
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

  // --- Rebook logic ---
  const handleOpenRebook = useCallback(
    (booking) => {
      const targetDate = currentDateObj;
      const targetDateStr = toDateStr(targetDate);
      const targetSettings = daySettings[targetDateStr] || {
        isOpen:
          dayOpenState[targetDateStr] ?? getDefaultOpenForDate(targetDate),
        overrides: {},
        extraSlots: [],
      };
      const targetSlots = [
        ...SALON_SLOTS,
        ...(targetSettings.extraSlots || []),
      ];
      const targetBookings = bookingsByDate[targetDateStr] || [];

      const defaultSlot =
        targetSlots.find(
          (slot) =>
            canBookSlot(targetBookings, slot, booking.size, targetSlots, {
              overrides: targetSettings.overrides?.[slot] || {},
            }).allowed,
        ) || "";

      setRebookData({
        ...booking,
        date: targetDate,
        dateStr: targetDateStr,
        slot: defaultSlot,
        status: "Not Arrived",
        payment: "Due at Pick-up",
        confirmed: false,
      });
      setShowRebookDatePicker(false);
    },
    [currentDateObj, daySettings, dayOpenState, bookingsByDate],
  );

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
        }
      >
        <LoginPage onSignIn={signIn} error={authError} isOffline={false} />
      </Suspense>
    );
  }

  if (isLoading) {
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

  // --- Render ---
  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: BRAND.text,
        padding: "20px 16px",
      }}
    >
      {dataError && <ErrorBanner message={dataError} />}

      <AppToolbar
        activeView={activeView}
        setActiveView={setActiveView}
        onNewBooking={() => setShowNewBooking({ dateStr: currentDateStr, slot: "" })}
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
              onBack={() => setActiveView("dashboard")}
              config={salonConfig}
              onUpdateConfig={updateConfig}
              isOwner={isOwner}
            />
          ) : activeView === "humans" ? (
            <HumansView
              humans={humans}
              dogs={dogs}
              onOpenHuman={setSelectedHumanId}
              onAddHuman={addHuman}
            />
          ) : activeView === "dogs" ? (
            <DogsView
              dogs={dogs}
              humans={humans}
              onOpenDog={setSelectedDogId}
              onAddDog={addDog}
            />
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
              bookingsByDate={bookingsByDate}
            />
          </Suspense>
        )}

        {showNewBooking && (
          <NewBookingModal
            onClose={() => setShowNewBooking(null)}
            onAdd={(booking, dateStr) => {
              handleAddToDate(booking, dateStr);
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
