import { useState, useMemo, lazy, Suspense } from "react";
import { BRAND, SALON_SLOTS } from "../../constants/index.js";
import { canBookSlot } from "../../engine/capacity.js";
import { toDateStr } from "../../supabase/transforms.js";
import { getDefaultOpenForDate } from "../../engine/utils.js";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { ClosedDayView } from "./ClosedDayView.jsx";
import { AddBookingForm } from "../booking/AddBookingForm.jsx";
import { WaitlistPanel } from "../booking/WaitlistPanel.jsx";
import { CalendarTabs } from "./CalendarTabs.jsx";
import { ShopSign } from "./ShopSign.jsx";
import { SlotGrid } from "../booking/SlotGrid.jsx";
import FloatingActions from "./FloatingActions.jsx";
const DatePickerModal = lazy(() =>
  import("../modals/DatePickerModal.jsx").then((module) => ({
    default: module.DatePickerModal,
  })),
);

// Arrow colours per view — used by MonthGrid navigation arrows
const ARROW_COLOURS = { day: "#F5C518", week: "#2D8B7A", month: "#E8567F" };

/* ──────────────────────────────────────────────────────────
 * MonthGrid — shows a full calendar month with booking counts
 * ────────────────────────────────────────────────────────── */
function MonthGrid({ currentDateObj, bookingsByDate, dayOpenState, onSelectDate, onNavigateMonth, calendarMode, setCalendarMode }) {
  const year = currentDateObj.getFullYear();
  const month = currentDateObj.getMonth();

  const { weeks, monthLabel, monthName, yearStr } = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1; // Mon=0
    const label = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const mName = first.toLocaleDateString("en-GB", { month: "long" });
    const yr = String(first.getFullYear());

    const rows = [];
    let week = new Array(startDay).fill(null);

    for (let d = 1; d <= last.getDate(); d++) {
      week.push(new Date(year, month, d));
      if (week.length === 7) { rows.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      rows.push(week);
    }
    return { weeks: rows, monthLabel: label, monthName: mName, yearStr: yr };
  }, [year, month]);

  const todayStr = toDateStr(new Date());

  const goMonth = (offset) => {
    const d = new Date(year, month + offset, 1);
    (onNavigateMonth || onSelectDate)(d);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Month header — blue banner matching day/week view */}
      <div style={{
        display: "flex", alignItems: "center",
        marginBottom: 12, padding: "14px 16px",
        background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
        borderRadius: 14,
      }}>
        {/* Prev arrow — far left */}
        <button onClick={() => goMonth(-1)} style={{
          width: 28, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
          background: BRAND.white, border: "none", borderRadius: 8, cursor: "pointer", flexShrink: 0,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}>
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={ARROW_COLOURS.month} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3l-5 5 5 5" />
          </svg>
        </button>

        {/* Centre group: month box + view buttons */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          {/* Month & year in a wider white box */}
          <div style={{
            background: BRAND.white, borderRadius: 10, padding: "8px 48px",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: 58, minWidth: 200,
          }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: BRAND.text, lineHeight: 1.1 }}>{monthName}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.textLight, marginTop: 2 }}>{yearStr}</div>
          </div>

          {/* View buttons — stacked, right of month box */}
          {setCalendarMode && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {[{ mode: "day", label: "Day View", colour: "#F5C518" }, { mode: "week", label: "Week View", colour: "#2D8B7A" }, { mode: "month", label: "Month View", colour: "#E8567F" }].map(v => {
                const active = calendarMode === v.mode;
                return (
                  <button key={v.mode} onClick={() => setCalendarMode(v.mode)} style={{
                    padding: "4px 8px", borderRadius: 6, border: "none",
                    background: active ? BRAND.white : "rgba(255,255,255,0.15)",
                    color: active ? v.colour : "rgba(255,255,255,0.85)",
                    fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    transition: "all 0.15s", whiteSpace: "nowrap",
                  }}>{v.label}</button>
                );
              })}
            </div>
          )}
        </div>

        {/* Next arrow — far right */}
        <button onClick={() => goMonth(1)} style={{
          width: 28, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
          background: BRAND.white, border: "none", borderRadius: 8, cursor: "pointer", flexShrink: 0,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}>
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={ARROW_COLOURS.month} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} style={{
            textAlign: "center", fontSize: 11, fontWeight: 700,
            color: BRAND.textLight, textTransform: "uppercase", padding: "4px 0",
          }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {weeks.flat().map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />;

          const dateStr = toDateStr(date);
          const isOpen = dayOpenState[dateStr] ?? getDefaultOpenForDate(date);
          const count = (bookingsByDate[dateStr] || []).length;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === toDateStr(currentDateObj);

          let bg = BRAND.white;
          let border = `1px solid ${BRAND.greyLight}`;
          let textColour = BRAND.text;

          if (!isOpen) {
            bg = "#F3F4F6";
            textColour = BRAND.textLight;
          }
          if (isSelected) {
            bg = BRAND.blue;
            textColour = BRAND.white;
            border = `1px solid ${BRAND.blue}`;
          }
          if (isToday && !isSelected) {
            border = `2px solid ${BRAND.blue}`;
          }

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(date)}
              style={{
                padding: "8px 4px", borderRadius: 10, border, background: bg,
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                minHeight: 56,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: textColour }}>{date.getDate()}</span>
              {isOpen ? (
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: isSelected ? "rgba(255,255,255,0.85)" : count > 0 ? BRAND.blue : BRAND.textLight,
                }}>
                  {count > 0 ? count : "—"}
                </span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 600, color: isSelected ? "rgba(255,255,255,0.7)" : BRAND.closedRed }}>
                  Closed
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  const [calendarMode, setCalendarMode] = useState("day"); // "day" | "month"

  const isOpen = currentSettings.isOpen;
  const dayBookings = bookingsByDate[currentDateStr] || [];

  const activeSlots = useMemo(() => {
    return [...SALON_SLOTS, ...(currentSettings.extraSlots || [])];
  }, [currentSettings.extraSlots]);

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

  // When clicking a date in month view, switch to day view for that date
  const handleMonthDateSelect = (date) => {
    handleDatePick(date);
    setCalendarMode("day");
  };

  return (
    <>
      {/* ── Calendar tabs — replaces WeekNav ── */}
      <CalendarTabs
        dates={dates}
        selectedDay={selectedDay}
        onSelectDay={(i) => { setSelectedDay(i); if (calendarMode !== "day") setCalendarMode("day"); }}
        bookingsByDate={bookingsByDate}
        dayOpenState={dayOpenState}
        currentDateObj={currentDateObj}
        calendarMode={calendarMode}
        onSelectMonth={() => setCalendarMode("month")}
      />

      {/* ── Day view ── */}
      {calendarMode === "day" && (
        <>
          {/* Slim header bar with ShopSign */}
          <div style={{
            background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
            borderRadius: 0,
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 56,
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Paw watermark */}
            <div style={{
              position: "absolute", right: 40, top: -14,
              fontSize: 100, opacity: 0.04,
              transform: "rotate(-15deg)", pointerEvents: "none",
            }}>🐾</div>
            <ShopSign isOpen={isOpen} />
          </div>

          {isOpen ? (
            <>
              <SlotGrid
                bookings={dayBookings}
                activeSlots={activeSlots}
                onOpenNewBooking={(dateStr, slot) => setShowNewBooking({ dateStr, slot })}
                currentDateStr={currentDateStr}
              />
              {/* Add/Remove extra slot buttons */}
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
              <WaitlistPanel
                currentDateObj={currentDateObj}
                humans={humans}
                dogs={dogs}
              />
            </>
          ) : (
            <ClosedDayView onOpen={toggleDayOpen} />
          )}
        </>
      )}

      {/* ── Month view ── */}
      {calendarMode === "month" && (
        <MonthGrid
          currentDateObj={currentDateObj}
          bookingsByDate={bookingsByDate}
          dayOpenState={dayOpenState}
          onSelectDate={handleMonthDateSelect}
          onNavigateMonth={handleDatePick}
          calendarMode={calendarMode}
          setCalendarMode={setCalendarMode}
        />
      )}

      {/* ── Floating actions ── */}
      <FloatingActions
        bookings={dayBookings}
        onNewBooking={() => setShowNewBooking({ dateStr: currentDateStr, slot: "" })}
      />

      {/* ── Date picker modal ── */}
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

      {/* ── Rebook modal ── */}
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

      {/* ── Rebook date picker ── */}
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
