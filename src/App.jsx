import { useState, useCallback, useMemo } from "react";
import { BRAND, SALON_SLOTS, ALL_DAYS, PRICING, LARGE_DOG_SLOTS } from "./constants/index.js";
import { computeSlotCapacities } from "./engine/capacity.js";
import { SAMPLE_BOOKINGS_BY_DAY, SAMPLE_HUMANS, SAMPLE_DOGS } from "./data/sample.js";
import { supabase } from "./supabase/client.js";
import { toDateStr } from "./supabase/transforms.js";
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
import { DatePickerModal } from "./components/modals/DatePickerModal.jsx";
import { HumanCardModal } from "./components/modals/HumanCardModal.jsx";
import { DogCardModal } from "./components/modals/DogCardModal.jsx";
import { SettingsView } from "./components/views/SettingsView.jsx";
import { HumansView } from "./components/views/HumansView.jsx";
import { DogsView } from "./components/views/DogsView.jsx";

// Offline fallback: convert sample bookings to date-based format
function buildOfflineBookingsByDate(weekStart) {
  const dayToOffset = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
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
  const [activeView, setActiveView] = useState("dashboard");
  const [selectedHumanId, setSelectedHumanId] = useState(null);
  const [selectedDogId, setSelectedDogId] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);

  // Week navigation
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

  const goToNextWeek = useCallback(() => setWeekOffset(o => o + 1), []);
  const goToPrevWeek = useCallback(() => setWeekOffset(o => o - 1), []);

  // Dates array for the week
  const dates = useMemo(() => ALL_DAYS.map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return {
      full: d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      dayNum: d.getDate(),
      monthShort: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
      year: d.getFullYear(),
      dateObj: d,
      dateStr: toDateStr(d),
    };
  }), [weekStart]);

  const currentDateObj = dates[selectedDay]?.dateObj || new Date();
  const currentDateStr = dates[selectedDay]?.dateStr || toDateStr(new Date());
  const currentDayConfig = ALL_DAYS[selectedDay];

  // ========================================
  // DATA: Supabase hooks with offline fallback
  // ========================================
  const isOnline = !!supabase;

  // Supabase hooks (no-op when supabase is null)
  const { humans: sbHumans, humansById, loading: hl, error: he, updateHuman: sbUpdateHuman } = useHumans();
  const { dogs: sbDogs, dogsById, loading: dl, error: de, updateDog: sbUpdateDog } = useDogs(humansById);
  const { bookingsByDate: sbBookings, loading: bl, error: be, addBooking: sbAddBooking, removeBooking: sbRemoveBooking, updateBooking: sbUpdateBooking } = useBookings(weekStart, dogsById, humansById);
  const { config: sbConfig, loading: cl, updateConfig: sbUpdateConfig } = useSalonConfig();
  const { daySettings: sbDaySettings, loading: dsl, toggleDayOpen: sbToggleDayOpen, setOverride: sbSetOverride, addExtraSlot: sbAddExtraSlot, removeExtraSlot: sbRemoveExtraSlot } = useDaySettings(weekStart);

  // Offline state (used when no Supabase)
  const [offlineDogs, setOfflineDogs] = useState(SAMPLE_DOGS);
  const [offlineHumans, setOfflineHumans] = useState(SAMPLE_HUMANS);
  const [offlineBookings, setOfflineBookings] = useState(() => buildOfflineBookingsByDate(weekStart));
  const [offlineConfig, setOfflineConfig] = useState({
    defaultPickupOffset: 120,
    pricing: { ...PRICING },
    enforceCapacity: true,
    largeDogSlots: { ...LARGE_DOG_SLOTS },
  });

  // Rebuild offline bookings when week changes
  const offlineBookingsByDate = useMemo(() => {
    if (isOnline) return {};
    return offlineBookings;
  }, [isOnline, offlineBookings]);

  // Offline day settings
  const [offlineDaySettings, setOfflineDaySettings] = useState(() => {
    const settings = {};
    ALL_DAYS.forEach((day, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      settings[toDateStr(d)] = { isOpen: day.defaultOpen, overrides: {}, extraSlots: [] };
    });
    return settings;
  });

  // Pick online or offline
  const dogs = isOnline ? sbDogs : offlineDogs;
  const humans = isOnline ? sbHumans : offlineHumans;
  const bookingsByDate = isOnline ? sbBookings : offlineBookingsByDate;
  const salonConfig = isOnline ? sbConfig : offlineConfig;
  const daySettings = isOnline ? sbDaySettings : offlineDaySettings;

  const isLoading = isOnline && (hl || dl || bl || cl || dsl);
  const dataError = he || de || be;

  // Unified callbacks
  const updateDog = isOnline ? sbUpdateDog : useCallback((name, updates) => {
    setOfflineDogs(prev => ({ ...prev, [name]: { ...prev[name], ...updates } }));
  }, []);

  const updateHuman = isOnline ? sbUpdateHuman : useCallback((key, updates) => {
    setOfflineHumans(prev => ({ ...prev, [key]: { ...prev[key], ...updates } }));
  }, []);

  const updateConfig = isOnline ? sbUpdateConfig : useCallback((updater) => {
    setOfflineConfig(prev => typeof updater === "function" ? updater(prev) : updater);
  }, []);

  const handleAdd = isOnline
    ? useCallback((booking) => sbAddBooking(currentDateStr, booking), [sbAddBooking, currentDateStr])
    : useCallback((booking) => {
        setOfflineBookings(prev => ({
          ...prev,
          [currentDateStr]: [...(prev[currentDateStr] || []), booking],
        }));
      }, [currentDateStr]);

  const handleRemove = isOnline
    ? useCallback((bookingId) => sbRemoveBooking(currentDateStr, bookingId), [sbRemoveBooking, currentDateStr])
    : useCallback((bookingId) => {
        setOfflineBookings(prev => ({
          ...prev,
          [currentDateStr]: (prev[currentDateStr] || []).filter(b => b.id !== bookingId),
        }));
      }, [currentDateStr]);

  const handleUpdate = isOnline
    ? sbUpdateBooking
    : useCallback((updatedBooking, fromDateStr, toDateStr) => {
        setOfflineBookings(prev => {
          const newState = { ...prev };
          if (fromDateStr === toDateStr) {
            newState[fromDateStr] = (newState[fromDateStr] || []).map(b => b.id === updatedBooking.id ? updatedBooking : b);
          } else {
            newState[fromDateStr] = (newState[fromDateStr] || []).filter(b => b.id !== updatedBooking.id);
            newState[toDateStr] = [...(newState[toDateStr] || []), updatedBooking];
          }
          return newState;
        });
      }, []);

  // Day settings callbacks
  const currentSettings = daySettings[currentDateStr] || { isOpen: false, overrides: {}, extraSlots: [] };
  const isOpen = currentSettings.isOpen;
  const dayOverrides = currentSettings.overrides || {};

  const toggleDayOpen = isOnline
    ? useCallback(() => sbToggleDayOpen(currentDateStr), [sbToggleDayOpen, currentDateStr])
    : useCallback(() => {
        setOfflineDaySettings(prev => ({
          ...prev,
          [currentDateStr]: { ...prev[currentDateStr], isOpen: !prev[currentDateStr]?.isOpen },
        }));
      }, [currentDateStr]);

  const handleOverride = isOnline
    ? useCallback((slot, seatIndex, action) => sbSetOverride(currentDateStr, slot, seatIndex, action), [sbSetOverride, currentDateStr])
    : useCallback((slot, seatIndex, action) => {
        setOfflineDaySettings(prev => {
          const current = prev[currentDateStr] || { isOpen: true, overrides: {}, extraSlots: [] };
          const overrides = { ...current.overrides };
          const slotOv = { ...(overrides[slot] || {}) };
          if (slotOv[seatIndex] === action) delete slotOv[seatIndex];
          else slotOv[seatIndex] = action;
          overrides[slot] = slotOv;
          return { ...prev, [currentDateStr]: { ...current, overrides } };
        });
      }, [currentDateStr]);

  const handleAddSlot = isOnline
    ? useCallback(() => sbAddExtraSlot(currentDateStr), [sbAddExtraSlot, currentDateStr])
    : useCallback(() => {
        setOfflineDaySettings(prev => {
          const current = prev[currentDateStr] || { isOpen: true, overrides: {}, extraSlots: [] };
          const existing = current.extraSlots || [];
          const lastSlot = existing.length > 0 ? existing[existing.length - 1] : SALON_SLOTS[SALON_SLOTS.length - 1];
          let [h, m] = lastSlot.split(":").map(Number);
          m += 30;
          if (m >= 60) { h += 1; m -= 60; }
          const newSlot = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
          return { ...prev, [currentDateStr]: { ...current, extraSlots: [...existing, newSlot] } };
        });
      }, [currentDateStr]);

  const handleRemoveSlot = isOnline
    ? useCallback(() => sbRemoveExtraSlot(currentDateStr), [sbRemoveExtraSlot, currentDateStr])
    : useCallback(() => {
        setOfflineDaySettings(prev => {
          const current = prev[currentDateStr] || { isOpen: true, overrides: {}, extraSlots: [] };
          const existing = current.extraSlots || [];
          if (existing.length === 0) return prev;
          return { ...prev, [currentDateStr]: { ...current, extraSlots: existing.slice(0, -1) } };
        });
      }, [currentDateStr]);

  // Bookings + capacity
  const dayBookings = bookingsByDate[currentDateStr] || [];
  const activeSlots = useMemo(() => {
    return [...SALON_SLOTS, ...(currentSettings.extraSlots || [])];
  }, [currentSettings.extraSlots]);

  const capacities = useMemo(
    () => computeSlotCapacities(dayBookings, activeSlots),
    [dayBookings, activeSlots]
  );

  const dogCount = dayBookings.length;

  // Date picker
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

    const diffWeeks = Math.round((pickedMonday - thisMonday) / (7 * 24 * 60 * 60 * 1000));
    setWeekOffset(diffWeeks);
    setShowDatePicker(false);
  }, []);

  // Build dayOpenState map for WeekNav + DatePicker (dateStr -> boolean)
  const dayOpenState = useMemo(() => {
    const state = {};
    for (const d of dates) {
      state[d.dateStr] = daySettings[d.dateStr]?.isOpen ?? false;
    }
    return state;
  }, [dates, daySettings]);

  // ========================================
  // RENDER
  // ========================================

  if (isLoading) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: 900, margin: "0 auto",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: BRAND.text, padding: "20px 16px",
    }}>
      {dataError && <ErrorBanner message={dataError} />}

      {/* Header */}
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div style={{ cursor: "pointer" }} onClick={() => setActiveView("dashboard")}>
          <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.text }}>
            Smarter<span style={{ color: BRAND.blue }}>Dog</span>
          </div>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 2 }}>Salon Dashboard</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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

          <button style={{
            background: BRAND.coralLight, border: "none", borderRadius: 8,
            padding: "9px 16px", fontSize: 13, fontWeight: 700, color: BRAND.coral,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.coral; e.currentTarget.style.color = BRAND.white; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.coralLight; e.currentTarget.style.color = BRAND.coral; }}>Log out</button>
        </div>
      </div>

      {activeView === "settings" ? (
        <SettingsView onBack={() => setActiveView("dashboard")} config={salonConfig} onUpdateConfig={updateConfig} />
      ) : activeView === "humans" ? (
        <HumansView humans={humans} dogs={dogs} onOpenHuman={setSelectedHumanId} />
      ) : activeView === "dogs" ? (
        <DogsView dogs={dogs} humans={humans} onOpenDog={setSelectedDogId} />
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <WeekNav selectedDay={selectedDay} onSelectDay={setSelectedDay} bookingsByDate={bookingsByDate} dates={dates} dayOpenState={dayOpenState} onPrevWeek={goToPrevWeek} onNextWeek={goToNextWeek} />
          </div>

          {isOpen ? (
            <>
              <Legend />
              <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${BRAND.greyLight}`, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <DayHeader day={currentDayConfig.full} date={dates[selectedDay]} dogCount={dogCount} maxDogs={16} isOpen={true} onToggleOpen={toggleDayOpen} onCalendarClick={() => setShowDatePicker(true)} />
                {activeSlots.map((slot, i) => (
                  <SlotRow key={slot} slot={slot} slotIndex={i} capacity={capacities[slot]} bookings={dayBookings} onAdd={handleAdd} onRemove={handleRemove} overrides={dayOverrides[slot]} onOverride={handleOverride} activeSlots={activeSlots} onOpenHuman={setSelectedHumanId} onOpenDog={setSelectedDogId} onUpdate={handleUpdate} currentDateStr={currentDateStr} currentDateObj={currentDateObj} bookingsByDate={bookingsByDate} dayOpenState={dayOpenState} dogs={dogs} humans={humans} onUpdateDog={updateDog} />
                ))}
                <div style={{ padding: "12px 16px", borderTop: `1px solid ${BRAND.greyLight}`, background: BRAND.white, display: "flex", flexDirection: "column", gap: 8 }}>
                  {(currentSettings.extraSlots || []).length > 0 && (
                    <button onClick={handleRemoveSlot} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: BRAND.blue, color: BRAND.white, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.blueDark; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.blue; }}>Remove added timeslot</button>
                  )}
                  <button onClick={handleAddSlot} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: BRAND.coral, color: BRAND.white, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#D9466F"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.coral; }}>Add another timeslot</button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <DayHeader day={currentDayConfig.full} date={dates[selectedDay]} dogCount={0} maxDogs={16} isOpen={false} onToggleOpen={toggleDayOpen} onCalendarClick={() => setShowDatePicker(true)} />
              <ClosedDayView onOpen={toggleDayOpen} />
            </div>
          )}

          {showDatePicker && (
            <DatePickerModal currentDate={currentDateObj} dayOpenState={dayOpenState} onSelectDate={handleDatePick} onClose={() => setShowDatePicker(false)} />
          )}
        </>
      )}

      {selectedHumanId && <HumanCardModal humanId={selectedHumanId} onClose={() => setSelectedHumanId(null)} onOpenHuman={setSelectedHumanId} onOpenDog={setSelectedDogId} humans={humans} dogs={dogs} onUpdateHuman={updateHuman} />}
      {selectedDogId && <DogCardModal dogId={selectedDogId} onClose={() => setSelectedDogId(null)} onOpenHuman={setSelectedHumanId} dogs={dogs} onUpdateDog={updateDog} />}
    </div>
  );
}
