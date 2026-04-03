import { useState, useMemo, lazy, Suspense } from "react";
import { BRAND, SALON_SLOTS } from "../../constants/index.js";
import { computeSlotCapacities, canBookSlot, getSeatStatesForSlot } from "../../engine/capacity.js";
import { toDateStr } from "../../supabase/transforms.js";
import { getDefaultOpenForDate } from "../../engine/utils.js";
import { Legend } from "../ui/Legend.jsx";
import { IconTick, IconBlock } from "../icons/index.jsx";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { SlotRow } from "../booking/SlotRow.jsx";
import { DayHeader } from "./DayHeader.jsx";
import { CalendarDate } from "./CalendarDate.jsx";
import { ClosedDayView } from "./ClosedDayView.jsx";
import { WeekNav } from "./WeekNav.jsx";
import { DaySummary } from "./DaySummary.jsx";
import { AddBookingForm } from "../booking/AddBookingForm.jsx";
import { WaitlistPanel } from "../booking/WaitlistPanel.jsx";
const DatePickerModal = lazy(() =>
  import("../modals/DatePickerModal.jsx").then((module) => ({
    default: module.DatePickerModal,
  })),
);

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
  const [calendarMode, setCalendarMode] = useState("day"); // "day" | "week" | "month"

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

  // When clicking a date in month view, switch to day view for that date
  const handleMonthDateSelect = (date) => {
    handleDatePick(date);
    setCalendarMode("day");
  };

  // Day-by-day navigation for day view
  const goToPrevDay = () => {
    const prev = new Date(currentDateObj);
    prev.setDate(prev.getDate() - 1);
    handleDatePick(prev);
  };
  const goToNextDay = () => {
    const next = new Date(currentDateObj);
    next.setDate(next.getDate() + 1);
    handleDatePick(next);
  };

  // Arrow colours per view — matching size dot colours
  const ARROW_COLOURS = { day: "#F5C518", week: "#2D8B7A", month: "#E8567F" };

  // Compute open days for week overview mode
  const openDays = useMemo(() => {
    return dates
      .map((d, i) => ({
        ...d,
        index: i,
        isOpen: dayOpenState[d.dateStr] ?? getDefaultOpenForDate(d.dateObj),
        bookings: bookingsByDate[d.dateStr] || [],
      }))
      .filter(d => d.isOpen);
  }, [dates, dayOpenState, bookingsByDate]);

  return (
    <>
      {/* ── Week nav bar + legend info button ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <WeekNav
            selectedDay={selectedDay}
            onSelectDay={(i) => { setSelectedDay(i); if (calendarMode === "week") setCalendarMode("day"); }}
            bookingsByDate={bookingsByDate}
            dates={dates}
            dayOpenState={dayOpenState}
          />
        </div>
        <Legend />
      </div>

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

      {/* ── Day view (single day detail) ── */}
      {calendarMode === "day" && isOpen && (
        <>
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
              calendarMode={calendarMode}
              setCalendarMode={setCalendarMode}
              onPrev={goToPrevDay}
              onNext={goToNextDay}
              arrowColour={ARROW_COLOURS.day}
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
            <WaitlistPanel
              currentDateObj={currentDateObj}
              humans={humans}
              dogs={dogs}
            />
          </div>
        </>
      )}

      {calendarMode === "day" && !isOpen && (
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
            calendarMode={calendarMode}
            setCalendarMode={setCalendarMode}
            onPrev={goToPrevDay}
            onNext={goToNextDay}
            arrowColour={ARROW_COLOURS.day}
          />
          <ClosedDayView onOpen={toggleDayOpen} />
        </div>
      )}

      {/* ── Week overview (columns for all open days) ── */}
      {calendarMode === "week" && (
        <>
          {/* Calendar icons row — arrows at ends, icons + view buttons centred */}
          <div style={{
            display: "flex", alignItems: "center", marginBottom: 12,
            padding: "14px 16px",
            background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
            borderRadius: 14,
          }}>
            {/* Prev week arrow — far left */}
            <button onClick={goToPrevWeek} style={{
              width: 28, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
              background: BRAND.white, border: "none", borderRadius: 8, cursor: "pointer", flexShrink: 0,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}>
              <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={ARROW_COLOURS.week} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3l-5 5 5 5" />
              </svg>
            </button>

            {/* Centre group */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {openDays.map((day) => (
                <div key={day.dateStr} onClick={() => { setSelectedDay(day.index); setCalendarMode("day"); }} style={{ cursor: "pointer" }}>
                  <CalendarDate
                    dayName={day.dateObj.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()}
                    dayNum={day.dayNum}
                    monthShort={day.monthShort}
                    year={day.year}
                  />
                </div>
              ))}
              {openDays.length === 0 && (
                <div style={{ width: 134, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                  <svg width={134} height={62} viewBox="0 0 134 62">
                    <circle cx="67" cy="5" r="3" fill="rgba(255,255,255,0.7)" />
                    <line x1="67" y1="8" x2="47" y2="22" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
                    <line x1="67" y1="8" x2="87" y2="18" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
                    <g transform="rotate(-4, 67, 38)">
                      <rect x="3" y="18" width="128" height="36" rx="4" fill={BRAND.closedRed} />
                      <text x="67" y="42" textAnchor="middle" fill="white" fontSize="18" fontWeight="800" fontFamily="inherit" letterSpacing="2">CLOSED</text>
                    </g>
                  </svg>
                </div>
              )}

              {/* View buttons */}
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
            </div>

            {/* Next week arrow — far right */}
            <button onClick={goToNextWeek} style={{
              width: 28, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
              background: BRAND.white, border: "none", borderRadius: 8, cursor: "pointer", flexShrink: 0,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}>
              <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={ARROW_COLOURS.week} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3l5 5-5 5" />
              </svg>
            </button>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${openDays.length || 1}, 1fr)`,
            gap: 8,
          }}>
            {openDays.map((day) => {
              const dayBookingsForCol = day.bookings;
              const daySlots = [...SALON_SLOTS, ...(daySettings[day.dateStr]?.extraSlots || [])];
              const count = dayBookingsForCol.length;
              const dayCaps = computeSlotCapacities(dayBookingsForCol, daySlots);
              const dayOverridesForCol = daySettings[day.dateStr]?.overrides || {};

              return (
                <div key={day.dateStr} style={{
                  borderRadius: 12, overflow: "hidden",
                  border: `1px solid ${BRAND.greyLight}`,
                  boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
                  background: BRAND.white,
                }}>
                  {/* Column header */}
                  <div
                    onClick={() => { setSelectedDay(day.index); setCalendarMode("day"); }}
                    style={{
                      background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
                      padding: "10px 12px", cursor: "pointer",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: BRAND.white }}>{day.dateObj.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>
                        {day.dayNum} {day.monthShort}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 18, fontWeight: 800, color: BRAND.white,
                    }}>
                      {count}
                    </div>
                  </div>

                  {/* Slot list — two seats per time */}
                  <div style={{ padding: "4px 6px" }}>
                    {daySlots.map(slot => {
                      const overrides = dayOverridesForCol[slot] || {};
                      const seatStates = getSeatStatesForSlot(dayBookingsForCol, slot, daySlots, overrides);

                      const sizeColours = {
                        small: { bg: "#FEF3C7", text: "#92400E" },
                        medium: { bg: "#D6F5EE", text: "#065F46" },
                        large: { bg: "#FDE2E8", text: BRAND.coral },
                      };

                      return (
                        <div key={slot} style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "3px 0",
                          borderBottom: `1px solid ${BRAND.greyLight}`,
                        }}>
                          {/* Time label */}
                          <span style={{ fontSize: 10, fontWeight: 700, color: BRAND.textLight, width: 30, flexShrink: 0 }}>
                            {slot}
                          </span>
                          {/* Two seat boxes */}
                          <div style={{ flex: 1, display: "flex", gap: 3 }}>
                            {seatStates.map((seat, si) => {
                              if (seat.type === "booking") {
                                const b = seat.booking;
                                const sc = sizeColours[b.size] || { bg: BRAND.greyLight, text: BRAND.textLight };
                                return (
                                  <div key={si} style={{
                                    flex: 1, padding: "3px 5px", borderRadius: 5,
                                    background: sc.bg, fontSize: 10, fontWeight: 600, color: sc.text,
                                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                    minHeight: 22, display: "flex", alignItems: "center",
                                  }}>
                                    {b.dogName} <span style={{ fontWeight: 400, opacity: 0.75 }}>· {b.breed}</span>
                                  </div>
                                );
                              }
                              if (seat.type === "reserved") {
                                const b = seat.booking;
                                const sc = sizeColours[b?.size] || { bg: BRAND.greyLight, text: BRAND.textLight };
                                return (
                                  <div key={si} style={{
                                    flex: 1, padding: "3px 5px", borderRadius: 5,
                                    background: sc.bg, fontSize: 9, fontWeight: 600, color: sc.text,
                                    opacity: 0.5, minHeight: 22, display: "flex", alignItems: "center",
                                    fontStyle: "italic",
                                  }}>
                                    (large)
                                  </div>
                                );
                              }
                              if (seat.type === "blocked") {
                                return (
                                  <div key={si} style={{
                                    flex: 1, padding: "3px 5px", borderRadius: 5,
                                    background: "#FEF2F2", minHeight: 22,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}>
                                    <IconBlock size={12} />
                                  </div>
                                );
                              }
                              /* available */
                              return (
                                <div key={si} style={{
                                  flex: 1, padding: "3px 5px", borderRadius: 5,
                                  background: "#F0FAFF", minHeight: 22,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                  <IconTick size={12} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
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
