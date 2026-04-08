import { useState, useMemo, lazy, Suspense } from "react";
import { SALON_SLOTS } from "../../constants/index.js";
import { canBookSlot } from "../../engine/capacity.js";
import { toDateStr } from "../../supabase/transforms.js";
import { getDefaultOpenForDate } from "../../engine/utils.js";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { ClosedDayView } from "./ClosedDayView.jsx";
import { AddBookingForm } from "../booking/AddBookingForm.jsx";
import { WaitlistPanel } from "../booking/WaitlistPanel.jsx";
import { CalendarTabs } from "./CalendarTabs.jsx";
import { DashboardHeader } from "./DashboardHeader.jsx";
import { SlotGrid } from "../booking/SlotGrid.jsx";
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

  const { weeks, monthName, yearStr } = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1; // Mon=0
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
    return { weeks: rows, monthName: mName, yearStr: yr };
  }, [year, month]);

  const todayStr = toDateStr(new Date());

  const goMonth = (offset) => {
    const d = new Date(year, month + offset, 1);
    (onNavigateMonth || onSelectDate)(d);
  };

  return (
    <div className="mb-4">
      {/* Month header — blue banner */}
      <div className="flex items-center mb-3 py-3.5 px-4 bg-gradient-to-br from-brand-blue to-brand-blue-dark rounded-[14px]">
        {/* Prev arrow */}
        <button onClick={() => goMonth(-1)} className="w-7 h-10 flex items-center justify-center bg-white border-none rounded-lg cursor-pointer shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="#E8567F" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3l-5 5 5 5" />
          </svg>
        </button>

        {/* Centre group */}
        <div className="flex-1 flex items-center justify-center gap-3">
          {/* Month & year box */}
          <div className="bg-white rounded-[10px] py-2 px-12 flex flex-col items-center justify-center min-h-[58px] min-w-[200px]">
            <div className="text-[26px] font-extrabold text-slate-800 leading-none">{monthName}</div>
            <div className="text-sm font-bold text-slate-500 mt-0.5">{yearStr}</div>
          </div>

          {/* View buttons */}
          {setCalendarMode && (
            <div className="flex flex-col gap-[3px]">
              {[{ mode: "day", label: "Day View", colour: "text-amber-500" }, { mode: "month", label: "Month View", colour: "text-brand-coral" }].map(v => {
                const active = calendarMode === v.mode;
                return (
                  <button
                    key={v.mode}
                    onClick={() => setCalendarMode(v.mode)}
                    className={`py-1 px-2 rounded-md border-none text-[10px] font-bold cursor-pointer font-[inherit] transition-all whitespace-nowrap ${
                      active ? `bg-white ${v.colour}` : "bg-white/15 text-white/85"
                    }`}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Next arrow */}
        <button onClick={() => goMonth(1)} className="w-7 h-10 flex items-center justify-center bg-white border-none rounded-lg cursor-pointer shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="#E8567F" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} className="text-center text-[11px] font-bold text-slate-500 uppercase py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />;

          const dateStr = toDateStr(date);
          const isOpen = dayOpenState[dateStr] ?? getDefaultOpenForDate(date);
          const count = (bookingsByDate[dateStr] || []).length;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === toDateStr(currentDateObj);

          let bgCls = "bg-white";
          let borderCls = "border border-slate-200";
          let textCls = "text-slate-800";

          if (!isOpen) {
            bgCls = "bg-slate-100";
            textCls = "text-slate-500";
          }
          if (isSelected) {
            bgCls = "bg-brand-blue";
            textCls = "text-white";
            borderCls = "border border-brand-blue";
          }
          if (isToday && !isSelected) {
            borderCls = "border-2 border-brand-blue";
          }

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(date)}
              className={`py-2 px-1 rounded-[10px] ${borderCls} ${bgCls} cursor-pointer font-[inherit] transition-all flex flex-col items-center gap-0.5 min-h-[56px]`}
            >
              <span className={`text-sm font-bold ${textCls}`}>{date.getDate()}</span>
              {isOpen ? (
                <span className={`text-[11px] font-extrabold ${
                  isSelected ? "text-white/85" : count > 0 ? "text-brand-blue" : "text-slate-500"
                }`}>
                  {count > 0 ? count : "\u2014"}
                </span>
              ) : (
                <span className={`text-[10px] font-semibold ${isSelected ? "text-white/70" : "text-brand-red"}`}>
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
      {/* Calendar tabs */}
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

      {/* Day view */}
      {calendarMode === "day" && (
        <>
          {/* Dashboard header with date + actions */}
          <DashboardHeader
            currentDateObj={currentDateObj}
            bookings={dayBookings}
            onNewBooking={() => setShowNewBooking({ dateStr: currentDateStr, slot: "" })}
          />

          {isOpen ? (
            <>
              <SlotGrid
                bookings={dayBookings}
                activeSlots={activeSlots}
                onOpenNewBooking={(dateStr, slot) => setShowNewBooking({ dateStr, slot })}
                currentDateStr={currentDateStr}
                overrides={currentSettings.overrides || {}}
                onOverride={handleOverride}
              />
              {/* Add/Remove extra slot buttons */}
              <div className="p-[12px_16px] border-t border-slate-200 bg-white flex flex-col gap-2">
                {(currentSettings.extraSlots || []).length > 0 && (
                  <button
                    onClick={handleRemoveSlot}
                    className="w-full py-2.5 rounded-[10px] border-none bg-brand-blue text-white text-[13px] font-bold cursor-pointer font-[inherit] transition-all hover:bg-brand-blue-dark"
                  >
                    Remove added timeslot
                  </button>
                )}
                <button
                  onClick={handleAddSlot}
                  className="w-full py-2.5 rounded-[10px] border-none bg-brand-coral text-white text-[13px] font-bold cursor-pointer font-[inherit] transition-all hover:bg-[#D9466F]"
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

      {/* Month view */}
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

      {/* Date picker modal */}
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

      {/* Rebook modal */}
      {rebookData && (
        <div
          onClick={() => {
            setRebookData(null);
            setShowRebookDatePicker(false);
          }}
          className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-[420px] py-5 px-6 shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
          >
            <div className="text-base font-extrabold text-slate-800 mb-1">
              Rebook {rebookData.dogName}
            </div>
            <div className="text-[13px] text-slate-500 mb-3">
              Pre-filled from previous appointment. Choose a date and slot, then confirm.
            </div>

            <button
              type="button"
              onClick={() => setShowRebookDatePicker(true)}
              className="w-full mb-2.5 py-2.5 px-3 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-slate-800 text-[13px] font-semibold cursor-pointer font-[inherit] flex justify-between items-center"
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
              <div className="mb-2.5 py-2.5 px-3 rounded-lg bg-brand-coral-light text-brand-coral text-xs font-bold">
                This day is currently closed. Choose another date.
              </div>
            )}

            <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5 mb-3">
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

                const isActive = rebookData.slot === slot;

                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={!allowed}
                    onClick={() =>
                      setRebookData((prev) => ({ ...prev, slot }))
                    }
                    className={`py-2 rounded-lg border-[1.5px] text-[13px] font-semibold font-[inherit] transition-all ${
                      isActive
                        ? "border-brand-blue bg-brand-blue text-white"
                        : "border-slate-200 bg-white"
                    } ${
                      allowed
                        ? "cursor-pointer opacity-100"
                        : "cursor-not-allowed opacity-50"
                    } ${
                      !isActive && allowed ? "text-slate-800" : ""
                    } ${
                      !isActive && !allowed ? "text-slate-500" : ""
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>

            {rebookAvailableSlots.length === 0 && (
              <div className="mb-3 text-xs text-brand-coral font-bold">
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

      {/* Rebook date picker */}
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
