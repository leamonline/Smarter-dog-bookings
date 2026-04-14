import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { SALON_SLOTS } from "../../constants/index.js";
import { canBookSlot } from "../../engine/capacity.js";
import { toDateStr } from "../../supabase/transforms.js";
import { getDefaultOpenForDate } from "../../engine/utils.js";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { PullToRefresh } from "../shared/PullToRefresh.jsx";
import { ClosedDayView } from "./ClosedDayView.jsx";
import { AddBookingForm } from "../booking/AddBookingForm.jsx";
import { WaitlistPanel } from "../booking/WaitlistPanel.jsx";
import { CalendarTabs } from "./CalendarTabs.jsx";
import { DashboardHeader } from "./DashboardHeader.jsx";
import { SlotGrid } from "../booking/SlotGrid.jsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
const DatePickerModal = lazy(() =>
  import("../modals/DatePickerModal.jsx").then((module) => ({
    default: module.DatePickerModal,
  })),
);

/* ──────────────────────────────────────────────────────────
 * MonthGrid — shows a full calendar month with booking counts
 * ────────────────────────────────────────────────────────── */
function MonthGrid({ currentDateObj, bookingsByDate, dayOpenState, onSelectDate, onNavigateMonth, calendarMode, setCalendarMode }) {
  // Local view state — arrows change this without affecting day navigation
  const [viewYear, setViewYear] = useState(currentDateObj.getFullYear());
  const [viewMonth, setViewMonth] = useState(currentDateObj.getMonth());

  // Reset view when re-entering month mode or when currentDateObj changes externally
  useEffect(() => {
    setViewYear(currentDateObj.getFullYear());
    setViewMonth(currentDateObj.getMonth());
  }, [currentDateObj]);

  const { weeks, monthName, yearStr } = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const last = new Date(viewYear, viewMonth + 1, 0);
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1; // Mon=0
    const mName = first.toLocaleDateString("en-GB", { month: "long" });
    const yr = String(first.getFullYear());

    const rows = [];
    let week = new Array(startDay).fill(null);

    for (let d = 1; d <= last.getDate(); d++) {
      week.push(new Date(viewYear, viewMonth, d));
      if (week.length === 7) { rows.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      rows.push(week);
    }
    return { weeks: rows, monthName: mName, yearStr: yr };
  }, [viewYear, viewMonth]);

  const todayStr = toDateStr(new Date());

  const goMonth = (offset) => {
    const d = new Date(viewYear, viewMonth + offset, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  return (
    <div className="mb-4">
      {/* Month header — blue banner */}
      <div className="flex items-center mb-3 py-3.5 px-4 bg-gradient-to-br from-brand-blue to-brand-blue-dark rounded-xl">
        {/* Prev arrow */}
        <button onClick={() => goMonth(-1)} className="w-7 h-10 flex items-center justify-center bg-white border-none rounded-lg cursor-pointer shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="#E8567F" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3l-5 5 5 5" />
          </svg>
        </button>

        {/* Month & year */}
        <div className="flex-1 text-center">
          <div className="text-2xl md:text-[28px] font-black text-white leading-tight">
            {monthName} {yearStr}
          </div>
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
          let shadowCls = "shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
          let hoverCls = isOpen ? "hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)] hover:-translate-y-px" : "";

          if (!isOpen) {
            bgCls = "bg-slate-100";
            textCls = "text-slate-500";
            shadowCls = "";
            hoverCls = "";
          }
          if (isSelected) {
            bgCls = "bg-gradient-to-b from-brand-blue to-brand-blue-dark";
            textCls = "text-white";
            borderCls = "border border-brand-blue";
            shadowCls = "shadow-[0_2px_8px_rgba(14,165,233,0.2)]";
            hoverCls = "";
          }
          if (isToday && !isSelected) {
            borderCls = "border-2 border-brand-blue";
            shadowCls = "shadow-[0_2px_6px_rgba(14,165,233,0.12)]";
          }

          const fullLabel = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(date)}
              aria-label={`${fullLabel}${count > 0 ? `, ${count} booking${count === 1 ? "" : "s"}` : ""}${!isOpen ? ", closed" : ""}`}
              className={`py-2 px-1 rounded-[10px] ${borderCls} ${bgCls} ${shadowCls} ${hoverCls} cursor-pointer font-[inherit] transition-all flex flex-col items-center gap-0.5 min-h-[56px]`}
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
  bookingsLoading,
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
  // Human card
  onOpenHuman,
  // Pull-to-refresh
  onRefresh,
}) {
  const [calendarMode, setCalendarMode] = useState("day"); // "day" | "month"
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmRemoveSlot, setConfirmRemoveSlot] = useState(null);

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
        humans={humans}
        dogs={dogs}
        onOpenHuman={onOpenHuman}
      />

      {/* Day view */}
      {calendarMode === "day" && (
        <PullToRefresh onRefresh={onRefresh}>
          {/* Dashboard header with date + actions */}
          <DashboardHeader
            currentDateObj={currentDateObj}
            bookings={dayBookings}
            dogs={dogs}
            onNewBooking={() => setShowNewBooking({ dateStr: currentDateStr, slot: "" })}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          {isOpen ? (
            <>
              <SlotGrid
                bookings={dayBookings}
                loading={bookingsLoading && dayBookings.length === 0}
                activeSlots={activeSlots}
                onOpenNewBooking={(dateStr, slot) => setShowNewBooking({ dateStr, slot })}
                currentDateStr={currentDateStr}
                overrides={currentSettings.overrides || {}}
                onOverride={handleOverride}
                searchQuery={searchQuery}
              />
              {/* Add/Remove extra slot buttons */}
              <div className="p-[12px_16px] border-t border-slate-200 bg-white flex flex-col gap-2">
                {(currentSettings.extraSlots || []).length > 0 && (() => {
                  const lastSlot = currentSettings.extraSlots[currentSettings.extraSlots.length - 1];
                  const [h, m] = lastSlot.split(":");
                  const hour = parseInt(h, 10);
                  const suffix = hour < 12 ? "am" : "pm";
                  const display = `${hour > 12 ? hour - 12 : hour}:${m}${suffix}`;
                  return (
                    <button
                      onClick={() => setConfirmRemoveSlot(display)}
                      className="w-full py-2.5 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-slate-600 text-[13px] font-bold cursor-pointer font-[inherit] transition-all hover:border-brand-coral hover:text-brand-coral"
                    >
                      Remove {display} slot
                    </button>
                  );
                })()}
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
                onOpenHuman={onOpenHuman}
              />
            </>
          ) : (
            <ClosedDayView onOpen={toggleDayOpen} />
          )}
        </PullToRefresh>
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
      {confirmRemoveSlot && (
        <ConfirmDialog
          title={`Remove the ${confirmRemoveSlot} timeslot?`}
          message="This will remove the extra slot from today's schedule."
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => { handleRemoveSlot(); setConfirmRemoveSlot(null); }}
          onCancel={() => setConfirmRemoveSlot(null)}
        />
      )}
    </>
  );
}
