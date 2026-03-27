import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import {
  BRAND,
  SALON_SLOTS,
  ALL_DAYS,
  PRICING,
  LARGE_DOG_SLOTS,
} from "./constants/index.js";
import { computeSlotCapacities, canBookSlot } from "./engine/capacity.js";
import {
  SAMPLE_BOOKINGS_BY_DAY,
  SAMPLE_HUMANS,
  SAMPLE_DOGS,
} from "./data/sample.js";
import { supabase } from "./supabase/client.js";
import { toDateStr } from "./supabase/transforms.js";
import { useAuth } from "./supabase/hooks/useAuth.js";
import { useHumans } from "./supabase/hooks/useHumans.js";
import { useDogs } from "./supabase/hooks/useDogs.js";
import { useBookings } from "./supabase/hooks/useBookings.js";
import { useSalonConfig } from "./supabase/hooks/useSalonConfig.js";
import { useDaySettings } from "./supabase/hooks/useDaySettings.js";
import { Legend } from "./components/ui/Legend.jsx";
import { LoadingSpinner } from "./components/ui/LoadingSpinner.jsx";
import { ErrorBanner } from "./components/ui/ErrorBanner.jsx";
import { SlotRow } from "./components/booking/SlotRow.jsx";
import { DayHeader } from "./components/layout/DayHeader.jsx";
import { ClosedDayView } from "./components/layout/ClosedDayView.jsx";
import { WeekNav } from "./components/layout/WeekNav.jsx";
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

function getDefaultOpenForDate(dateObj) {
  const dayOfWeek = dateObj.getDay();
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return ALL_DAYS[dayIndex]?.defaultOpen ?? false;
}

// Offline fallback: convert sample bookings to date-based format
function buildOfflineBookingsByDate(weekStart) {
  const dayToOffset = {
    mon: 0,
    tue: 1,
    wed: 2,
    thu: 3,
    fri: 4,
    sat: 5,
    sun: 6,
  };
  const result = {};
  for (const [dayKey, bookings] of Object.entries(SAMPLE_BOOKINGS_BY_DAY)) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + dayToOffset[dayKey]);
    const dateStr = toDateStr(d);
    result[dateStr] = bookings;
  }
  return result;
}

export default function App() {
  const {
    user,
    staffProfile,
    loading: authLoading,
    error: authError,
    signIn,
    signUp,
    signOut,
    isOwner,
  } = useAuth();
  const isOnline = !!supabase;

  const [activeView, setActiveView] = useState("dashboard");
  const [selectedHumanId, setSelectedHumanId] = useState(null);
  const [selectedDogId, setSelectedDogId] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);
  const [rebookData, setRebookData] = useState(null);
  const [showNewBooking, setShowNewBooking] = useState(null); // null or { dateStr, slot }
  const [showAddDogModal, setShowAddDogModal] = useState(false);
  const [showAddHumanModal, setShowAddHumanModal] = useState(false);
  const [showRebookDatePicker, setShowRebookDatePicker] = useState(false);

  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }, [weekOffset]);

  const goToNextWeek = useCallback(() => setWeekOffset((o) => o + 1), []);
  const goToPrevWeek = useCallback(() => setWeekOffset((o) => o - 1), []);

  const dates = useMemo(
    () =>
      ALL_DAYS.map((_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return {
          full: d.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
          dayNum: d.getDate(),
          monthShort: d
            .toLocaleDateString("en-GB", { month: "short" })
            .toUpperCase(),
          year: d.getFullYear(),
          dateObj: d,
          dateStr: toDateStr(d),
        };
      }),
    [weekStart],
  );

  const currentDateObj = dates[selectedDay]?.dateObj || new Date();
  const currentDateStr = dates[selectedDay]?.dateStr || toDateStr(new Date());
  const currentDayConfig = ALL_DAYS[selectedDay];

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

  const [offlineDogs, setOfflineDogs] = useState(SAMPLE_DOGS);
  const [offlineHumans, setOfflineHumans] = useState(SAMPLE_HUMANS);
  const [offlineBookings, setOfflineBookings] = useState(() =>
    buildOfflineBookingsByDate(weekStart),
  );
  const [offlineConfig, setOfflineConfig] = useState({
    defaultPickupOffset: 120,
    pricing: { ...PRICING },
    enforceCapacity: true,
    largeDogSlots: { ...LARGE_DOG_SLOTS },
  });

  const [offlineDaySettings, setOfflineDaySettings] = useState(() => {
    const settings = {};
    ALL_DAYS.forEach((day, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      settings[toDateStr(d)] = {
        isOpen: day.defaultOpen,
        overrides: {},
        extraSlots: [],
      };
    });
    return settings;
  });

  const offlineBookingsByDate = useMemo(() => {
    if (isOnline) return {};
    return offlineBookings;
  }, [isOnline, offlineBookings]);

  const dogs = isOnline ? sbDogs : offlineDogs;
  const humans = isOnline ? sbHumans : offlineHumans;
  const bookingsByDate = isOnline ? sbBookings : offlineBookingsByDate;
  const salonConfig = isOnline ? sbConfig : offlineConfig;
  const daySettings = isOnline ? sbDaySettings : offlineDaySettings;

  const isLoading = isOnline && (hl || dl || bl || cl || dsl);
  const dataError = he || de || be;

  const offlineUpdateDog = useCallback((dogIdentifier, updates) => {
    setOfflineDogs((prev) => {
      const entries = Object.entries(prev);
      const found = entries.find(
        ([key, dog]) =>
          key === dogIdentifier ||
          dog.id === dogIdentifier ||
          dog.name === dogIdentifier,
      );
      if (!found) return prev;
      const [key, dog] = found;
      const nextKey = updates.name || dog.name || key;
      const next = { ...prev };
      delete next[key];
      next[nextKey] = { ...dog, ...updates };
      return next;
    });
  }, []);

  const offlineUpdateHuman = useCallback((humanIdentifier, updates) => {
    setOfflineHumans((prev) => {
      const entries = Object.entries(prev);
      const found = entries.find(
        ([key, human]) =>
          key === humanIdentifier ||
          human.id === humanIdentifier ||
          human.fullName === humanIdentifier,
      );
      if (!found) return prev;
      const [key, human] = found;
      const nextName = updates.name ?? human.name;
      const nextSurname = updates.surname ?? human.surname;
      const nextKey = `${nextName} ${nextSurname}`.trim();
      const next = { ...prev };
      delete next[key];
      next[nextKey] = { ...human, ...updates, fullName: nextKey };
      return next;
    });
  }, []);

  const offlineUpdateConfig = useCallback((updater) => {
    setOfflineConfig((prev) =>
      typeof updater === "function" ? updater(prev) : updater,
    );
  }, []);

  const offlineAddHuman = useCallback((humanData) => {
    const key = `${humanData.name} ${humanData.surname}`.trim();
    const newHuman = {
      id: `h-${Date.now()}`,
      ...humanData,
      fullName: key,
      fb: "",
      insta: "",
      tiktok: "",
      historyFlag: "",
      trustedIds: [],
    };
    setOfflineHumans((prev) => ({ ...prev, [key]: newHuman }));
    return newHuman;
  }, []);

  const offlineAddDog = useCallback(
    (dogData) => {
      const humanEntry = Object.values(offlineHumans).find(
        (human) =>
          human.id === dogData.humanId ||
          `${human.name} ${human.surname}`.trim() === dogData.humanId,
      );
      const newDog = {
        id: `d-${Date.now()}`,
        ...dogData,
        humanId: humanEntry?.fullName || dogData.humanId,
        _humanId: humanEntry?.id || null,
        alerts: [],
        groomNotes: dogData.groomNotes || "",
        customPrice: undefined,
      };
      setOfflineDogs((prev) => ({ ...prev, [dogData.name]: newDog }));
      return newDog;
    },
    [offlineHumans],
  );

  const offlineHandleAdd = useCallback(
    async (booking, targetDateStr = currentDateStr) => {
      setOfflineBookings((prev) => ({
        ...prev,
        [targetDateStr]: [...(prev[targetDateStr] || []), booking],
      }));
      return booking;
    },
    [currentDateStr],
  );

  const offlineHandleRemove = useCallback(
    async (bookingId) => {
      setOfflineBookings((prev) => ({
        ...prev,
        [currentDateStr]: (prev[currentDateStr] || []).filter(
          (b) => b.id !== bookingId,
        ),
      }));
      return true;
    },
    [currentDateStr],
  );

  const offlineHandleUpdate = useCallback(
    async (updatedBooking, fromDateStr, toDateStrValue) => {
      setOfflineBookings((prev) => {
        const newState = { ...prev };
        if (fromDateStr === toDateStrValue) {
          newState[fromDateStr] = (newState[fromDateStr] || []).map((b) =>
            b.id === updatedBooking.id ? updatedBooking : b,
          );
        } else {
          newState[fromDateStr] = (newState[fromDateStr] || []).filter(
            (b) => b.id !== updatedBooking.id,
          );
          newState[toDateStrValue] = [
            ...(newState[toDateStrValue] || []),
            updatedBooking,
          ];
        }
        return newState;
      });
      return updatedBooking;
    },
    [],
  );

  const offlineToggleDayOpen = useCallback(() => {
    setOfflineDaySettings((prev) => ({
      ...prev,
      [currentDateStr]: {
        ...(prev[currentDateStr] || {
          isOpen: getDefaultOpenForDate(currentDateObj),
          overrides: {},
          extraSlots: [],
        }),
        isOpen: !(
          prev[currentDateStr]?.isOpen ?? getDefaultOpenForDate(currentDateObj)
        ),
      },
    }));
  }, [currentDateStr, currentDateObj]);

  const offlineHandleOverride = useCallback(
    (slot, seatIndex, action) => {
      setOfflineDaySettings((prev) => {
        const current = prev[currentDateStr] || {
          isOpen: getDefaultOpenForDate(currentDateObj),
          overrides: {},
          extraSlots: [],
        };
        const overrides = { ...current.overrides };
        const slotOv = { ...(overrides[slot] || {}) };
        if (slotOv[seatIndex] === action) delete slotOv[seatIndex];
        else slotOv[seatIndex] = action;
        if (Object.keys(slotOv).length === 0) delete overrides[slot];
        else overrides[slot] = slotOv;
        return { ...prev, [currentDateStr]: { ...current, overrides } };
      });
    },
    [currentDateStr, currentDateObj],
  );

  const offlineHandleAddSlot = useCallback(() => {
    setOfflineDaySettings((prev) => {
      const current = prev[currentDateStr] || {
        isOpen: getDefaultOpenForDate(currentDateObj),
        overrides: {},
        extraSlots: [],
      };
      const existing = current.extraSlots || [];
      const lastSlot =
        existing.length > 0
          ? existing[existing.length - 1]
          : SALON_SLOTS[SALON_SLOTS.length - 1];
      let [h, m] = lastSlot.split(":").map(Number);
      m += 30;
      if (m >= 60) {
        h += 1;
        m -= 60;
      }
      const newSlot = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      return {
        ...prev,
        [currentDateStr]: { ...current, extraSlots: [...existing, newSlot] },
      };
    });
  }, [currentDateStr, currentDateObj]);

  const offlineHandleRemoveSlot = useCallback(() => {
    setOfflineDaySettings((prev) => {
      const current = prev[currentDateStr] || {
        isOpen: getDefaultOpenForDate(currentDateObj),
        overrides: {},
        extraSlots: [],
      };
      const existing = current.extraSlots || [];
      if (existing.length === 0) return prev;
      return {
        ...prev,
        [currentDateStr]: { ...current, extraSlots: existing.slice(0, -1) },
      };
    });
  }, [currentDateStr, currentDateObj]);

  // Online callbacks (always declared to avoid conditional hook calls)
  const onlineHandleAdd = useCallback(
    (booking, targetDateStr = currentDateStr) =>
      sbAddBooking(targetDateStr, booking),
    [sbAddBooking, currentDateStr],
  );
  const onlineHandleAddToDate = useCallback(
    (booking, dateStr) => sbAddBooking(dateStr, booking),
    [sbAddBooking],
  );
  const offlineHandleAddToDate = useCallback((booking, dateStr) => {
    setOfflineBookings((prev) => ({
      ...prev,
      [dateStr]: [...(prev[dateStr] || []), booking],
    }));
  }, []);
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

  // Pick online or offline callbacks (no conditional hook calls!)
  const updateDog = isOnline ? sbUpdateDog : offlineUpdateDog;
  const updateHuman = isOnline ? sbUpdateHuman : offlineUpdateHuman;
  const updateConfig = isOnline ? sbUpdateConfig : offlineUpdateConfig;
  const addHuman = isOnline ? sbAddHuman : offlineAddHuman;
  const addDog = isOnline ? sbAddDog : offlineAddDog;
  const handleAdd = isOnline ? onlineHandleAdd : offlineHandleAdd;
  const handleAddToDate = isOnline ? onlineHandleAddToDate : offlineHandleAddToDate;
  const handleRemove = isOnline ? onlineHandleRemove : offlineHandleRemove;
  const handleUpdate = isOnline ? sbUpdateBooking : offlineHandleUpdate;
  const toggleDayOpen = isOnline ? onlineToggleDayOpen : offlineToggleDayOpen;
  const handleOverride = isOnline ? onlineHandleOverride : offlineHandleOverride;
  const handleAddSlot = isOnline ? onlineHandleAddSlot : offlineHandleAddSlot;
  const handleRemoveSlot = isOnline ? onlineHandleRemoveSlot : offlineHandleRemoveSlot;

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

  const handleDatePick = useCallback((pickedDate) => {
    const dayOfWeek = pickedDate.getDay();
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    setSelectedDay(dayIndex);

    const today = new Date();
    const todayDow = today.getDay();
    const mondayOff = todayDow === 0 ? -6 : 1 - todayDow;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() + mondayOff);
    thisMonday.setHours(0, 0, 0, 0);

    const pickedMonday = new Date(pickedDate);
    const pickedDow = pickedDate.getDay();
    const pickedMondayOff = pickedDow === 0 ? -6 : 1 - pickedDow;
    pickedMonday.setDate(pickedDate.getDate() + pickedMondayOff);
    pickedMonday.setHours(0, 0, 0, 0);

    const diffWeeks = Math.round(
      (pickedMonday - thisMonday) / (7 * 24 * 60 * 60 * 1000),
    );
    setWeekOffset(diffWeeks);
    setShowDatePicker(false);
  }, []);

  const dayOpenState = useMemo(() => {
    const state = {};
    for (const d of dates) {
      state[d.dateStr] =
        daySettings[d.dateStr]?.isOpen ?? getDefaultOpenForDate(d.dateObj);
    }
    return state;
  }, [dates, daySettings]);

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
        <LoginPage
          onSignIn={signIn}
          onSignUp={signUp}
          error={authError}
          isOffline={false}
        />
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

      <div
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div
          style={{ cursor: "pointer" }}
          onClick={() => setActiveView("dashboard")}
        >
          <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.text }}>
            Smarter<span style={{ color: BRAND.blue }}>Dog</span>
          </div>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 2 }}>
            Salon Dashboard
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setShowNewBooking({ dateStr: currentDateStr, slot: "" })} style={{
            background: BRAND.blue, border: "none",
            borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700,
            color: BRAND.white, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.blueDark; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.blue; }}>+ New Booking</button>

          <button onClick={() => setActiveView("dogs")} style={{
            background: activeView === "dogs" ? BRAND.blueLight : BRAND.white,
            border: `1px solid ${activeView === "dogs" ? BRAND.blue : BRAND.greyLight}`,
            borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600,
            color: activeView === "dogs" ? BRAND.blueDark : BRAND.text,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
          }}
          onMouseEnter={(e) => { if (activeView !== "dogs") { e.currentTarget.style.borderColor = BRAND.blue; e.currentTarget.style.color = BRAND.blue; } }}
          onMouseLeave={(e) => { if (activeView !== "dogs") { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.color = BRAND.text; } }}>Dogs</button>

          <button onClick={() => setActiveView("humans")} style={{
            background: activeView === "humans" ? BRAND.tealLight : BRAND.white,
            border: `1px solid ${activeView === "humans" ? BRAND.teal : BRAND.greyLight}`,
            borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600,
            color: activeView === "humans" ? "#1F6659" : BRAND.text,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
          }}
          onMouseEnter={(e) => { if (activeView !== "humans") { e.currentTarget.style.borderColor = BRAND.teal; e.currentTarget.style.color = BRAND.teal; } }}
          onMouseLeave={(e) => { if (activeView !== "humans") { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.color = BRAND.text; } }}>Humans</button>

          <button onClick={() => setActiveView("settings")} style={{
            background: activeView === "settings" ? BRAND.blueLight : BRAND.white,
            border: `1px solid ${activeView === "settings" ? BRAND.blue : BRAND.greyLight}`,
            borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600,
            color: activeView === "settings" ? BRAND.blueDark : BRAND.text,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
          }}
          onMouseEnter={(e) => { if (activeView !== "settings") { e.currentTarget.style.borderColor = BRAND.blue; e.currentTarget.style.color = BRAND.blue; } }}
          onMouseLeave={(e) => { if (activeView !== "settings") { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.color = BRAND.text; } }}>Settings</button>

          {isOnline && user && (
            <button
              onClick={signOut}
              style={{
                background: BRAND.coralLight,
                border: "none",
                borderRadius: 8,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 700,
                color: BRAND.coral,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = BRAND.coral;
                e.currentTarget.style.color = BRAND.white;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = BRAND.coralLight;
                e.currentTarget.style.color = BRAND.coral;
              }}
            >
              Log out
            </button>
          )}
        </div>
      </div>

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
                      onRemove={handleRemove}
                      overrides={dayOverrides[slot]}
                      onOverride={handleOverride}
                      activeSlots={activeSlots}
                      onOpenHuman={setSelectedHumanId}
                      onOpenDog={setSelectedDogId}
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
                      onOpenNewBooking={(dateStr, slot) => setShowNewBooking({ dateStr, slot })}
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
          onAdd={(booking, dateStr) => { handleAddToDate(booking, dateStr); setShowNewBooking(null); }}
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
          onAdd={async (dogData) => { const result = await addDog(dogData); return result; }}
          humans={humans}
        />
      )}

      {showAddHumanModal && (
        <AddHumanModal
          onClose={() => setShowAddHumanModal(false)}
          onAdd={async (humanData) => { const result = await addHuman(humanData); return result; }}
        />
      )}
    </div>
  );
}
