import {
  useState,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import {
  BRAND,
  SALON_SLOTS,
  ALL_DAYS,
} from "./constants/index.js";
import { computeSlotCapacities, canBookSlot } from "./engine/capacity.js";
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
import { Legend } from "./components/ui/Legend.jsx";
import { LoadingSpinner } from "./components/ui/LoadingSpinner.jsx";
import { ErrorBanner } from "./components/ui/ErrorBanner.jsx";
import { SlotRow } from "./components/booking/SlotRow.jsx";
import { DayHeader } from "./components/layout/DayHeader.jsx";
import { ClosedDayView } from "./components/layout/ClosedDayView.jsx";
import { WeekNav } from "./components/layout/WeekNav.jsx";
import { AppToolbar } from "./components/layout/AppToolbar.jsx";
const DatePickerModal = lazy(() =>
  import("./components/modals/DatePickerModal.jsx").then((module) => ({
    default: module.DatePickerModal,
  })),
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
import { DaySummary } from "./components/layout/DaySummary.jsx";
import { AddBookingForm } from "./components/booking/AddBookingForm.jsx";
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
  const isOpen = currentSettings.isOpen;
  const dayOverrides = currentSettings.overrides || {};
  const dayBookings = bookingsByDate[currentDateStr] || [];
  const activeSlots = useMemo(() => {
    return [...SALON_SLOTS, ...(currentSettings.extraSlots || [])];
  }, [currentSettings.extraSlots]);

  const capacities = useMemo(
    () => computeSlotCapacities(dayBookings, activeSlots),
    [dayBookings, activeSlots],
  );
  const dogCount = dayBookings.length;

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

  const rebookDateStr = rebookData?.dateStr || "";
  const rebookSettings = rebookData
    ? daySettings[rebookDateStr] || {
        isOpen:
          dayOpenState[rebookDateStr] ?? getDefaultOpenForDate(rebookData.date),
        overrides: {},
        extraSlots: [],
      }
    : null;

  const rebookSlots = rebookData
    ? [...SALON_SLOTS, ...(rebookSettings?.extraSlots || [])]
    : [];
  const rebookBookings = rebookData ? bookingsByDate[rebookDateStr] || [] : [];
  const rebookDayOpen = rebookData
    ? (rebookSettings?.isOpen ?? dayOpenState[rebookDateStr] ?? false)
    : false;

  const rebookAvailableSlots = useMemo(() => {
    if (!rebookData) return [];
    return rebookSlots.filter(
      (slot) =>
        canBookSlot(rebookBookings, slot, rebookData.size, rebookSlots, {
          overrides: rebookSettings?.overrides?.[slot] || {},
        }).allowed,
    );
  }, [rebookData, rebookSlots, rebookBookings, rebookSettings]);

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
            <>
              <div style={{ marginBottom: 16 }}>
                <WeekNav
                  selectedDay={selectedDay}
                  onSelectDay={setSelectedDay}
                  bookingsByDate={bookingsByDate}
                  dates={dates}
                  dayOpenState={dayOpenState}
                  onPrevWeek={goToPrevWeek}
                  onNextWeek={goToNextWeek}
                />
              </div>

              {isOpen ? (
                <>
                  <Legend />
                  <div
                    style={{
                      borderRadius: 14,
                      overflow: "hidden",
                      border: `1px solid ${BRAND.greyLight}`,
                      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                    }}
                  >
                    <DayHeader
                      day={currentDayConfig.full}
                      date={dates[selectedDay]}
                      dogCount={dogCount}
                      maxDogs={16}
                      isOpen
                      onToggleOpen={toggleDayOpen}
                      onCalendarClick={() => setShowDatePicker(true)}
                    />
                    <DaySummary bookings={dayBookings} />
                    {activeSlots.map((slot, i) => (
                      <SlotRow
                        key={slot}
                        slot={slot}
                        slotIndex={i}
                        capacity={capacities[slot]}
                        bookings={dayBookings}
                        onAdd={handleAdd}
                        overrides={dayOverrides[slot]}
                        onOverride={handleOverride}
                        activeSlots={activeSlots}
                        onOpenNewBooking={(dateStr, slot) =>
                          setShowNewBooking({ dateStr, slot })
                        }
                      />
                    ))}
                    <div
                      style={{
                        padding: "12px 16px",
                        borderTop: `1px solid ${BRAND.greyLight}`,
                        background: BRAND.white,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {(currentSettings.extraSlots || []).length > 0 && (
                        <button
                          onClick={handleRemoveSlot}
                          style={{
                            width: "100%",
                            padding: "10px",
                            borderRadius: 10,
                            border: "none",
                            background: BRAND.blue,
                            color: BRAND.white,
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = BRAND.blueDark;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = BRAND.blue;
                          }}
                        >
                          Remove added timeslot
                        </button>
                      )}
                      <button
                        onClick={handleAddSlot}
                        style={{
                          width: "100%",
                          padding: "10px",
                          borderRadius: 10,
                          border: "none",
                          background: BRAND.coral,
                          color: BRAND.white,
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#D9466F";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = BRAND.coral;
                        }}
                      >
                        Add another timeslot
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    borderRadius: 14,
                    overflow: "hidden",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                  }}
                >
                  <DayHeader
                    day={currentDayConfig.full}
                    date={dates[selectedDay]}
                    dogCount={0}
                    maxDogs={16}
                    isOpen={false}
                    onToggleOpen={toggleDayOpen}
                    onCalendarClick={() => setShowDatePicker(true)}
                  />
                  <ClosedDayView onOpen={toggleDayOpen} />
                </div>
              )}

              {showDatePicker && (
                <Suspense fallback={<LoadingSpinner />}>
                  <DatePickerModal
                    currentDate={currentDateObj}
                    dayOpenState={dayOpenState}
                    onSelectDate={handleDatePick}
                    onClose={() => setShowDatePicker(false)}
                  />
                </Suspense>
              )}

              {rebookData && (
                <div
                  onClick={() => {
                    setRebookData(null);
                    setShowRebookDatePicker(false);
                  }}
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "rgba(0,0,0,0.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1000,
                  }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: BRAND.white,
                      borderRadius: 16,
                      width: 420,
                      padding: "20px 24px",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 800,
                        color: BRAND.text,
                        marginBottom: 4,
                      }}
                    >
                      Rebook {rebookData.dogName}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: BRAND.textLight,
                        marginBottom: 12,
                      }}
                    >
                      Pre-filled from previous appointment. Choose a date and
                      slot, then confirm.
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowRebookDatePicker(true)}
                      style={{
                        width: "100%",
                        marginBottom: 10,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: `1.5px solid ${BRAND.greyLight}`,
                        background: BRAND.white,
                        color: BRAND.text,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>
                        {rebookData.date
                          ? rebookData.date.toLocaleDateString("en-GB", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "Choose date"}
                      </span>
                      <span>{"📅"}</span>
                    </button>

                    {!rebookDayOpen && (
                      <div
                        style={{
                          marginBottom: 10,
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: BRAND.coralLight,
                          color: BRAND.coral,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        This day is currently closed. Choose another date.
                      </div>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(72px, 1fr))",
                        gap: 6,
                        marginBottom: 12,
                      }}
                    >
                      {rebookSlots.map((slot) => {
                        const allowed = canBookSlot(
                          rebookBookings,
                          slot,
                          rebookData.size,
                          rebookSlots,
                          {
                            overrides: rebookSettings?.overrides?.[slot] || {},
                          },
                        ).allowed;

                        return (
                          <button
                            key={slot}
                            type="button"
                            disabled={!allowed}
                            onClick={() =>
                              setRebookData((prev) => ({ ...prev, slot }))
                            }
                            style={{
                              padding: "8px 0",
                              borderRadius: 8,
                              border: `1.5px solid ${rebookData.slot === slot ? BRAND.blue : BRAND.greyLight}`,
                              background:
                                rebookData.slot === slot
                                  ? BRAND.blue
                                  : BRAND.white,
                              color:
                                rebookData.slot === slot
                                  ? BRAND.white
                                  : allowed
                                    ? BRAND.text
                                    : BRAND.textLight,
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: allowed ? "pointer" : "not-allowed",
                              opacity: allowed ? 1 : 0.5,
                              fontFamily: "inherit",
                            }}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>

                    {rebookAvailableSlots.length === 0 && (
                      <div
                        style={{
                          marginBottom: 12,
                          fontSize: 12,
                          color: BRAND.coral,
                          fontWeight: 700,
                        }}
                      >
                        No bookable slots are available for this dog on the
                        selected date.
                      </div>
                    )}

                    <AddBookingForm
                      slot={rebookData.slot}
                      bookings={rebookBookings}
                      activeSlots={rebookSlots}
                      dogs={dogs}
                      humans={humans}
                      prefill={rebookData}
                      slotOverrides={
                        rebookSettings?.overrides?.[rebookData.slot] || {}
                      }
                      onAdd={async (booking) => {
                        const saved = await handleAdd(
                          booking,
                          rebookData.dateStr,
                        );
                        if (saved) {
                          setRebookData(null);
                          setShowRebookDatePicker(false);
                        }
                        return saved;
                      }}
                      onCancel={() => {
                        setRebookData(null);
                        setShowRebookDatePicker(false);
                      }}
                    />
                  </div>
                </div>
              )}

              {showRebookDatePicker && rebookData && (
                <Suspense fallback={<LoadingSpinner />}>
                  <DatePickerModal
                    currentDate={rebookData.date}
                    dayOpenState={dayOpenState}
                    onSelectDate={(newDate) => {
                      const newDateStr = toDateStr(newDate);
                      const settings = daySettings[newDateStr] || {
                        isOpen:
                          dayOpenState[newDateStr] ??
                          getDefaultOpenForDate(newDate),
                        overrides: {},
                        extraSlots: [],
                      };
                      const slots = [
                        ...SALON_SLOTS,
                        ...(settings.extraSlots || []),
                      ];
                      const bookings = bookingsByDate[newDateStr] || [];
                      const nextSlot =
                        slots.find(
                          (slot) =>
                            canBookSlot(bookings, slot, rebookData.size, slots, {
                              overrides: settings.overrides?.[slot] || {},
                            }).allowed,
                        ) || "";

                      setRebookData((prev) => ({
                        ...prev,
                        date: newDate,
                        dateStr: newDateStr,
                        slot: nextSlot,
                      }));
                      setShowRebookDatePicker(false);
                    }}
                    onClose={() => setShowRebookDatePicker(false)}
                  />
                </Suspense>
              )}
            </>
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
