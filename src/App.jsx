import { useState, useCallback, useMemo } from "react";
import { BRAND, SALON_SLOTS, ALL_DAYS, PRICING, LARGE_DOG_SLOTS } from "./constants/index.js";
import { computeSlotCapacities } from "./engine/capacity.js";
import { SAMPLE_BOOKINGS_BY_DAY, SAMPLE_HUMANS, SAMPLE_DOGS } from "./data/sample.js";
import { Legend } from "./components/ui/Legend.jsx";
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

export default function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [selectedHumanId, setSelectedHumanId] = useState(null);
  const [selectedDogId, setSelectedDogId] = useState(null);

  // Core data state (lifted from sample data)
  const [dogs, setDogs] = useState(SAMPLE_DOGS);
  const [humans, setHumans] = useState(SAMPLE_HUMANS);
  const [bookingsByDay, setBookingsByDay] = useState(SAMPLE_BOOKINGS_BY_DAY);

  // Salon config state
  const [salonConfig, setSalonConfig] = useState({
    defaultPickupOffset: 120,
    pricing: { ...PRICING },
    enforceCapacity: true,
    largeDogSlots: { ...LARGE_DOG_SLOTS },
  });

  const [selectedDay, setSelectedDay] = useState(0);
  const [overridesByDay, setOverridesByDay] = useState({});
  const defaultOpenState = {};
  ALL_DAYS.forEach((d) => { defaultOpenState[d.key] = d.defaultOpen; });
  const [dayOpenState, setDayOpenState] = useState(defaultOpenState);
  const [extraSlotsByDay, setExtraSlotsByDay] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Data update callbacks
  const handleUpdateDog = useCallback((dogName, updates) => {
    setDogs(prev => ({ ...prev, [dogName]: { ...prev[dogName], ...updates } }));
  }, []);

  const handleUpdateHuman = useCallback((humanKey, updates) => {
    setHumans(prev => ({ ...prev, [humanKey]: { ...prev[humanKey], ...updates } }));
  }, []);

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

  const toggleDayOpen = useCallback((dayKey) => {
    setDayOpenState((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }));
  }, []);

  const currentDayConfig = ALL_DAYS[selectedDay];

  const handleAddSlot = useCallback(() => {
    setExtraSlotsByDay((prev) => {
      const dayKey = currentDayConfig.key;
      const existing = prev[dayKey] || [];
      const lastSlot = existing.length > 0 ? existing[existing.length - 1] : SALON_SLOTS[SALON_SLOTS.length - 1];
      let [h, m] = lastSlot.split(":").map(Number);
      m += 30;
      if (m >= 60) { h += 1; m -= 60; }
      const newSlot = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      return { ...prev, [dayKey]: [...existing, newSlot] };
    });
  }, [currentDayConfig.key]);

  const isOpen = dayOpenState[currentDayConfig.key];
  const dayBookings = bookingsByDay[currentDayConfig.key] || [];
  const dayOverrides = overridesByDay[currentDayConfig.key] || {};

  const handleRemoveSlot = useCallback(() => {
    const dayKey = currentDayConfig.key;
    setExtraSlotsByDay((prev) => {
      const existing = prev[dayKey] || [];
      if (existing.length === 0) return prev;
      return { ...prev, [dayKey]: existing.slice(0, -1) };
    });
  }, [currentDayConfig.key]);

  const activeSlots = useMemo(() => {
    return [...SALON_SLOTS, ...(extraSlotsByDay[currentDayConfig.key] || [])];
  }, [currentDayConfig.key, extraSlotsByDay]);

  const capacities = useMemo(
    () => computeSlotCapacities(dayBookings, activeSlots),
    [dayBookings, activeSlots]
  );

  const dogCount = dayBookings.length;

  const handleAdd = useCallback((booking) => {
    setBookingsByDay((prev) => ({
      ...prev,
      [currentDayConfig.key]: [...(prev[currentDayConfig.key] || []), booking],
    }));
  }, [currentDayConfig.key]);

  const handleRemove = useCallback((bookingId) => {
    setBookingsByDay((prev) => ({
      ...prev,
      [currentDayConfig.key]: (prev[currentDayConfig.key] || []).filter((b) => b.id !== bookingId),
    }));
  }, [currentDayConfig.key]);

  const handleOverride = useCallback((slot, seatIndex, action) => {
    setOverridesByDay((prev) => {
      const dayKey = currentDayConfig.key;
      const dayOv = { ...(prev[dayKey] || {}) };
      const slotOv = { ...(dayOv[slot] || {}) };
      if (slotOv[seatIndex] === action) delete slotOv[seatIndex];
      else slotOv[seatIndex] = action;
      dayOv[slot] = slotOv;
      return { ...prev, [dayKey]: dayOv };
    });
  }, [currentDayConfig.key]);

  const handleUpdate = useCallback((updatedBooking, fromDayKey, toDayKey) => {
    setBookingsByDay((prev) => {
      const newState = { ...prev };
      if (fromDayKey === toDayKey) {
        newState[fromDayKey] = (newState[fromDayKey] || []).map(b => b.id === updatedBooking.id ? updatedBooking : b);
      } else {
        newState[fromDayKey] = (newState[fromDayKey] || []).filter(b => b.id !== updatedBooking.id);
        newState[toDayKey] = [...(newState[toDayKey] || []), updatedBooking];
      }
      return newState;
    });
  }, []);

  const handleDatePick = useCallback((pickedDate) => {
    const dayOfWeek = pickedDate.getDay();
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    setSelectedDay(dayIndex);

    const today = new Date();
    const todayDow = today.getDay();
    const mondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() + mondayOffset);
    thisMonday.setHours(0, 0, 0, 0);

    const pickedMonday = new Date(pickedDate);
    const pickedDow = pickedDate.getDay();
    const pickedMondayOffset = pickedDow === 0 ? -6 : 1 - pickedDow;
    pickedMonday.setDate(pickedDate.getDate() + pickedMondayOffset);
    pickedMonday.setHours(0, 0, 0, 0);

    const diffWeeks = Math.round((pickedMonday - thisMonday) / (7 * 24 * 60 * 60 * 1000));
    setWeekOffset(diffWeeks);
    setShowDatePicker(false);
  }, []);

  const dates = ALL_DAYS.map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return {
      full: d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      dayNum: d.getDate(),
      monthShort: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
      year: d.getFullYear(),
      dateObj: d,
    };
  });

  const currentDateObj = dates[selectedDay]?.dateObj || new Date();

  return (
    <div style={{
      maxWidth: 900, margin: "0 auto",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: BRAND.text, padding: "20px 16px",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div style={{ cursor: "pointer" }} onClick={() => setActiveView("dashboard")}>
          <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.text }}>
            Smarter<span style={{ color: BRAND.blue }}>Dog</span>
          </div>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 2 }}>Salon Dashboard</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
          onClick={() => setActiveView("dogs")}
          style={{
            background: activeView === "dogs" ? BRAND.blueLight : BRAND.white,
            border: `1px solid ${activeView === "dogs" ? BRAND.blue : BRAND.greyLight}`,
            borderRadius: 8,
            padding: "8px 14px", fontSize: 13, fontWeight: 600,
            color: activeView === "dogs" ? BRAND.blueDark : BRAND.text,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
          }}
          onMouseEnter={(e) => { if (activeView !== "dogs") { e.currentTarget.style.borderColor = BRAND.blue; e.currentTarget.style.color = BRAND.blue; } }}
          onMouseLeave={(e) => { if (activeView !== "dogs") { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.color = BRAND.text; } }}>
            Dogs
          </button>

          <button
          onClick={() => setActiveView("humans")}
          style={{
            background: activeView === "humans" ? BRAND.tealLight : BRAND.white,
            border: `1px solid ${activeView === "humans" ? BRAND.teal : BRAND.greyLight}`,
            borderRadius: 8,
            padding: "8px 14px", fontSize: 13, fontWeight: 600,
            color: activeView === "humans" ? "#1F6659" : BRAND.text,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
          }}
          onMouseEnter={(e) => { if (activeView !== "humans") { e.currentTarget.style.borderColor = BRAND.teal; e.currentTarget.style.color = BRAND.teal; } }}
          onMouseLeave={(e) => { if (activeView !== "humans") { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.color = BRAND.text; } }}>
            Humans
          </button>

          <button
          onClick={() => setActiveView("settings")}
          style={{
            background: activeView === "settings" ? BRAND.blueLight : BRAND.white,
            border: `1px solid ${activeView === "settings" ? BRAND.blue : BRAND.greyLight}`,
            borderRadius: 8,
            padding: "8px 14px", fontSize: 13, fontWeight: 600,
            color: activeView === "settings" ? BRAND.blueDark : BRAND.text,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
          }}
          onMouseEnter={(e) => { if (activeView !== "settings") { e.currentTarget.style.borderColor = BRAND.blue; e.currentTarget.style.color = BRAND.blue; } }}
          onMouseLeave={(e) => { if (activeView !== "settings") { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.color = BRAND.text; } }}>
            Settings
          </button>
          <button style={{
            background: BRAND.coralLight, border: "none", borderRadius: 8,
            padding: "9px 16px", fontSize: 13, fontWeight: 700, color: BRAND.coral,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.coral; e.currentTarget.style.color = BRAND.white; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.coralLight; e.currentTarget.style.color = BRAND.coral; }}>
            Log out
          </button>
        </div>
      </div>

      {activeView === "settings" ? (
        <SettingsView onBack={() => setActiveView("dashboard")} config={salonConfig} onUpdateConfig={setSalonConfig} />
      ) : activeView === "humans" ? (
        <HumansView humans={humans} dogs={dogs} onOpenHuman={setSelectedHumanId} />
      ) : activeView === "dogs" ? (
        <DogsView dogs={dogs} humans={humans} onOpenDog={setSelectedDogId} />
      ) : (
        <>
          {/* Week navigation */}
          <div style={{ marginBottom: 16 }}>
            <WeekNav selectedDay={selectedDay} onSelectDay={setSelectedDay} bookingsByDay={bookingsByDay} dayOpenState={dayOpenState} onPrevWeek={goToPrevWeek} onNextWeek={goToNextWeek} />
          </div>

          {/* Day content */}
          {isOpen ? (
            <>
              <Legend />
              <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${BRAND.greyLight}`, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <DayHeader day={currentDayConfig.full} date={dates[selectedDay]} dogCount={dogCount} maxDogs={16} isOpen={true} onToggleOpen={() => toggleDayOpen(currentDayConfig.key)} onCalendarClick={() => setShowDatePicker(true)} />
                {activeSlots.map((slot, i) => (
                  <SlotRow key={slot} slot={slot} slotIndex={i} capacity={capacities[slot]} bookings={dayBookings} onAdd={handleAdd} onRemove={handleRemove} overrides={dayOverrides[slot]} onOverride={handleOverride} activeSlots={activeSlots} onOpenHuman={setSelectedHumanId} onOpenDog={setSelectedDogId} onUpdate={handleUpdate} currentDayKey={currentDayConfig.key} currentDateObj={currentDateObj} bookingsByDay={bookingsByDay} dayOpenState={dayOpenState} dogs={dogs} humans={humans} onUpdateDog={handleUpdateDog} />
                ))}
                <div style={{ padding: "12px 16px", borderTop: `1px solid ${BRAND.greyLight}`, background: BRAND.white, display: "flex", flexDirection: "column", gap: 8 }}>
                  {(extraSlotsByDay[currentDayConfig.key] || []).length > 0 && (
                    <button onClick={handleRemoveSlot} style={{
                      width: "100%", padding: "10px", borderRadius: 10, border: "none",
                      background: BRAND.blue, color: BRAND.white, fontSize: 13, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.blueDark; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.blue; }}>
                      Remove added timeslot
                    </button>
                  )}
                  <button onClick={handleAddSlot} style={{
                    width: "100%", padding: "10px", borderRadius: 10, border: "none",
                    background: BRAND.coral, color: BRAND.white, fontSize: 13, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#D9466F"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.coral; }}>
                    Add another timeslot
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <DayHeader day={currentDayConfig.full} date={dates[selectedDay]} dogCount={0} maxDogs={16} isOpen={false} onToggleOpen={() => toggleDayOpen(currentDayConfig.key)} onCalendarClick={() => setShowDatePicker(true)} />
              <ClosedDayView onOpen={() => toggleDayOpen(currentDayConfig.key)} />
            </div>
          )}

          {showDatePicker && (
            <DatePickerModal
              currentDate={currentDateObj}
              dayOpenState={dayOpenState}
              onSelectDate={handleDatePick}
              onClose={() => setShowDatePicker(false)}
            />
          )}
        </>
      )}

      {selectedHumanId && <HumanCardModal humanId={selectedHumanId} onClose={() => setSelectedHumanId(null)} onOpenHuman={setSelectedHumanId} onOpenDog={setSelectedDogId} humans={humans} dogs={dogs} onUpdateHuman={handleUpdateHuman} />}
      {selectedDogId && <DogCardModal dogId={selectedDogId} onClose={() => setSelectedDogId(null)} onOpenHuman={setSelectedHumanId} dogs={dogs} onUpdateDog={handleUpdateDog} />}
    </div>
  );
}
