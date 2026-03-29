# Phase 2 — Core Functionality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build customer self-booking, notifications, pagination, booking history, and decompose App.jsx — making this a complete, production-ready product.

**Architecture:** Five workstreams. Three independent (2.3 Pagination, 2.4 Booking History, 2.5 App.jsx Decomposition) can run in parallel from day one. 2.1 Customer Self-Booking is the biggest piece. 2.2 Notifications depends on 2.1. Orchestrator + step components pattern for the booking wizard. All new files in TypeScript.

**Tech Stack:** React 19, Supabase (Postgres + Auth + Edge Functions + Realtime), Twilio (WhatsApp/SMS), SendGrid (email), Vite, TypeScript.

---

## File Structure

### New files

```
src/types/index.ts                          (modify — add new types)
src/engine/capacity.ts                      (modify — add findGroupedSlots)
src/engine/capacity.test.js                 (modify — add grouping tests)

src/components/customer/booking/BookingWizard.tsx
src/components/customer/booking/DogSelection.tsx
src/components/customer/booking/ServiceSelection.tsx
src/components/customer/booking/DateSelection.tsx
src/components/customer/booking/SlotSelection.tsx
src/components/customer/booking/BookingConfirmation.tsx
src/components/customer/booking/AddDogInline.tsx

src/CustomerApp.jsx                         (modify — add /customer/book route)
src/components/customer/CustomerDashboard.jsx (modify — add "Book Now" button, group cancel)

supabase/migrations/007_phase2_booking.sql
supabase/migrations/008_notification_log.sql

supabase/functions/notify-booking-confirmed/index.ts
supabase/functions/notify-booking-reminder/index.ts
supabase/functions/notify-booking-cancelled/index.ts

src/supabase/hooks/useDogs.js               (modify → useDogs.ts — pagination + search)
src/supabase/hooks/useHumans.js             (modify → useHumans.ts — pagination + search)
src/supabase/hooks/useBookings.js           (modify — add fetchBookingHistoryForDog)
src/components/views/DogsView.jsx           (modify — server-side search, load more)
src/components/views/HumansView.jsx         (modify — server-side search, load more)
src/components/modals/NewBookingModal.jsx   (modify — debounced dog search)
src/components/modals/DogCardModal.jsx      (modify — add GroomingHistory section)

src/hooks/useModalState.ts                  (new — extracted from App.jsx)
src/hooks/useBookingActions.ts              (new — extracted from App.jsx)
src/components/layout/WeekCalendarView.jsx  (new — extracted from App.jsx)
src/components/layout/AppToolbar.jsx        (new — extracted from App.jsx)
src/App.jsx                                 (modify — slim down to ~200 lines)
```

---

## Workstream A: App.jsx Decomposition (2.5)

Do this first — it reduces merge conflicts for everything else.

### Task 1: Extract useModalState hook

**Files:**
- Create: `src/hooks/useModalState.ts`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create `src/hooks/useModalState.ts`**

```typescript
import { useState, useCallback } from "react";

export interface ModalState {
  selectedHumanId: string | null;
  selectedDogId: string | null;
  showDatePicker: boolean;
  showNewBooking: { dateStr: string; slot: string } | null;
  showAddDogModal: boolean;
  showAddHumanModal: boolean;
  rebookData: any | null;
  showRebookDatePicker: boolean;
}

export interface ModalHandlers {
  setSelectedHumanId: (id: string | null) => void;
  setSelectedDogId: (id: string | null) => void;
  setShowDatePicker: (show: boolean) => void;
  setShowNewBooking: (data: { dateStr: string; slot: string } | null) => void;
  setShowAddDogModal: (show: boolean) => void;
  setShowAddHumanModal: (show: boolean) => void;
  setRebookData: (data: any | null) => void;
  setShowRebookDatePicker: (show: boolean) => void;
  openNewBooking: (dateStr: string, slot: string) => void;
  closeNewBooking: () => void;
  closeRebook: () => void;
}

export function useModalState(): ModalState & ModalHandlers {
  const [selectedHumanId, setSelectedHumanId] = useState<string | null>(null);
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showNewBooking, setShowNewBooking] = useState<{ dateStr: string; slot: string } | null>(null);
  const [showAddDogModal, setShowAddDogModal] = useState(false);
  const [showAddHumanModal, setShowAddHumanModal] = useState(false);
  const [rebookData, setRebookData] = useState<any | null>(null);
  const [showRebookDatePicker, setShowRebookDatePicker] = useState(false);

  const openNewBooking = useCallback((dateStr: string, slot: string) => {
    setShowNewBooking({ dateStr, slot });
  }, []);

  const closeNewBooking = useCallback(() => {
    setShowNewBooking(null);
  }, []);

  const closeRebook = useCallback(() => {
    setRebookData(null);
    setShowRebookDatePicker(false);
  }, []);

  return {
    selectedHumanId, setSelectedHumanId,
    selectedDogId, setSelectedDogId,
    showDatePicker, setShowDatePicker,
    showNewBooking, setShowNewBooking,
    showAddDogModal, setShowAddDogModal,
    showAddHumanModal, setShowAddHumanModal,
    rebookData, setRebookData,
    showRebookDatePicker, setShowRebookDatePicker,
    openNewBooking,
    closeNewBooking,
    closeRebook,
  };
}
```

- [ ] **Step 2: Update `src/App.jsx` to use the new hook**

Replace all 8 modal-related `useState` calls (lines 88-95 in App.jsx) with:

```javascript
import { useModalState } from "./hooks/useModalState.js";

// Inside App():
const {
  selectedHumanId, setSelectedHumanId,
  selectedDogId, setSelectedDogId,
  showDatePicker, setShowDatePicker,
  showNewBooking, setShowNewBooking,
  showAddDogModal, setShowAddDogModal,
  showAddHumanModal, setShowAddHumanModal,
  rebookData, setRebookData,
  showRebookDatePicker, setShowRebookDatePicker,
  closeRebook,
} = useModalState();
```

Remove the individual `useState` declarations for these 8 variables. All references in App.jsx remain the same — the destructured names match.

- [ ] **Step 3: Verify the app loads and all modals still work**

Run: `npm run dev`

Open the staff dashboard. Test:
- Click a booking → BookingDetailModal opens/closes
- Click "+ New Booking" → NewBookingModal opens/closes
- Click "Dogs" → DogsView renders
- Click a dog name → DogCardModal opens
- Click a human name → HumanCardModal opens

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useModalState.ts src/App.jsx
git commit -m "refactor: extract useModalState hook from App.jsx"
```

---

### Task 2: Extract AppToolbar component

**Files:**
- Create: `src/components/layout/AppToolbar.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create `src/components/layout/AppToolbar.jsx`**

Extract the toolbar section from App.jsx (lines 387-562 — the div containing the logo, "+ New Booking" button, view tabs, and sign out button).

```jsx
import { BRAND } from "../../constants/index.js";

export function AppToolbar({
  activeView,
  setActiveView,
  onNewBooking,
  onSignOut,
  isOnline,
  user,
}) {
  return (
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
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={onNewBooking}
          style={{
            background: BRAND.blue,
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 700,
            color: BRAND.white,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.blueDark; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.blue; }}
        >
          + New Booking
        </button>

        {["dogs", "humans", "settings"].map((view) => {
          const isActive = activeView === view;
          const colors = view === "humans"
            ? { active: BRAND.tealLight, border: BRAND.teal, text: "#1F6659" }
            : { active: BRAND.blueLight, border: BRAND.blue, text: BRAND.blueDark };

          return (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              style={{
                background: isActive ? colors.active : BRAND.white,
                border: `1px solid ${isActive ? colors.border : BRAND.greyLight}`,
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: isActive ? colors.text : BRAND.text,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = colors.border;
                  e.currentTarget.style.color = colors.border;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = BRAND.greyLight;
                  e.currentTarget.style.color = BRAND.text;
                }
              }}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          );
        })}

        {isOnline && user && (
          <button
            onClick={onSignOut}
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
  );
}
```

- [ ] **Step 2: Replace the toolbar JSX in App.jsx with the component**

```jsx
import { AppToolbar } from "./components/layout/AppToolbar.jsx";

// In the render, replace the entire toolbar div (lines 387-562) with:
<AppToolbar
  activeView={activeView}
  setActiveView={setActiveView}
  onNewBooking={() => setShowNewBooking({ dateStr: currentDateStr, slot: "" })}
  onSignOut={signOut}
  isOnline={isOnline}
  user={user}
/>
```

- [ ] **Step 3: Verify toolbar still works**

Run: `npm run dev`

Test: click each nav tab (Dogs, Humans, Settings, Dashboard), click "+ New Booking", click "Log out".

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppToolbar.jsx src/App.jsx
git commit -m "refactor: extract AppToolbar component from App.jsx"
```

---

### Task 3: Extract WeekCalendarView component

**Files:**
- Create: `src/components/layout/WeekCalendarView.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create `src/components/layout/WeekCalendarView.jsx`**

Extract the entire dashboard view (WeekNav + Legend + DayHeader + SlotRows + extra slot buttons + DatePickerModal + Rebook modal) from App.jsx (lines 602-984).

```jsx
import { useMemo, lazy, Suspense, useCallback } from "react";
import { BRAND, SALON_SLOTS } from "../../constants/index.js";
import { computeSlotCapacities, canBookSlot } from "../../engine/capacity.js";
import { toDateStr } from "../../supabase/transforms.js";
import { getDefaultOpenForDate } from "../../engine/utils.js";
import { Legend } from "../ui/Legend.jsx";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { SlotRow } from "../booking/SlotRow.jsx";
import { DayHeader } from "./DayHeader.jsx";
import { ClosedDayView } from "./ClosedDayView.jsx";
import { WeekNav } from "./WeekNav.jsx";
import { DaySummary } from "./DaySummary.jsx";
import { AddBookingForm } from "../booking/AddBookingForm.jsx";

const DatePickerModal = lazy(() =>
  import("../modals/DatePickerModal.jsx").then((module) => ({
    default: module.DatePickerModal,
  })),
);

export function WeekCalendarView({
  // Week nav
  selectedDay, setSelectedDay, dates, goToPrevWeek, goToNextWeek,
  // Data
  bookingsByDate, daySettings, dayOpenState,
  currentDateStr, currentDateObj, currentDayConfig, currentSettings,
  // Handlers
  handleAdd, toggleDayOpen, handleOverride, handleAddSlot, handleRemoveSlot,
  // Modal state
  showDatePicker, setShowDatePicker, handleDatePick,
  rebookData, setRebookData, showRebookDatePicker, setShowRebookDatePicker,
  handleOpenRebook,
  // Shared data
  dogs, humans,
  // Booking modal
  onOpenNewBooking,
}) {
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

  // --- Rebook derived state ---
  const rebookDateStr = rebookData?.dateStr || "";
  const rebookSettings = rebookData
    ? daySettings[rebookDateStr] || {
        isOpen: dayOpenState[rebookDateStr] ?? getDefaultOpenForDate(rebookData.date),
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

  return (
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
                onOpenNewBooking={(dateStr, slot) => onOpenNewBooking(dateStr, slot)}
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
                    width: "100%", padding: "10px", borderRadius: 10, border: "none",
                    background: BRAND.blue, color: BRAND.white, fontSize: 13,
                    fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.blueDark; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.blue; }}
                >
                  Remove added timeslot
                </button>
              )}
              <button
                onClick={handleAddSlot}
                style={{
                  width: "100%", padding: "10px", borderRadius: 10, border: "none",
                  background: BRAND.coral, color: BRAND.white, fontSize: 13,
                  fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#D9466F"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.coral; }}
              >
                Add another timeslot
              </button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
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

      {/* Rebook modal and date picker — move entire rebook JSX from App.jsx here */}
      {rebookData && (
        <div
          onClick={() => { setRebookData(null); setShowRebookDatePicker(false); }}
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.35)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            background: BRAND.white, borderRadius: 16, width: 420,
            padding: "20px 24px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: BRAND.text, marginBottom: 4 }}>
              Rebook {rebookData.dogName}
            </div>
            <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 12 }}>
              Pre-filled from previous appointment. Choose a date and slot, then confirm.
            </div>

            <button
              type="button"
              onClick={() => setShowRebookDatePicker(true)}
              style={{
                width: "100%", marginBottom: 10, padding: "10px 12px",
                borderRadius: 10, border: `1.5px solid ${BRAND.greyLight}`,
                background: BRAND.white, color: BRAND.text, fontSize: 13,
                fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <span>
                {rebookData.date
                  ? rebookData.date.toLocaleDateString("en-GB", {
                      weekday: "short", day: "numeric", month: "short", year: "numeric",
                    })
                  : "Choose date"}
              </span>
              <span>📅</span>
            </button>

            {!rebookDayOpen && (
              <div style={{
                marginBottom: 10, padding: "10px 12px", borderRadius: 8,
                background: BRAND.coralLight, color: BRAND.coral, fontSize: 12, fontWeight: 700,
              }}>
                This day is currently closed. Choose another date.
              </div>
            )}

            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
              gap: 6, marginBottom: 12,
            }}>
              {rebookSlots.map((slot) => {
                const allowed = canBookSlot(rebookBookings, slot, rebookData.size, rebookSlots, {
                  overrides: rebookSettings?.overrides?.[slot] || {},
                }).allowed;
                return (
                  <button
                    key={slot} type="button" disabled={!allowed}
                    onClick={() => setRebookData((prev) => ({ ...prev, slot }))}
                    style={{
                      padding: "8px 0", borderRadius: 8,
                      border: `1.5px solid ${rebookData.slot === slot ? BRAND.blue : BRAND.greyLight}`,
                      background: rebookData.slot === slot ? BRAND.blue : BRAND.white,
                      color: rebookData.slot === slot ? BRAND.white : allowed ? BRAND.text : BRAND.textLight,
                      fontSize: 13, fontWeight: 600,
                      cursor: allowed ? "pointer" : "not-allowed",
                      opacity: allowed ? 1 : 0.5, fontFamily: "inherit",
                    }}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>

            {rebookAvailableSlots.length === 0 && (
              <div style={{ marginBottom: 12, fontSize: 12, color: BRAND.coral, fontWeight: 700 }}>
                No bookable slots are available for this dog on the selected date.
              </div>
            )}

            <AddBookingForm
              slot={rebookData.slot}
              bookings={rebookBookings}
              activeSlots={rebookSlots}
              dogs={dogs}
              humans={humans}
              prefill={rebookData}
              slotOverrides={rebookSettings?.overrides?.[rebookData.slot] || {}}
              onAdd={async (booking) => {
                const saved = await handleAdd(booking, rebookData.dateStr);
                if (saved) { setRebookData(null); setShowRebookDatePicker(false); }
                return saved;
              }}
              onCancel={() => { setRebookData(null); setShowRebookDatePicker(false); }}
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
                isOpen: dayOpenState[newDateStr] ?? getDefaultOpenForDate(newDate),
                overrides: {}, extraSlots: [],
              };
              const slots = [...SALON_SLOTS, ...(settings.extraSlots || [])];
              const bookings = bookingsByDate[newDateStr] || [];
              const nextSlot = slots.find(
                (slot) => canBookSlot(bookings, slot, rebookData.size, slots, {
                  overrides: settings.overrides?.[slot] || {},
                }).allowed,
              ) || "";
              setRebookData((prev) => ({ ...prev, date: newDate, dateStr: newDateStr, slot: nextSlot }));
              setShowRebookDatePicker(false);
            }}
            onClose={() => setShowRebookDatePicker(false)}
          />
        </Suspense>
      )}
    </>
  );
}
```

- [ ] **Step 2: Replace the dashboard rendering in App.jsx**

Replace the entire `activeView === "dashboard"` branch and all rebook/date picker JSX in App.jsx with:

```jsx
import { WeekCalendarView } from "./components/layout/WeekCalendarView.jsx";

// In the Suspense block, replace the dashboard branch:
<WeekCalendarView
  selectedDay={selectedDay}
  setSelectedDay={setSelectedDay}
  dates={dates}
  goToPrevWeek={goToPrevWeek}
  goToNextWeek={goToNextWeek}
  bookingsByDate={bookingsByDate}
  daySettings={daySettings}
  dayOpenState={dayOpenState}
  currentDateStr={currentDateStr}
  currentDateObj={currentDateObj}
  currentDayConfig={currentDayConfig}
  currentSettings={currentSettings}
  handleAdd={handleAdd}
  toggleDayOpen={toggleDayOpen}
  handleOverride={handleOverride}
  handleAddSlot={handleAddSlot}
  handleRemoveSlot={handleRemoveSlot}
  showDatePicker={showDatePicker}
  setShowDatePicker={setShowDatePicker}
  handleDatePick={handleDatePick}
  rebookData={rebookData}
  setRebookData={setRebookData}
  showRebookDatePicker={showRebookDatePicker}
  setShowRebookDatePicker={setShowRebookDatePicker}
  handleOpenRebook={handleOpenRebook}
  dogs={dogs}
  humans={humans}
  onOpenNewBooking={(dateStr, slot) => setShowNewBooking({ dateStr, slot })}
/>
```

Also remove the `computeSlotCapacities` useMemo, `activeSlots` useMemo, `capacities` useMemo, `dayOpenState` useMemo, `dogCount`, and all rebook-derived-state computations from App.jsx — they now live in WeekCalendarView. Keep `dayOpenState` in App.jsx as it's used by other components.

- [ ] **Step 3: Remove unused imports from App.jsx**

Remove imports for: `Legend`, `SlotRow`, `DayHeader`, `ClosedDayView`, `DaySummary`, `AddBookingForm`, `DatePickerModal` lazy import. These are now imported by WeekCalendarView.

- [ ] **Step 4: Verify the entire dashboard still works**

Run: `npm run dev`

Test: navigate weeks, click slots, open bookings, add bookings, rebook, date picker, open/close days. Everything must behave identically.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/WeekCalendarView.jsx src/App.jsx
git commit -m "refactor: extract WeekCalendarView component from App.jsx"
```

---

### Task 4: Verify App.jsx is under target size

**Files:**
- Verify: `src/App.jsx`

- [ ] **Step 1: Check line count**

Run: `wc -l src/App.jsx`

Expected: under 250 lines. If over, identify what else can be extracted. The remaining App.jsx should contain only: auth check, data loading hooks, `useModalState`/`useBookingActions` calls, `activeView` state, view switcher, and modal declarations.

- [ ] **Step 2: Commit if any further cleanup was needed**

```bash
git add src/App.jsx
git commit -m "refactor: final App.jsx cleanup — target size reached"
```

---

## Workstream B: Booking History Per Dog (2.4)

### Task 5: Add fetchBookingHistoryForDog to useBookings

**Files:**
- Modify: `src/supabase/hooks/useBookings.js`

- [ ] **Step 1: Add the function**

Add this function inside `useBookings`, just before the `return` statement (before line 365):

```javascript
const fetchBookingHistoryForDog = useCallback(async (dogId) => {
  if (!supabase) return [];

  const { data, error: err } = await supabase
    .from("bookings")
    .select("*")
    .eq("dog_id", dogId)
    .order("booking_date", { ascending: false })
    .limit(10);

  if (err) {
    console.error("Failed to fetch booking history:", err);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    date: row.booking_date,
    slot: row.slot,
    service: row.service,
    status: row.status,
    size: row.size,
    addons: row.addons || [],
    payment: row.payment,
  }));
}, []);
```

- [ ] **Step 2: Add it to the return object**

```javascript
return {
  bookingsByDate,
  loading,
  error,
  addBooking,
  removeBooking,
  updateBooking,
  fetchBookingHistoryForDog, // new
};
```

- [ ] **Step 3: Commit**

```bash
git add src/supabase/hooks/useBookings.js
git commit -m "feat: add fetchBookingHistoryForDog to useBookings hook"
```

---

### Task 6: Add GroomingHistory section to DogCardModal

**Files:**
- Modify: `src/components/modals/DogCardModal.jsx`

- [ ] **Step 1: Read the existing DogCardModal structure**

Read `src/components/modals/DogCardModal.jsx` to understand where to add the new section. Look for the existing `BookingHistory` component (lines 9-75) and the render location.

- [ ] **Step 2: Replace the existing BookingHistory with an enhanced GroomingHistory**

The current `BookingHistory` component in DogCardModal (lines 9-75) filters `bookingsByDate` client-side by `dogName`. Replace it with a version that uses `fetchBookingHistoryForDog` for server-side fetching with frequency and overdue indicators.

Add a new prop `fetchBookingHistoryForDog` to DogCardModal. Then replace the `BookingHistory` function:

```jsx
function GroomingHistory({ dogId, fetchBookingHistoryForDog }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetchBookingHistoryForDog(dogId).then((results) => {
      if (!cancelled) {
        setHistory(results);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [dogId, fetchBookingHistoryForDog]);

  if (loading) {
    return (
      <div style={{ padding: "0 24px" }}>
        <div style={{ marginTop: 16, fontWeight: 800, fontSize: 12, color: BRAND.blueDark, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          Grooming History
        </div>
        <div style={{ fontSize: 13, color: BRAND.textLight, padding: "8px 0" }}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "0 24px" }}>
        <div style={{ marginTop: 16, fontWeight: 800, fontSize: 12, color: BRAND.blueDark, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          Grooming History
        </div>
        <div style={{ fontSize: 13, color: BRAND.coral, padding: "8px 0", cursor: "pointer" }}
          onClick={() => { setLoading(true); setError(false); fetchBookingHistoryForDog(dogId).then(setHistory).catch(() => setError(true)).finally(() => setLoading(false)); }}>
          Couldn't load history. Tap to retry.
        </div>
      </div>
    );
  }

  const completed = history.filter((b) => b.status === "Completed");

  // Calculate last visit and frequency
  let lastVisitText = "";
  let frequencyText = "";
  let isOverdue = false;

  if (completed.length > 0) {
    const lastDate = new Date(completed[0].date + "T00:00:00");
    const now = new Date();
    const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    const weeksSince = Math.floor(daysSince / 7);

    if (weeksSince === 0) lastVisitText = "Last visit: this week";
    else if (weeksSince === 1) lastVisitText = "Last visit: 1 week ago";
    else lastVisitText = `Last visit: ${weeksSince} weeks ago`;

    if (completed.length >= 2) {
      const gaps = [];
      for (let i = 0; i < completed.length - 1; i++) {
        const d1 = new Date(completed[i].date + "T00:00:00");
        const d2 = new Date(completed[i + 1].date + "T00:00:00");
        gaps.push(Math.floor((d1 - d2) / (1000 * 60 * 60 * 24 * 7)));
      }
      const avgGap = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
      const minGap = Math.min(...gaps);
      const maxGap = Math.max(...gaps);

      if (minGap === maxGap) frequencyText = `Usually every ${avgGap} weeks`;
      else frequencyText = `Usually every ${minGap}–${maxGap} weeks`;

      if (weeksSince > maxGap + 2) {
        isOverdue = true;
        lastVisitText = `Overdue — last visit was ${weeksSince} weeks ago`;
      }
    }
  }

  if (history.length === 0) {
    return (
      <div style={{ padding: "0 24px" }}>
        <div style={{ marginTop: 16, fontWeight: 800, fontSize: 12, color: BRAND.blueDark, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          Grooming History
        </div>
        <div style={{ fontSize: 13, color: BRAND.textLight, padding: "8px 0" }}>No previous visits recorded</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 24px" }}>
      <div style={{ marginTop: 16, fontWeight: 800, fontSize: 12, color: BRAND.blueDark, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        Grooming History
      </div>
      {lastVisitText && (
        <div style={{ fontSize: 13, fontWeight: 700, color: isOverdue ? BRAND.coral : BRAND.text, marginBottom: 4 }}>
          {lastVisitText}
        </div>
      )}
      {frequencyText && (
        <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 8 }}>
          {frequencyText}
        </div>
      )}
      {history.map((b) => {
        const svc = SERVICES.find((s) => s.id === b.service);
        return (
          <div key={b.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "6px 0", borderBottom: `1px solid ${BRAND.greyLight}`,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>
                {svc ? `${svc.icon} ${svc.name}` : b.service}
              </div>
              <div style={{ fontSize: 11, color: BRAND.textLight }}>
                {new Date(b.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.textLight }}>
              {b.status}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Update DogCardModal to accept and pass the new prop**

Add `fetchBookingHistoryForDog` to DogCardModal's props. Replace the `<BookingHistory>` usage with:

```jsx
<GroomingHistory dogId={dogId} fetchBookingHistoryForDog={fetchBookingHistoryForDog} />
```

- [ ] **Step 4: Thread the prop from App.jsx**

In `src/App.jsx`, destructure `fetchBookingHistoryForDog` from `useBookings` and pass it to `DogCardModal`:

```jsx
const { bookingsByDate: sbBookings, loading: bl, error: be, addBooking: sbAddBooking, removeBooking: sbRemoveBooking, updateBooking: sbUpdateBooking, fetchBookingHistoryForDog } = useBookings(weekStart, dogsById, humansById);

// In the DogCardModal render:
<DogCardModal
  dogId={selectedDogId}
  onClose={() => setSelectedDogId(null)}
  onOpenHuman={setSelectedHumanId}
  dogs={dogs}
  humans={humans}
  onUpdateDog={updateDog}
  bookingsByDate={bookingsByDate}
  fetchBookingHistoryForDog={fetchBookingHistoryForDog}
/>
```

- [ ] **Step 5: Verify grooming history displays**

Run: `npm run dev`

Open the staff dashboard. Click on a dog → DogCardModal should show the "Grooming History" section with last visit, frequency, and list of past bookings.

- [ ] **Step 6: Commit**

```bash
git add src/supabase/hooks/useBookings.js src/components/modals/DogCardModal.jsx src/App.jsx
git commit -m "feat: add grooming history with frequency tracking to DogCardModal"
```

---

## Workstream C: Pagination & Server-Side Search (2.3)

### Task 7: Convert useDogs to TypeScript with pagination

**Files:**
- Rename: `src/supabase/hooks/useDogs.js` → `src/supabase/hooks/useDogs.ts`

- [ ] **Step 1: Add pagination types to `src/types/index.ts`**

```typescript
export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  totalCount: number;
}

export interface SearchState {
  query: string;
  isSearching: boolean;
}
```

- [ ] **Step 2: Rename and convert `useDogs.js` to `useDogs.ts`**

```bash
mv src/supabase/hooks/useDogs.js src/supabase/hooks/useDogs.ts
```

- [ ] **Step 3: Add pagination and server-side search to useDogs**

Add these new state variables and functions to `useDogs`. Keep the existing `dogs`, `dogsById`, `updateDog`, `addDog` — they still work. Add:

```typescript
const PAGE_SIZE = 50;
const [hasMore, setHasMore] = useState(false);
const [totalCount, setTotalCount] = useState(0);
const [searchQuery, setSearchQuery] = useState("");
const [isSearching, setIsSearching] = useState(false);
const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Modify the `fetchDogs` function to accept a `limit` and track `hasMore`:

```typescript
async function fetchDogs(limit = PAGE_SIZE) {
  setLoading(true);
  setError(null);

  const { count } = await supabase
    .from("dogs")
    .select("*", { count: "exact", head: true });

  const { data, error: err } = await supabase
    .from("dogs")
    .select("*")
    .order("name")
    .limit(limit);

  if (cancelled) return;

  if (err) { setError(err.message); setLoading(false); return; }

  const rows = data || [];
  setTotalCount(count || 0);
  setHasMore(rows.length >= limit);
  setDogsById(buildDogsById(rows));
  setDogs(dbDogsToMap(rows, humansById || {}));
  setLoading(false);
}
```

Add `loadMore`:

```typescript
const loadMore = useCallback(async () => {
  if (!supabase || !hasMore) return;

  const currentCount = Object.keys(dogsById).length;
  const { data, error: err } = await supabase
    .from("dogs")
    .select("*")
    .order("name")
    .range(currentCount, currentCount + PAGE_SIZE - 1);

  if (err) { console.error("Failed to load more dogs:", err); return; }

  const rows = data || [];
  setHasMore(rows.length >= PAGE_SIZE);

  const newDogsById = buildDogsById(rows);
  setDogsById((prev) => ({ ...prev, ...newDogsById }));

  const newDogsMap = dbDogsToMap(rows, humansById || {});
  setDogs((prev) => ({ ...prev, ...newDogsMap }));
}, [hasMore, dogsById, humansById]);
```

Add `searchDogs`:

```typescript
const searchDogs = useCallback((query: string) => {
  setSearchQuery(query);

  if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

  if (!query.trim()) {
    setIsSearching(false);
    // Re-fetch initial page
    fetchDogs();
    return;
  }

  setIsSearching(true);

  searchTimeoutRef.current = setTimeout(async () => {
    if (!supabase) return;

    const { data, error: err } = await supabase
      .from("dogs")
      .select("*")
      .ilike("name", `%${query.trim()}%`)
      .order("name")
      .limit(PAGE_SIZE);

    if (err) { console.error("Search failed:", err); setIsSearching(false); return; }

    const rows = data || [];
    setDogsById(buildDogsById(rows));
    setDogs(dbDogsToMap(rows, humansById || {}));
    setHasMore(false);
    setIsSearching(false);
  }, 300);
}, [humansById]);
```

Update the return:

```typescript
return { dogs, dogsById, loading, error, updateDog, addDog, hasMore, totalCount, loadMore, searchDogs, searchQuery, isSearching };
```

- [ ] **Step 4: Update all import paths from `useDogs.js` to `useDogs.js`**

Vite resolves `.ts` files from `.js` imports, so existing `import { useDogs } from "./supabase/hooks/useDogs.js"` in App.jsx will continue to work. No import changes needed.

- [ ] **Step 5: Verify dogs still load on the dashboard**

Run: `npm run dev`

Staff dashboard should load dogs normally. Click "Dogs" view — should show the list.

- [ ] **Step 6: Commit**

```bash
git add src/supabase/hooks/useDogs.ts src/types/index.ts
git rm src/supabase/hooks/useDogs.js 2>/dev/null || true
git commit -m "feat: add pagination and server-side search to useDogs hook"
```

---

### Task 8: Convert useHumans to TypeScript with pagination

**Files:**
- Rename: `src/supabase/hooks/useHumans.js` → `src/supabase/hooks/useHumans.ts`

- [ ] **Step 1: Rename and add pagination/search**

Follow the exact same pattern as Task 7 but for `useHumans`. The search query uses:

```typescript
const { data, error: err } = await supabase
  .from("humans")
  .select("*")
  .or(`name.ilike.%${query.trim()}%,surname.ilike.%${query.trim()}%`)
  .order("name")
  .order("surname")
  .limit(PAGE_SIZE);
```

Add `hasMore`, `totalCount`, `loadMore`, `searchHumans`, `searchQuery`, `isSearching` to the return object, following the same structure as useDogs.

- [ ] **Step 2: Commit**

```bash
git add src/supabase/hooks/useHumans.ts
git rm src/supabase/hooks/useHumans.js 2>/dev/null || true
git commit -m "feat: add pagination and server-side search to useHumans hook"
```

---

### Task 9: Update DogsView with server-side search and load more

**Files:**
- Modify: `src/components/views/DogsView.jsx`

- [ ] **Step 1: Update DogsView props and remove client-side filtering**

Add new props: `hasMore`, `totalCount`, `loadMore`, `onSearch`, `searchQuery`, `isSearching`.

Remove the `filteredDogs` useMemo that does client-side filtering. Replace the search input's `onChange` to call `onSearch(e.target.value)` instead of `setSearchQuery`.

Replace `filteredDogs` with:

```jsx
const sortedDogs = useMemo(() => {
  return Object.values(dogs).sort((a, b) => a.name.localeCompare(b.name));
}, [dogs]);
```

- [ ] **Step 2: Add count indicator and load more button**

After the dog grid, add:

```jsx
<div style={{ textAlign: "center", padding: "16px 0" }}>
  {totalCount > 0 && (
    <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 8 }}>
      Showing {sortedDogs.length} of {totalCount} dogs
    </div>
  )}
  {isSearching && (
    <div style={{ fontSize: 13, color: BRAND.textLight }}>Searching...</div>
  )}
  {hasMore && !isSearching && (
    <button
      onClick={loadMore}
      style={{
        padding: "10px 24px", borderRadius: 10,
        border: `1px solid ${BRAND.greyLight}`, background: BRAND.white,
        color: BRAND.text, fontSize: 13, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      Load more
    </button>
  )}
</div>
```

- [ ] **Step 3: Thread new props from App.jsx**

In App.jsx, pass the new props to DogsView:

```jsx
<DogsView
  dogs={dogs}
  humans={humans}
  onOpenDog={setSelectedDogId}
  onAddDog={addDog}
  hasMore={dogsHasMore}
  totalCount={dogsTotalCount}
  loadMore={dogsLoadMore}
  onSearch={dogsSearch}
  searchQuery={dogsSearchQuery}
  isSearching={dogsIsSearching}
/>
```

Destructure the new values from useDogs in App.jsx:

```jsx
const { dogs: sbDogs, dogsById, loading: dl, error: de, updateDog: sbUpdateDog, addDog: sbAddDog,
  hasMore: dogsHasMore, totalCount: dogsTotalCount, loadMore: dogsLoadMore,
  searchDogs: dogsSearch, searchQuery: dogsSearchQuery, isSearching: dogsIsSearching,
} = useDogs(humansById);
```

- [ ] **Step 4: Verify**

Run: `npm run dev`

Open Dogs view. Should show "Showing X of Y dogs". Type in search — should query server after 300ms. Click "Load more" if there are >50 dogs.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/DogsView.jsx src/App.jsx
git commit -m "feat: server-side search and load more in DogsView"
```

---

### Task 10: Update HumansView with server-side search and load more

**Files:**
- Modify: `src/components/views/HumansView.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Follow the same pattern as Task 9 for HumansView**

Same changes: remove client-side filtering, add `onSearch`, `hasMore`, `totalCount`, `loadMore`, `isSearching` props. Thread from App.jsx using the new useHumans exports.

- [ ] **Step 2: Verify and commit**

```bash
git add src/components/views/HumansView.jsx src/App.jsx
git commit -m "feat: server-side search and load more in HumansView"
```

---

### Task 11: Update NewBookingModal dog search to use server-side search

**Files:**
- Modify: `src/components/modals/NewBookingModal.jsx`

- [ ] **Step 1: Read NewBookingModal to find the dog search pattern**

Look for where dogs are filtered client-side for the dog selection dropdown/list.

- [ ] **Step 2: Replace client-side filter with debounced server-side search**

Pass `searchDogs` as a prop from App.jsx. In the dog search input, call `searchDogs(query)` on change. Add a small loading indicator when `isSearching` is true.

- [ ] **Step 3: Thread the prop from App.jsx**

```jsx
<NewBookingModal
  // ...existing props
  onSearchDogs={dogsSearch}
  isSearchingDogs={dogsIsSearching}
/>
```

- [ ] **Step 4: Verify and commit**

```bash
git add src/components/modals/NewBookingModal.jsx src/App.jsx
git commit -m "feat: server-side dog search in NewBookingModal"
```

---

## Workstream D: Customer Self-Booking (2.1)

### Task 12: Database migration — group_id and customer RLS

**Files:**
- Create: `supabase/migrations/007_phase2_booking.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 007_phase2_booking.sql
-- Phase 2: Customer self-booking support

-- Add group_id to bookings for multi-dog booking groups
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS group_id uuid;

CREATE INDEX IF NOT EXISTS idx_bookings_group_id
  ON bookings(group_id)
  WHERE group_id IS NOT NULL;

-- Allow customers to INSERT bookings for their own dogs
CREATE POLICY "customer_insert_own_bookings"
  ON bookings FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT is_staff()
    AND EXISTS (
      SELECT 1
      FROM dogs
      JOIN humans ON humans.id = dogs.human_id
      WHERE dogs.id = bookings.dog_id
        AND humans.customer_user_id = auth.uid()
    )
  );

-- Allow customers to INSERT their own dogs
CREATE POLICY "customer_insert_own_dogs"
  ON dogs FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT is_staff()
    AND EXISTS (
      SELECT 1
      FROM humans
      WHERE humans.id = dogs.human_id
        AND humans.customer_user_id = auth.uid()
    )
  );

-- Allow customers to read salon_config (needed for capacity checks)
CREATE POLICY "customer_select_salon_config"
  ON salon_config FOR SELECT
  TO authenticated
  USING (true);

-- Allow customers to read day_settings (needed for open/closed days)
CREATE POLICY "customer_select_day_settings"
  ON day_settings FOR SELECT
  TO authenticated
  USING (true);
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push` or apply via Supabase SQL Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_phase2_booking.sql
git commit -m "feat: add group_id column and customer booking RLS policies"
```

---

### Task 13: Add new types for wizard and slot allocation

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add types**

```typescript
export interface WizardDog {
  dogId: string;
  name: string;
  size: DogSize;
}

export interface SlotAllocation {
  dropOffTime: string;
  assignments: Array<{ dogId: string; slot: string }>;
  groupId: string;
}

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  selectedDogs: WizardDog[];
  services: Record<string, ServiceId>;
  selectedDate: string | null;
  selectedSlot: string | null;
  slotAllocation: SlotAllocation | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add wizard and slot allocation types"
```

---

### Task 14: Implement findGroupedSlots in capacity engine

**Files:**
- Modify: `src/engine/capacity.ts`
- Modify: `src/engine/capacity.test.js`

- [ ] **Step 1: Write the failing tests**

Add to the end of `src/engine/capacity.test.js`:

```javascript
import { findGroupedSlots } from "./capacity.js";

// ============================================================
section("MULTI-DOG SLOT GROUPING");
// ============================================================

// Helper: create dogs array
function dogs(sizes) {
  return sizes.map((size, i) => ({ id: `dog-${i}`, size }));
}

// 1 dog — finds any slot with capacity
{
  const result = findGroupedSlots(dogs(["small"]), [], SLOTS);
  assert(result.length > 0, "1 small dog should find available slots");
  assert(result[0].assignments.length === 1, "1 dog = 1 assignment");
  assert(result[0].dropOffTime === result[0].assignments[0].slot, "1 dog: dropoff = slot");
}

// 2 dogs — same slot
{
  const result = findGroupedSlots(dogs(["small", "small"]), [], SLOTS);
  assert(result.length > 0, "2 small dogs should find available slots");
  assert(result[0].assignments.length === 2, "2 dogs = 2 assignments");
  assert(
    result[0].assignments[0].slot === result[0].assignments[1].slot,
    "2 dogs should be in the same slot"
  );
}

// 3 dogs — 2 + 1 across adjacent slots
{
  const result = findGroupedSlots(dogs(["small", "small", "small"]), [], SLOTS);
  assert(result.length > 0, "3 small dogs should find available slots");
  assert(result[0].assignments.length === 3, "3 dogs = 3 assignments");
  const slots = result[0].assignments.map((a) => a.slot);
  const uniqueSlots = [...new Set(slots)];
  assert(uniqueSlots.length === 2, "3 dogs should use 2 different slots");
}

// 4 dogs — 2 + 2 across adjacent slots
{
  const result = findGroupedSlots(dogs(["small", "small", "small", "small"]), [], SLOTS);
  assert(result.length > 0, "4 small dogs should find available slots");
  assert(result[0].assignments.length === 4, "4 dogs = 4 assignments");
  const slots = result[0].assignments.map((a) => a.slot);
  const uniqueSlots = [...new Set(slots)];
  assert(uniqueSlots.length === 2, "4 dogs should use 2 different slots");
}

// Full day — returns empty
{
  const fullBookings = SLOTS.flatMap((slot) => [b(slot, "small"), b(slot, "small")]);
  const result = findGroupedSlots(dogs(["small"]), fullBookings, SLOTS);
  assert(result.length === 0, "Full day should return no available slots");
}

// Drop-off time is always the earlier slot for multi-dog
{
  const result = findGroupedSlots(dogs(["small", "small", "small"]), [], SLOTS);
  if (result.length > 0) {
    const assignedSlots = result[0].assignments.map((a) => a.slot).sort();
    assert(result[0].dropOffTime === assignedSlots[0], "Drop-off should be the earlier slot");
  }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node src/engine/capacity.test.js`

Expected: FAIL — `findGroupedSlots is not a function` (or similar import error).

- [ ] **Step 3: Implement findGroupedSlots in `src/engine/capacity.ts`**

Add at the end of the file:

```typescript
export function findGroupedSlots(
  dogs: Array<{ id: string; size: DogSize }>,
  bookings: Booking[],
  activeSlots: string[],
): SlotAllocation[] {
  if (dogs.length === 0 || dogs.length > 4) return [];

  const allocations: SlotAllocation[] = [];

  if (dogs.length === 1) {
    // Single dog — any slot that can fit
    for (const slot of activeSlots) {
      const result = canBookSlot(bookings, slot, dogs[0].size, activeSlots);
      if (result.allowed) {
        allocations.push({
          dropOffTime: slot,
          assignments: [{ dogId: dogs[0].id, slot }],
          groupId: crypto.randomUUID(),
        });
      }
    }
    return allocations;
  }

  if (dogs.length === 2) {
    // Two dogs — same slot
    for (const slot of activeSlots) {
      // Check if both dogs fit in this slot
      let testBookings = [...bookings];
      let allFit = true;

      for (const dog of dogs) {
        const result = canBookSlot(testBookings, slot, dog.size, activeSlots);
        if (!result.allowed) { allFit = false; break; }
        // Add a temporary booking to simulate this dog being placed
        testBookings = [...testBookings, { id: `temp-${dog.id}`, slot, size: dog.size, dogName: "", breed: "", service: "full-groom", owner: "", status: "Not Arrived", addons: [], pickupBy: "", payment: "", confirmed: false, _dogId: dog.id, _ownerId: null, _pickupById: null, _bookingDate: "" } as Booking];
      }

      if (allFit) {
        allocations.push({
          dropOffTime: slot,
          assignments: dogs.map((d) => ({ dogId: d.id, slot })),
          groupId: crypto.randomUUID(),
        });
      }
    }
    return allocations;
  }

  // 3 or 4 dogs — split across adjacent slots
  // 3 dogs: try 2+1 and 1+2
  // 4 dogs: try 2+2
  for (let i = 0; i < activeSlots.length - 1; i++) {
    const slotA = activeSlots[i];
    const slotB = activeSlots[i + 1];

    if (dogs.length === 3) {
      // Try 2 in slotA, 1 in slotB
      const split2_1 = trySlotSplit(dogs, [0, 1], [2], slotA, slotB, bookings, activeSlots);
      if (split2_1) allocations.push(split2_1);

      // Try 1 in slotA, 2 in slotB
      const split1_2 = trySlotSplit(dogs, [0], [1, 2], slotA, slotB, bookings, activeSlots);
      if (split1_2) allocations.push(split1_2);
    }

    if (dogs.length === 4) {
      // 2 in slotA, 2 in slotB
      const split2_2 = trySlotSplit(dogs, [0, 1], [2, 3], slotA, slotB, bookings, activeSlots);
      if (split2_2) allocations.push(split2_2);
    }
  }

  // Deduplicate by dropOffTime (keep first valid for each time)
  const seen = new Set<string>();
  return allocations.filter((a) => {
    if (seen.has(a.dropOffTime)) return false;
    seen.add(a.dropOffTime);
    return true;
  });
}

function trySlotSplit(
  dogs: Array<{ id: string; size: DogSize }>,
  indicesA: number[],
  indicesB: number[],
  slotA: string,
  slotB: string,
  bookings: Booking[],
  activeSlots: string[],
): SlotAllocation | null {
  // Check slot A can fit all dogs in indicesA
  let testBookings = [...bookings];
  for (const idx of indicesA) {
    const result = canBookSlot(testBookings, slotA, dogs[idx].size, activeSlots);
    if (!result.allowed) return null;
    testBookings = [...testBookings, { id: `temp-${dogs[idx].id}`, slot: slotA, size: dogs[idx].size, dogName: "", breed: "", service: "full-groom", owner: "", status: "Not Arrived", addons: [], pickupBy: "", payment: "", confirmed: false, _dogId: dogs[idx].id, _ownerId: null, _pickupById: null, _bookingDate: "" } as Booking];
  }

  // Check slot B can fit all dogs in indicesB (with slotA bookings now in place)
  for (const idx of indicesB) {
    const result = canBookSlot(testBookings, slotB, dogs[idx].size, activeSlots);
    if (!result.allowed) return null;
    testBookings = [...testBookings, { id: `temp-${dogs[idx].id}`, slot: slotB, size: dogs[idx].size, dogName: "", breed: "", service: "full-groom", owner: "", status: "Not Arrived", addons: [], pickupBy: "", payment: "", confirmed: false, _dogId: dogs[idx].id, _ownerId: null, _pickupById: null, _bookingDate: "" } as Booking];
  }

  const assignments = [
    ...indicesA.map((idx) => ({ dogId: dogs[idx].id, slot: slotA })),
    ...indicesB.map((idx) => ({ dogId: dogs[idx].id, slot: slotB })),
  ];

  return {
    dropOffTime: slotA, // Always the earlier slot
    assignments,
    groupId: crypto.randomUUID(),
  };
}
```

Add the import at the top of capacity.ts:

```typescript
import type { Booking, DogSize, SlotCapacity, SlotCapacities, SeatState, BookingResult, SlotOverrides, LargeDogSlotRule, SlotAllocation } from "../types/index.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node src/engine/capacity.test.js`

Expected: all new grouping tests PASS alongside existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/capacity.ts src/engine/capacity.test.js
git commit -m "feat: implement findGroupedSlots for multi-dog booking"
```

---

### Task 15: Create BookingWizard orchestrator and DogSelection step

**Files:**
- Create: `src/components/customer/booking/BookingWizard.tsx`
- Create: `src/components/customer/booking/DogSelection.tsx`

- [ ] **Step 1: Create BookingWizard.tsx**

```tsx
import { useState, useEffect, useCallback } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { BRAND } from "../../../constants/index.js";
import { DogSelection } from "./DogSelection.js";
import { ServiceSelection } from "./ServiceSelection.js";
import { DateSelection } from "./DateSelection.js";
import { SlotSelection } from "./SlotSelection.js";
import { BookingConfirmation } from "./BookingConfirmation.js";
import type { WizardState, WizardDog, ServiceId, SlotAllocation } from "../../../types/index.js";

interface BookingWizardProps {
  humanRecord: { id: string; name: string; surname: string };
  onComplete: () => void;
  onCancel: () => void;
}

export function BookingWizard({ humanRecord, onComplete, onCancel }: BookingWizardProps) {
  const [wizard, setWizard] = useState<WizardState>({
    step: 1,
    selectedDogs: [],
    services: {},
    selectedDate: null,
    selectedSlot: null,
    slotAllocation: null,
  });
  const [dogs, setDogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch customer's dogs
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    async function fetchDogs() {
      const { data, error: err } = await supabase
        .from("dogs")
        .select("*")
        .order("name");

      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      setDogs(data || []);
      setLoading(false);
    }

    fetchDogs();
    return () => { cancelled = true; };
  }, [humanRecord.id]);

  const goToStep = useCallback((step: WizardState["step"]) => {
    setWizard((prev) => ({ ...prev, step }));
  }, []);

  const setSelectedDogs = useCallback((selectedDogs: WizardDog[]) => {
    setWizard((prev) => ({ ...prev, selectedDogs }));
  }, []);

  const setServices = useCallback((services: Record<string, ServiceId>) => {
    setWizard((prev) => ({ ...prev, services }));
  }, []);

  const setSelectedDate = useCallback((selectedDate: string | null) => {
    setWizard((prev) => ({ ...prev, selectedDate, selectedSlot: null, slotAllocation: null }));
  }, []);

  const setSlotAllocation = useCallback((slotAllocation: SlotAllocation | null) => {
    setWizard((prev) => ({
      ...prev,
      selectedSlot: slotAllocation?.dropOffTime || null,
      slotAllocation,
    }));
  }, []);

  const handleDogAdded = useCallback((newDog: any) => {
    setDogs((prev) => [...prev, newDog]);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!supabase || !wizard.slotAllocation) return;
    setSubmitting(true);
    setError(null);

    try {
      const { groupId, assignments } = wizard.slotAllocation;

      for (const assignment of assignments) {
        const service = wizard.services[assignment.dogId];
        const dog = dogs.find((d) => d.id === assignment.dogId);
        if (!dog) throw new Error(`Dog not found: ${assignment.dogId}`);

        const { error: err } = await supabase
          .from("bookings")
          .insert({
            booking_date: wizard.selectedDate,
            slot: assignment.slot,
            dog_id: assignment.dogId,
            size: dog.size || "medium",
            service: service || "full-groom",
            status: "Not Arrived",
            addons: [],
            payment: "Due at Pick-up",
            confirmed: false,
            group_id: assignments.length > 1 ? groupId : null,
          });

        if (err) throw err;
      }

      onComplete();
    } catch (err: any) {
      setError(err.message || "Failed to create booking");
      setSubmitting(false);
    }
  }, [wizard, dogs, onComplete]);

  const stepTitles = ["Select Dogs", "Choose Services", "Pick Date", "Pick Time", "Confirm"];

  return (
    <div style={{
      minHeight: "100vh", background: "#F8FFFE", padding: 20,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: BRAND.text }}>
              Book a Groom
            </div>
            <div style={{ fontSize: 13, color: BRAND.textLight }}>
              Step {wizard.step} of 5 — {stepTitles[wizard.step - 1]}
            </div>
          </div>
          <button onClick={onCancel} style={{
            background: "none", border: "none", fontSize: 13, fontWeight: 600,
            color: BRAND.textLight, cursor: "pointer", fontFamily: "inherit",
          }}>
            Cancel
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: s <= wizard.step ? BRAND.teal : BRAND.greyLight,
              transition: "background 0.2s",
            }} />
          ))}
        </div>

        {error && (
          <div style={{
            marginBottom: 16, padding: "10px 14px", borderRadius: 10,
            background: BRAND.coralLight, color: BRAND.coral, fontSize: 13, fontWeight: 600,
          }}>
            {error}
          </div>
        )}

        {/* Steps */}
        {wizard.step === 1 && (
          <DogSelection
            dogs={dogs}
            selectedDogs={wizard.selectedDogs}
            onSelect={setSelectedDogs}
            onNext={() => goToStep(2)}
            onDogAdded={handleDogAdded}
            humanId={humanRecord.id}
            loading={loading}
          />
        )}
        {wizard.step === 2 && (
          <ServiceSelection
            selectedDogs={wizard.selectedDogs}
            services={wizard.services}
            onSelect={setServices}
            onNext={() => goToStep(3)}
            onBack={() => goToStep(1)}
          />
        )}
        {wizard.step === 3 && (
          <DateSelection
            selectedDate={wizard.selectedDate}
            onSelect={setSelectedDate}
            onNext={() => goToStep(4)}
            onBack={() => goToStep(2)}
          />
        )}
        {wizard.step === 4 && (
          <SlotSelection
            selectedDogs={wizard.selectedDogs}
            selectedDate={wizard.selectedDate!}
            slotAllocation={wizard.slotAllocation}
            onSelect={setSlotAllocation}
            onNext={() => goToStep(5)}
            onBack={() => goToStep(3)}
          />
        )}
        {wizard.step === 5 && (
          <BookingConfirmation
            selectedDogs={wizard.selectedDogs}
            services={wizard.services}
            selectedDate={wizard.selectedDate!}
            slotAllocation={wizard.slotAllocation!}
            onConfirm={handleSubmit}
            onBack={() => goToStep(4)}
            submitting={submitting}
            dogs={dogs}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create DogSelection.tsx**

```tsx
import { useState } from "react";
import { BRAND } from "../../../constants/index.js";
import { AddDogInline } from "./AddDogInline.js";
import type { WizardDog, DogSize } from "../../../types/index.js";

interface DogSelectionProps {
  dogs: any[];
  selectedDogs: WizardDog[];
  onSelect: (dogs: WizardDog[]) => void;
  onNext: () => void;
  onDogAdded: (dog: any) => void;
  humanId: string;
  loading: boolean;
}

export function DogSelection({ dogs, selectedDogs, onSelect, onNext, onDogAdded, humanId, loading }: DogSelectionProps) {
  const [showAddDog, setShowAddDog] = useState(false);

  const toggleDog = (dog: any) => {
    const isSelected = selectedDogs.some((d) => d.dogId === dog.id);
    if (isSelected) {
      onSelect(selectedDogs.filter((d) => d.dogId !== dog.id));
    } else if (selectedDogs.length < 4) {
      onSelect([...selectedDogs, { dogId: dog.id, name: dog.name, size: dog.size || "medium" }]);
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", color: BRAND.textLight, padding: 40 }}>Loading your dogs...</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 14, color: BRAND.textLight, marginBottom: 16 }}>
        Select which dogs you'd like to book in (up to 4). For 5 or more, please contact us directly.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {dogs.map((dog) => {
          const isSelected = selectedDogs.some((d) => d.dogId === dog.id);
          return (
            <button
              key={dog.id}
              onClick={() => toggleDog(dog)}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 16px", borderRadius: 12,
                border: `2px solid ${isSelected ? BRAND.teal : BRAND.greyLight}`,
                background: isSelected ? BRAND.tealLight : BRAND.white,
                cursor: selectedDogs.length >= 4 && !isSelected ? "not-allowed" : "pointer",
                opacity: selectedDogs.length >= 4 && !isSelected ? 0.5 : 1,
                fontFamily: "inherit", textAlign: "left", width: "100%",
                transition: "all 0.15s",
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text }}>{dog.name}</div>
                <div style={{ fontSize: 12, color: BRAND.textLight }}>
                  {dog.breed} · {dog.size || "Size not set"}
                </div>
              </div>
              <div style={{
                width: 24, height: 24, borderRadius: 12,
                border: `2px solid ${isSelected ? BRAND.teal : BRAND.greyLight}`,
                background: isSelected ? BRAND.teal : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {isSelected && <span style={{ color: BRAND.white, fontSize: 14, fontWeight: 700 }}>✓</span>}
              </div>
            </button>
          );
        })}
      </div>

      {!showAddDog ? (
        <button
          onClick={() => setShowAddDog(true)}
          style={{
            width: "100%", marginTop: 12, padding: "12px",
            borderRadius: 10, border: `1px dashed ${BRAND.greyLight}`,
            background: "transparent", color: BRAND.teal, fontSize: 13,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          + Add a new dog
        </button>
      ) : (
        <AddDogInline
          humanId={humanId}
          onDogAdded={(dog) => { onDogAdded(dog); setShowAddDog(false); }}
          onCancel={() => setShowAddDog(false)}
        />
      )}

      <button
        onClick={onNext}
        disabled={selectedDogs.length === 0}
        style={{
          width: "100%", marginTop: 20, padding: "14px",
          borderRadius: 12, border: "none",
          background: selectedDogs.length > 0 ? BRAND.teal : BRAND.greyLight,
          color: selectedDogs.length > 0 ? BRAND.white : BRAND.textLight,
          fontSize: 15, fontWeight: 700, cursor: selectedDogs.length > 0 ? "pointer" : "not-allowed",
          fontFamily: "inherit", transition: "all 0.15s",
        }}
      >
        Next — Choose Services
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/customer/booking/BookingWizard.tsx src/components/customer/booking/DogSelection.tsx
git commit -m "feat: create BookingWizard orchestrator and DogSelection step"
```

---

### Task 16: Create AddDogInline and ServiceSelection steps

**Files:**
- Create: `src/components/customer/booking/AddDogInline.tsx`
- Create: `src/components/customer/booking/ServiceSelection.tsx`

- [ ] **Step 1: Create AddDogInline.tsx**

```tsx
import { useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { BRAND } from "../../../constants/index.js";
import { BREED_SIZE_MAP } from "../../../constants/breeds.js";

interface AddDogInlineProps {
  humanId: string;
  onDogAdded: (dog: any) => void;
  onCancel: () => void;
}

export function AddDogInline({ humanId, onDogAdded, onCancel }: AddDogInlineProps) {
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [size, setSize] = useState<string>("medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBreedChange = (value: string) => {
    setBreed(value);
    const detectedSize = BREED_SIZE_MAP[value.toLowerCase()];
    if (detectedSize) setSize(detectedSize);
  };

  const handleSave = async () => {
    if (!name.trim() || !breed.trim() || !supabase) return;
    setSaving(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("dogs")
      .insert({ name: name.trim(), breed: breed.trim(), size, human_id: humanId })
      .select("*")
      .single();

    if (err) { setError(err.message); setSaving(false); return; }
    onDogAdded(data);
  };

  return (
    <div style={{
      marginTop: 12, padding: 16, borderRadius: 12,
      border: `1px solid ${BRAND.teal}`, background: BRAND.tealLight,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text, marginBottom: 12 }}>Add a new dog</div>

      <input placeholder="Dog's name" value={name} onChange={(e) => setName(e.target.value)}
        style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`, marginBottom: 8, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />

      <input placeholder="Breed" value={breed} onChange={(e) => handleBreedChange(e.target.value)}
        style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`, marginBottom: 8, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["small", "medium", "large"] as const).map((s) => (
          <button key={s} onClick={() => setSize(s)} style={{
            flex: 1, padding: "8px", borderRadius: 8,
            border: `1.5px solid ${size === s ? BRAND.teal : BRAND.greyLight}`,
            background: size === s ? BRAND.teal : BRAND.white,
            color: size === s ? BRAND.white : BRAND.text,
            fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {error && <div style={{ fontSize: 12, color: BRAND.coral, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`,
          background: BRAND.white, color: BRAND.text, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}>Cancel</button>
        <button onClick={handleSave} disabled={!name.trim() || !breed.trim() || saving} style={{
          flex: 1, padding: "10px", borderRadius: 8, border: "none",
          background: name.trim() && breed.trim() ? BRAND.teal : BRAND.greyLight,
          color: name.trim() && breed.trim() ? BRAND.white : BRAND.textLight,
          fontSize: 13, fontWeight: 700, cursor: name.trim() && breed.trim() ? "pointer" : "not-allowed",
          fontFamily: "inherit",
        }}>{saving ? "Saving..." : "Add Dog"}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ServiceSelection.tsx**

```tsx
import { BRAND } from "../../../constants/index.js";
import { getAllowedServicesForSize } from "../../../engine/bookingRules.js";
import { PRICING } from "../../../constants/index.js";
import type { WizardDog, ServiceId } from "../../../types/index.js";

interface ServiceSelectionProps {
  selectedDogs: WizardDog[];
  services: Record<string, ServiceId>;
  onSelect: (services: Record<string, ServiceId>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function ServiceSelection({ selectedDogs, services, onSelect, onNext, onBack }: ServiceSelectionProps) {
  const allSameSize = selectedDogs.every((d) => d.size === selectedDogs[0]?.size);

  const setServiceForDog = (dogId: string, serviceId: ServiceId) => {
    onSelect({ ...services, [dogId]: serviceId });
  };

  const setServiceForAll = (serviceId: ServiceId) => {
    const updated: Record<string, ServiceId> = {};
    for (const dog of selectedDogs) { updated[dog.dogId] = serviceId; }
    onSelect(updated);
  };

  const allSelected = selectedDogs.every((d) => services[d.dogId]);

  return (
    <div>
      {allSameSize && selectedDogs.length > 1 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.text, marginBottom: 8 }}>Same service for all?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {getAllowedServicesForSize(selectedDogs[0].size).map((svc) => (
              <button key={svc.id} onClick={() => setServiceForAll(svc.id as ServiceId)} style={{
                padding: "8px 14px", borderRadius: 8,
                border: `1.5px solid ${BRAND.greyLight}`, background: BRAND.white,
                color: BRAND.text, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}>
                {svc.icon} {svc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedDogs.map((dog) => {
        const allowedServices = getAllowedServicesForSize(dog.size);
        const selectedService = services[dog.dogId];

        return (
          <div key={dog.dogId} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text, marginBottom: 8 }}>
              {dog.name} <span style={{ fontWeight: 400, color: BRAND.textLight }}>({dog.size})</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {allowedServices.map((svc) => {
                const isSelected = selectedService === svc.id;
                const price = (PRICING as any)[svc.id]?.[dog.size] || "";
                return (
                  <button key={svc.id} onClick={() => setServiceForDog(dog.dogId, svc.id as ServiceId)} style={{
                    padding: "10px 14px", borderRadius: 10,
                    border: `2px solid ${isSelected ? BRAND.teal : BRAND.greyLight}`,
                    background: isSelected ? BRAND.tealLight : BRAND.white,
                    color: BRAND.text, fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}>
                    <div>{svc.icon} {svc.name}</div>
                    {price && <div style={{ fontSize: 11, color: BRAND.textLight, marginTop: 2 }}>{price}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button onClick={onBack} style={{
          flex: 1, padding: "14px", borderRadius: 12, border: `1px solid ${BRAND.greyLight}`,
          background: BRAND.white, color: BRAND.text, fontSize: 15, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}>Back</button>
        <button onClick={onNext} disabled={!allSelected} style={{
          flex: 2, padding: "14px", borderRadius: 12, border: "none",
          background: allSelected ? BRAND.teal : BRAND.greyLight,
          color: allSelected ? BRAND.white : BRAND.textLight,
          fontSize: 15, fontWeight: 700, cursor: allSelected ? "pointer" : "not-allowed",
          fontFamily: "inherit",
        }}>Next — Pick Date</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/customer/booking/AddDogInline.tsx src/components/customer/booking/ServiceSelection.tsx
git commit -m "feat: create AddDogInline and ServiceSelection wizard steps"
```

---

### Task 17: Create DateSelection and SlotSelection steps

**Files:**
- Create: `src/components/customer/booking/DateSelection.tsx`
- Create: `src/components/customer/booking/SlotSelection.tsx`

- [ ] **Step 1: Create DateSelection.tsx**

A 4-week calendar grid. Fetches day_settings to determine open/closed/full days.

```tsx
import { useState, useEffect, useMemo } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { BRAND } from "../../../constants/index.js";
import { getDefaultOpenForDate } from "../../../engine/utils.js";

interface DateSelectionProps {
  selectedDate: string | null;
  onSelect: (date: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function DateSelection({ selectedDate, onSelect, onNext, onBack }: DateSelectionProps) {
  const [daySettings, setDaySettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Generate next 28 days
  const dates = useMemo(() => {
    const result: Array<{ date: Date; dateStr: string }> = [];
    const today = new Date();
    // Start from tomorrow (can't book same day)
    for (let i = 1; i <= 28; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      result.push({ date: d, dateStr });
    }
    return result;
  }, []);

  // Fetch day_settings for the next 28 days
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    async function fetch() {
      const startStr = dates[0].dateStr;
      const endStr = dates[dates.length - 1].dateStr;

      const { data } = await supabase
        .from("day_settings")
        .select("*")
        .gte("setting_date", startStr)
        .lte("setting_date", endStr);

      const map: Record<string, any> = {};
      for (const row of data || []) { map[row.setting_date] = row; }
      setDaySettings(map);
      setLoading(false);
    }

    fetch();
  }, [dates]);

  const getDayState = (dateStr: string, date: Date): "open" | "closed" => {
    const settings = daySettings[dateStr];
    if (settings) return settings.is_open ? "open" : "closed";
    return getDefaultOpenForDate(date) ? "open" : "closed";
  };

  if (loading) {
    return <div style={{ textAlign: "center", color: BRAND.textLight, padding: 40 }}>Loading availability...</div>;
  }

  // Group by week
  const weeks: Array<Array<{ date: Date; dateStr: string }>> = [];
  for (let i = 0; i < dates.length; i += 7) {
    weeks.push(dates.slice(i, i + 7));
  }

  return (
    <div>
      <div style={{ fontSize: 14, color: BRAND.textLight, marginBottom: 16 }}>
        Pick a date for your appointment
      </div>

      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
          {wi === 0 && ["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: BRAND.textLight, paddingBottom: 4 }}>{d}</div>
          ))}
          {week.map(({ date, dateStr }) => {
            const state = getDayState(dateStr, date);
            const isSelected = selectedDate === dateStr;
            const isOpen = state === "open";

            return (
              <button
                key={dateStr}
                onClick={() => isOpen && onSelect(dateStr)}
                disabled={!isOpen}
                style={{
                  padding: "10px 0", borderRadius: 8, textAlign: "center",
                  border: isSelected ? `2px solid ${BRAND.teal}` : "1px solid transparent",
                  background: isSelected ? BRAND.tealLight : isOpen ? BRAND.white : "#F3F4F6",
                  color: isOpen ? BRAND.text : BRAND.textLight,
                  fontSize: 14, fontWeight: isSelected ? 700 : 500,
                  cursor: isOpen ? "pointer" : "not-allowed",
                  opacity: isOpen ? 1 : 0.5, fontFamily: "inherit",
                }}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button onClick={onBack} style={{
          flex: 1, padding: "14px", borderRadius: 12, border: `1px solid ${BRAND.greyLight}`,
          background: BRAND.white, color: BRAND.text, fontSize: 15, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}>Back</button>
        <button onClick={onNext} disabled={!selectedDate} style={{
          flex: 2, padding: "14px", borderRadius: 12, border: "none",
          background: selectedDate ? BRAND.teal : BRAND.greyLight,
          color: selectedDate ? BRAND.white : BRAND.textLight,
          fontSize: 15, fontWeight: 700, cursor: selectedDate ? "pointer" : "not-allowed",
          fontFamily: "inherit",
        }}>Next — Pick Time</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create SlotSelection.tsx**

```tsx
import { useState, useEffect, useMemo } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { BRAND, SALON_SLOTS } from "../../../constants/index.js";
import { findGroupedSlots } from "../../../engine/capacity.js";
import type { WizardDog, SlotAllocation, Booking } from "../../../types/index.js";

interface SlotSelectionProps {
  selectedDogs: WizardDog[];
  selectedDate: string;
  slotAllocation: SlotAllocation | null;
  onSelect: (allocation: SlotAllocation) => void;
  onNext: () => void;
  onBack: () => void;
}

export function SlotSelection({ selectedDogs, selectedDate, slotAllocation, onSelect, onNext, onBack }: SlotSelectionProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch existing bookings for selected date
  useEffect(() => {
    if (!supabase || !selectedDate) { setLoading(false); return; }

    async function fetch() {
      const { data } = await supabase
        .from("bookings")
        .select("*")
        .eq("booking_date", selectedDate);

      // Transform to Booking shape expected by capacity engine
      const transformed: Booking[] = (data || []).map((row: any) => ({
        id: row.id, slot: row.slot, size: row.size, dogName: "", breed: "",
        service: row.service, owner: "", status: row.status, addons: row.addons || [],
        pickupBy: "", payment: row.payment, confirmed: row.confirmed,
        _dogId: row.dog_id, _ownerId: null, _pickupById: null, _bookingDate: row.booking_date,
      }));

      setBookings(transformed);
      setLoading(false);
    }

    fetch();
  }, [selectedDate]);

  const availableSlots = useMemo(() => {
    if (loading) return [];
    const dogs = selectedDogs.map((d) => ({ id: d.dogId, size: d.size }));
    return findGroupedSlots(dogs, bookings, SALON_SLOTS);
  }, [selectedDogs, bookings, loading]);

  const formatTime = (slot: string) => {
    const [h, m] = slot.split(":").map(Number);
    const suffix = h >= 12 ? "pm" : "am";
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${m.toString().padStart(2, "0")}${suffix}`;
  };

  if (loading) {
    return <div style={{ textAlign: "center", color: BRAND.textLight, padding: 40 }}>Checking availability...</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 14, color: BRAND.textLight, marginBottom: 16 }}>
        Available drop-off times for {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      </div>

      {availableSlots.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 32, borderRadius: 12,
          background: BRAND.coralLight, color: BRAND.coral, fontSize: 14, fontWeight: 600,
        }}>
          No availability on this date. Please go back and pick another day.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {availableSlots.map((allocation) => {
            const isSelected = slotAllocation?.dropOffTime === allocation.dropOffTime;
            return (
              <button
                key={allocation.dropOffTime}
                onClick={() => onSelect(allocation)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 16px", borderRadius: 12,
                  border: `2px solid ${isSelected ? BRAND.teal : BRAND.greyLight}`,
                  background: isSelected ? BRAND.tealLight : BRAND.white,
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%",
                  transition: "all 0.15s",
                }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>
                    {formatTime(allocation.dropOffTime)}
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.textLight }}>
                    Drop off all dogs at this time
                  </div>
                </div>
                <div style={{
                  width: 24, height: 24, borderRadius: 12,
                  border: `2px solid ${isSelected ? BRAND.teal : BRAND.greyLight}`,
                  background: isSelected ? BRAND.teal : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isSelected && <span style={{ color: BRAND.white, fontSize: 14, fontWeight: 700 }}>✓</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button onClick={onBack} style={{
          flex: 1, padding: "14px", borderRadius: 12, border: `1px solid ${BRAND.greyLight}`,
          background: BRAND.white, color: BRAND.text, fontSize: 15, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}>Back</button>
        <button onClick={onNext} disabled={!slotAllocation} style={{
          flex: 2, padding: "14px", borderRadius: 12, border: "none",
          background: slotAllocation ? BRAND.teal : BRAND.greyLight,
          color: slotAllocation ? BRAND.white : BRAND.textLight,
          fontSize: 15, fontWeight: 700, cursor: slotAllocation ? "pointer" : "not-allowed",
          fontFamily: "inherit",
        }}>Next — Confirm</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/customer/booking/DateSelection.tsx src/components/customer/booking/SlotSelection.tsx
git commit -m "feat: create DateSelection and SlotSelection wizard steps"
```

---

### Task 18: Create BookingConfirmation step

**Files:**
- Create: `src/components/customer/booking/BookingConfirmation.tsx`

- [ ] **Step 1: Create BookingConfirmation.tsx**

```tsx
import { BRAND, SERVICES, PRICING } from "../../../constants/index.js";
import type { WizardDog, ServiceId, SlotAllocation } from "../../../types/index.js";

interface BookingConfirmationProps {
  selectedDogs: WizardDog[];
  services: Record<string, ServiceId>;
  selectedDate: string;
  slotAllocation: SlotAllocation;
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
  dogs: any[];
}

export function BookingConfirmation({
  selectedDogs, services, selectedDate, slotAllocation, onConfirm, onBack, submitting, dogs,
}: BookingConfirmationProps) {
  const formatTime = (slot: string) => {
    const [h, m] = slot.split(":").map(Number);
    const suffix = h >= 12 ? "pm" : "am";
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${m.toString().padStart(2, "0")}${suffix}`;
  };

  const dateFormatted = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div>
      <div style={{ fontSize: 14, color: BRAND.textLight, marginBottom: 16 }}>
        Please check everything looks right before confirming
      </div>

      <div style={{
        padding: 20, borderRadius: 14, border: `1px solid ${BRAND.greyLight}`,
        background: BRAND.white, marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.textLight, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
          Appointment Summary
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text, marginBottom: 4 }}>
          {dateFormatted}
        </div>
        <div style={{ fontSize: 14, color: BRAND.text, marginBottom: 16 }}>
          Drop off at {formatTime(slotAllocation.dropOffTime)}
        </div>

        {selectedDogs.map((dog) => {
          const serviceId = services[dog.dogId];
          const service = (SERVICES as any[]).find((s: any) => s.id === serviceId);
          const price = (PRICING as any)[serviceId]?.[dog.size] || "";

          return (
            <div key={dog.dogId} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0", borderTop: `1px solid ${BRAND.greyLight}`,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>{dog.name}</div>
                <div style={{ fontSize: 12, color: BRAND.textLight }}>
                  {service ? `${service.icon} ${service.name}` : serviceId} · {dog.size}
                </div>
              </div>
              {price && <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>{price}</div>}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onBack} disabled={submitting} style={{
          flex: 1, padding: "14px", borderRadius: 12, border: `1px solid ${BRAND.greyLight}`,
          background: BRAND.white, color: BRAND.text, fontSize: 15, fontWeight: 600,
          cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit",
          opacity: submitting ? 0.5 : 1,
        }}>Back</button>
        <button onClick={onConfirm} disabled={submitting} style={{
          flex: 2, padding: "14px", borderRadius: 12, border: "none",
          background: BRAND.teal, color: BRAND.white, fontSize: 15, fontWeight: 700,
          cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit",
        }}>
          {submitting ? "Booking..." : `Confirm Booking${selectedDogs.length > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/customer/booking/BookingConfirmation.tsx
git commit -m "feat: create BookingConfirmation wizard step"
```

---

### Task 19: Wire up BookingWizard route in CustomerApp

**Files:**
- Modify: `src/CustomerApp.jsx`
- Modify: `src/index.jsx`
- Modify: `src/components/customer/CustomerDashboard.jsx`

- [ ] **Step 1: Add routing to CustomerApp.jsx**

Import React Router's `Routes`, `Route`, and `useNavigate`. Change CustomerApp to use routes:

```jsx
import { Routes, Route, useNavigate } from "react-router-dom";
import { BookingWizard } from "./components/customer/booking/BookingWizard.js";

// After the auth/loading checks, replace the final return with:
return (
  <Routes>
    <Route path="book" element={
      <BookingWizard
        humanRecord={activeHuman}
        onComplete={() => navigate("/customer")}
        onCancel={() => navigate("/customer")}
      />
    } />
    <Route path="*" element={
      <CustomerDashboard humanRecord={activeHuman} onSignOut={handleSignOut} />
    } />
  </Routes>
);
```

Where `activeHuman` is the resolved human record (from auth or demo mode) and `handleSignOut` is the appropriate sign-out function.

- [ ] **Step 2: Add "Book Now" button to CustomerDashboard**

In `src/components/customer/CustomerDashboard.jsx`, add a prominent "Book a Groom" button. Import `useNavigate`:

```jsx
import { useNavigate } from "react-router-dom";

// Inside CustomerDashboard:
const navigate = useNavigate();

// Add after the header section:
<button
  onClick={() => navigate("/customer/book")}
  style={{
    width: "100%", padding: "16px", borderRadius: 12, border: "none",
    background: BRAND.teal, color: BRAND.white, fontSize: 16, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit", marginBottom: 20,
  }}
>
  Book a Groom
</button>
```

- [ ] **Step 3: Verify the complete booking flow**

Run: `npm run dev`

Open `/customer`. Log in (or use demo mode). Click "Book a Groom". Walk through all 5 steps:
1. Select 1 dog → Next
2. Choose a service → Next
3. Pick a date → Next
4. Pick a drop-off time → Next
5. Confirm → booking should be created

Check the staff dashboard — the new booking should appear via real-time sync.

- [ ] **Step 4: Commit**

```bash
git add src/CustomerApp.jsx src/components/customer/CustomerDashboard.jsx src/index.jsx
git commit -m "feat: wire up customer booking wizard route and Book Now button"
```

---

### Task 20: Multi-dog group cancellation

**Files:**
- Modify: `src/components/customer/CustomerDashboard.jsx`

- [ ] **Step 1: Update the cancel logic in CustomerDashboard**

Find the existing cancel booking handler. Update it to check for `group_id` on the booking. If `group_id` exists and there are other bookings with the same `group_id`:

```jsx
const handleCancel = async (booking) => {
  if (!supabase) return;

  // Check for group bookings
  if (booking.group_id) {
    const { data: groupBookings } = await supabase
      .from("bookings")
      .select("id")
      .eq("group_id", booking.group_id)
      .neq("id", booking.id);

    if (groupBookings && groupBookings.length > 0) {
      const cancelAll = window.confirm(
        `This booking is part of a group of ${groupBookings.length + 1} dogs. Cancel all bookings in this group, or just this one?\n\nOK = Cancel all\nCancel = Just this one`
      );

      if (cancelAll) {
        await supabase.from("bookings").delete().eq("group_id", booking.group_id);
        // Refresh bookings
        fetchBookings();
        return;
      }
    }
  }

  // Cancel just this one
  await supabase.from("bookings").delete().eq("id", booking.id);
  fetchBookings();
};
```

- [ ] **Step 2: Display group_id bookings together in the customer view**

Update the bookings display to show grouped bookings with a visual indicator (e.g. "Part of a group booking with Bella and Max").

- [ ] **Step 3: Verify and commit**

```bash
git add src/components/customer/CustomerDashboard.jsx
git commit -m "feat: add multi-dog group cancellation to customer portal"
```

---

## Workstream E: Notifications via Edge Functions (2.2)

### Task 21: Database migration — notification_log table

**Files:**
- Create: `supabase/migrations/008_notification_log.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 008_notification_log.sql
-- Notification tracking for booking confirmations, reminders, and cancellations

CREATE TABLE IF NOT EXISTS notification_log (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id    uuid REFERENCES bookings(id) ON DELETE SET NULL,
  group_id      uuid,
  human_id      uuid REFERENCES humans(id) ON DELETE SET NULL,
  channel       text NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email')),
  trigger_type  text NOT NULL CHECK (trigger_type IN ('confirmed', 'reminder', 'cancelled')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('sent', 'failed', 'pending')),
  error_message text,
  sent_at       timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_notification_log_booking ON notification_log(booking_id);
CREATE INDEX idx_notification_log_human ON notification_log(human_id);
CREATE INDEX idx_notification_log_status ON notification_log(status);

-- RLS: staff can read all logs
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select_notification_log"
  ON notification_log FOR SELECT
  TO authenticated
  USING (is_staff());

-- Edge Functions use the service_role key, so they bypass RLS for inserts.
```

- [ ] **Step 2: Apply migration**

Run via Supabase SQL Editor or `supabase db push`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/008_notification_log.sql
git commit -m "feat: add notification_log table for tracking sent notifications"
```

---

### Task 22: Create notify-booking-confirmed Edge Function

**Files:**
- Create: `supabase/functions/notify-booking-confirmed/index.ts`

- [ ] **Step 1: Create the Edge Function directory and file**

```bash
mkdir -p supabase/functions/notify-booking-confirmed
```

```typescript
// supabase/functions/notify-booking-confirmed/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_WA_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM")!;
const TWILIO_SMS_FROM = Deno.env.get("TWILIO_SMS_FROM")!;
const SENDGRID_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const SENDGRID_FROM = Deno.env.get("SENDGRID_FROM_EMAIL")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req) => {
  try {
    const payload = await req.json();
    const booking = payload.record;
    if (!booking || booking.status !== "Not Arrived") {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // If part of a group, wait briefly then check if we already sent for this group
    if (booking.group_id) {
      await new Promise((r) => setTimeout(r, 2000)); // Wait for other group inserts
      const { data: existing } = await supabase
        .from("notification_log")
        .select("id")
        .eq("group_id", booking.group_id)
        .eq("trigger_type", "confirmed")
        .limit(1);

      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ skipped: "group already notified" }), { status: 200 });
      }
    }

    // Look up dog → human
    const { data: dog } = await supabase.from("dogs").select("name, human_id").eq("id", booking.dog_id).single();
    if (!dog) throw new Error("Dog not found");

    const { data: human } = await supabase.from("humans").select("*").eq("id", dog.human_id).single();
    if (!human) throw new Error("Human not found");

    // Build dog names list for group bookings
    let dogNames = dog.name;
    if (booking.group_id) {
      const { data: groupBookings } = await supabase
        .from("bookings")
        .select("dog_id")
        .eq("group_id", booking.group_id);

      if (groupBookings && groupBookings.length > 1) {
        const dogIds = groupBookings.map((b: any) => b.dog_id);
        const { data: groupDogs } = await supabase.from("dogs").select("name").in("id", dogIds);
        if (groupDogs) dogNames = groupDogs.map((d: any) => d.name).join(" and ");
      }
    }

    // Format date
    const dateObj = new Date(booking.booking_date + "T00:00:00");
    const dateStr = dateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const [h, m] = booking.slot.split(":").map(Number);
    const timeStr = `${h > 12 ? h - 12 : h}:${m.toString().padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;

    const serviceName = booking.service.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

    const message = `Hey ${human.name}! 🐾\n\nGreat news — ${dogNames} ${groupBookings?.length > 1 ? "are" : "is"} all booked in for a ${serviceName} on ${dateStr} at ${timeStr}.\n\nWe can't wait to see ${dogNames.includes(" and ") ? "them" : human.name === dog.name ? "them" : dog.name}! If anything changes, you can manage your booking through your account.\n\nSee you soon! 💛\nSmarter Dog Grooming`;

    // Send via preferred channel
    let channel = "email";
    let sent = false;

    if (human.whatsapp && human.phone) {
      channel = "whatsapp";
      sent = await sendTwilio(`whatsapp:${human.phone}`, TWILIO_WA_FROM, message);
    }

    if (!sent && human.sms && human.phone) {
      channel = "sms";
      sent = await sendTwilio(human.phone, TWILIO_SMS_FROM, message);
    }

    if (!sent && human.email) {
      channel = "email";
      sent = await sendEmail(human.email, `Booking Confirmed — ${dogNames}`, message);
    }

    // Log
    await supabase.from("notification_log").insert({
      booking_id: booking.id,
      group_id: booking.group_id || null,
      human_id: human.id,
      channel,
      trigger_type: "confirmed",
      status: sent ? "sent" : "failed",
      error_message: sent ? null : "All channels failed",
      sent_at: sent ? new Date().toISOString() : null,
    });

    return new Response(JSON.stringify({ sent, channel }), { status: 200 });
  } catch (err: any) {
    console.error("notify-booking-confirmed error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

async function sendTwilio(to: string, from: string, body: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${TWILIO_SID}:${TWILIO_AUTH}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    return res.ok;
  } catch { return false; }
}

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SENDGRID_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: SENDGRID_FROM, name: "Smarter Dog Grooming" },
        subject,
        content: [{ type: "text/plain", value: text }],
      }),
    });
    return res.status >= 200 && res.status < 300;
  } catch { return false; }
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/notify-booking-confirmed/index.ts
git commit -m "feat: create notify-booking-confirmed Edge Function"
```

---

### Task 23: Create notify-booking-reminder and notify-booking-cancelled Edge Functions

**Files:**
- Create: `supabase/functions/notify-booking-reminder/index.ts`
- Create: `supabase/functions/notify-booking-cancelled/index.ts`

- [ ] **Step 1: Create notify-booking-reminder**

Follow the same pattern as Task 22. Key differences:
- Queries bookings where `booking_date = tomorrow` and `status = 'Not Arrived'`
- Groups by `group_id` to send one reminder per group
- Message: "Just a friendly reminder — {dogNames} {is/are} booked in for {service} tomorrow ({date}) at {time}. See you then! 🐾"
- Logs with `trigger_type: 'reminder'`

- [ ] **Step 2: Create notify-booking-cancelled**

Key differences:
- Triggered by webhook on bookings UPDATE (status change to cancelled/deleted)
- Checks `payload.old` vs `payload.new` to detect cancellation
- Two tones based on who cancelled (customer vs staff — check if the auth user has a staff profile)
- Customer tone: "We've cancelled your appointment for {dogName} on {date}. You can rebook anytime."
- Staff tone: "Unfortunately, we've had to make a change to your appointment for {dogName} on {date}. Please get in touch and we'll get you rebooked."
- Logs with `trigger_type: 'cancelled'`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/notify-booking-reminder/index.ts supabase/functions/notify-booking-cancelled/index.ts
git commit -m "feat: create reminder and cancellation notification Edge Functions"
```

---

### Task 24: Configure database webhooks and pg_cron

- [ ] **Step 1: Set up database webhook for booking confirmation**

In the Supabase dashboard, create a Database Webhook:
- Name: `on-booking-insert`
- Table: `bookings`
- Events: `INSERT`
- Target: Edge Function `notify-booking-confirmed`

- [ ] **Step 2: Set up database webhook for booking cancellation**

- Name: `on-booking-cancelled`
- Table: `bookings`
- Events: `DELETE`
- Target: Edge Function `notify-booking-cancelled`

- [ ] **Step 3: Set up pg_cron for daily reminders**

```sql
-- Run in Supabase SQL Editor
SELECT cron.schedule(
  'booking-reminders',
  '0 18 * * *',  -- 6pm daily
  $$
  SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/notify-booking-reminder',
    headers := '{"Authorization": "Bearer <SUPABASE_SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 4: Set Supabase secrets**

```bash
supabase secrets set TWILIO_ACCOUNT_SID=<value>
supabase secrets set TWILIO_AUTH_TOKEN=<value>
supabase secrets set TWILIO_WHATSAPP_FROM=whatsapp:+<number>
supabase secrets set TWILIO_SMS_FROM=+<number>
supabase secrets set SENDGRID_API_KEY=<value>
supabase secrets set SENDGRID_FROM_EMAIL=<value>
```

- [ ] **Step 5: Deploy Edge Functions**

```bash
supabase functions deploy notify-booking-confirmed
supabase functions deploy notify-booking-reminder
supabase functions deploy notify-booking-cancelled
```

- [ ] **Step 6: Test by creating a booking via the customer portal**

Create a test booking → verify notification arrives via configured channel. Check `notification_log` table for the log entry.

- [ ] **Step 7: Commit any configuration files**

```bash
git add -A
git commit -m "feat: configure webhooks and deploy notification Edge Functions"
```

---

## Final Verification

### Task 25: End-to-end smoke test

- [ ] **Step 1: Test complete customer booking flow**

1. Open `/customer`, log in
2. Click "Book a Groom"
3. Select 2 dogs → choose services → pick date → pick time → confirm
4. Verify: bookings created with `group_id`, notification sent, staff dashboard shows them in real-time

- [ ] **Step 2: Test pagination**

1. Ensure seed data has 60+ dogs
2. Open Dogs view — should show "Showing 50 of X"
3. Click "Load more" — should load next page
4. Type in search — should query server, results update after 300ms

- [ ] **Step 3: Test booking history**

1. Click on a dog with past bookings
2. DogCardModal should show "Grooming History" with last visit and frequency

- [ ] **Step 4: Test App.jsx is under target**

Run: `wc -l src/App.jsx`
Expected: under 250 lines

- [ ] **Step 5: Run capacity tests**

Run: `node src/engine/capacity.test.js`
Expected: all tests PASS including new grouping tests

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "feat: Phase 2 complete — customer booking, notifications, pagination, history, App.jsx decomposition"
```
