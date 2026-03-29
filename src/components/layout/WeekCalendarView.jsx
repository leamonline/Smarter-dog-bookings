import { useMemo, lazy, Suspense } from "react";
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
  // Week navigation
  selectedDay,
  setSelectedDay,
  dates,
  currentDateObj,
  currentDateStr,
  currentDayConfig,
  goToNextWeek,
  goToPrevWeek,
  // Data
  bookingsByDate,
  daySettings,
  dayOpenState,
  dogs,
  humans,
  // Current day settings (pre-computed in App.jsx)
  currentSettings,
  // Handlers
  handleAdd,
  handleRemove,
  handleOverride,
  handleAddSlot,
  handleRemoveSlot,
  toggleDayOpen,
  // Date picker
  showDatePicker,
  setShowDatePicker,
  handleDatePick,
  // Rebook
  rebookData,
  setRebookData,
  showRebookDatePicker,
  setShowRebookDatePicker,
  // New booking modal trigger
  setShowNewBooking,
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
              Pre-filled from previous appointment. Choose a date and slot, then
              confirm.
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
                gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
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
                        rebookData.slot === slot ? BRAND.blue : BRAND.white,
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
                No bookable slots are available for this dog on the selected
                date.
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
                const saved = await handleAdd(booking, rebookData.dateStr);
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
                  dayOpenState[newDateStr] ?? getDefaultOpenForDate(newDate),
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
  );
}
