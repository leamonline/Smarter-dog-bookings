import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { SALON_SLOTS } from "../../constants/index.ts";
import { canBookSlot } from "../../engine/capacity.js";
import { toDateStr } from "../../supabase/transforms.js";
import { getDefaultOpenForDate } from "../../engine/utils.ts";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { PullToRefresh } from "../shared/PullToRefresh.jsx";
import { AddBookingForm } from "../booking/AddBookingForm.jsx";
import { CalendarTabs } from "./CalendarTabs.jsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { useTodos } from "../../supabase/hooks/useTodos.js";
import { useWaitlist } from "../../supabase/hooks/useWaitlist.js";
import { useWhatsAppUnread } from "../../supabase/hooks/useWhatsAppUnread.js";
import { FloatingDecor } from "../decor/index.jsx";

import { DashboardShell } from "../dashboard/DashboardShell.jsx";
import { LeftSidebar } from "../dashboard/LeftSidebar.jsx";
import { BookingMainPanel } from "../dashboard/BookingMainPanel.jsx";
import { RightWorkflowSidebar } from "../dashboard/RightWorkflowSidebar.jsx";
import { DaySettingsDrawer } from "../dashboard/DaySettingsDrawer.jsx";
import { OverviewDrawer } from "../dashboard/OverviewDrawer.jsx";
import { UtilityTabs } from "../dashboard/UtilityTabs.jsx";
import { parseBookingHintsFromMessage } from "../../utils/parseBookingHintsFromMessage.js";

const DatePickerModal = lazy(() =>
  import("../modals/DatePickerModal.jsx").then((module) => ({
    default: module.DatePickerModal,
  })),
);
const WaitlistModal = lazy(() =>
  import("../modals/WaitlistModal.jsx").then((module) => ({
    default: module.WaitlistModal,
  })),
);
const TodoModal = lazy(() =>
  import("../modals/TodoModal.jsx").then((module) => ({
    default: module.TodoModal,
  })),
);

export function WeekCalendarView({
  selectedDay,
  setSelectedDay,
  dates,
  currentDateObj,
  currentDateStr,
  bookingsByDate,
  bookingsLoading,
  daySettings,
  dayOpenState,
  dogs,
  dogsByHumanId,
  ensureDogsForHumans,
  humans,
  currentSettings,
  handleAdd,
  handleUpdate,
  handleOverride,
  handleAddSlot,
  handleRemoveSlot,
  toggleDayOpen,
  showDatePicker,
  setShowDatePicker,
  handleDatePick,
  rebookData,
  setRebookData,
  showRebookDatePicker,
  setShowRebookDatePicker,
  setShowNewBooking,
  onOpenHuman,
  onRefresh,
}) {
  const [viewMode, setViewMode] = useState("grid");
  const [searchQuery] = useState("");
  const [confirmRemoveSlot, setConfirmRemoveSlot] = useState(null);
  const [confirmDayToggle, setConfirmDayToggle] = useState(null);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [showTodos, setShowTodos] = useState(false);
  const [showDaySettings, setShowDaySettings] = useState(false);
  const [showOverview, setShowOverview] = useState(false);

  // Listen for the AppToolbar's "Overview" trigger — keeps the
  // toolbar decoupled from dashboard state.
  useEffect(() => {
    const handler = () => setShowOverview(true);
    window.addEventListener("smarterdog:open-overview", handler);
    return () => window.removeEventListener("smarterdog:open-overview", handler);
  }, []);

  const { todos, addTodos } = useTodos();
  const openTodoCount = todos.filter((t) => !t.done).length;
  const { waitlist, error: waitlistError, joinWaitlist, leaveWaitlist } =
    useWaitlist(currentDateObj);
  const { unread: waUnread } = useWhatsAppUnread();

  const isOpen = currentSettings.isOpen;
  const dayBookings = bookingsByDate[currentDateStr] || [];

  const activeSlots = useMemo(() => {
    return [...SALON_SLOTS, ...(currentSettings.extraSlots || [])];
  }, [currentSettings.extraSlots]);

  const openNewBooking = (dateStr, slot) =>
    setShowNewBooking({ dateStr: dateStr || currentDateStr, slot: slot || "" });

  const handleCreateBookingFromWhatsApp = (conversation) => {
    if (!conversation) {
      openNewBooking(currentDateStr, "");
      return;
    }
    const text = conversation.lastText || conversation.last_customer_text || "";
    const hints = parseBookingHintsFromMessage(text, { referenceDate: new Date() });
    setShowNewBooking({
      dateStr: hints.dateStr || currentDateStr,
      slot: hints.slot || "",
      initialHumanId: conversation.humanId || conversation.human_id || null,
      sourceConversationId: conversation.conversationId || conversation.id || null,
      sourceMessageText: text,
      ownerName: conversation.displayName || null,
    });
  };

  const handlePrintDaySheet = () => {
    if (typeof window !== "undefined") window.print();
  };

  const handleConfirmDayToggle = (mode) => {
    if (mode === "close" && dayBookings.length > 0) {
      const dateLabel = currentDateObj.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      const items = dayBookings.map((b) => {
        const dogName = b.dogName || "Unknown";
        const owner = b.ownerName || b.owner || "";
        return `Rearrange: ${dogName}${owner ? ` (${owner})` : ""} — was ${dateLabel} ${b.slot}`;
      });
      addTodos(items);
    }
    toggleDayOpen();
    setConfirmDayToggle(null);
  };

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
          dogId: rebookData._dogId,
        }).allowed,
    );
  }, [rebookData, rebookSlots, rebookBookings, rebookSettings]);

  return (
    <div className="relative">
      <FloatingDecor />

      {/* Compact week pills on tablet/mobile — desktop uses the
          left-sidebar WeekOverviewCard. */}
      <div className="xl:hidden mb-3">
        <CalendarTabs
          dates={dates}
          selectedDay={selectedDay}
          onSelectDay={(i) => setSelectedDay(i)}
          bookingsByDate={bookingsByDate}
          dayOpenState={dayOpenState}
          calendarMode="day"
        />
      </div>

      <PullToRefresh onRefresh={onRefresh}>
        <DashboardShell
          left={
            <LeftSidebar
              dates={dates}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              currentDateObj={currentDateObj}
              bookingsByDate={bookingsByDate}
              dayOpenState={dayOpenState}
              daySettings={daySettings}
              dogs={dogs}
              onSelectDate={handleDatePick}
            />
          }
          main={
            <BookingMainPanel
              currentDateObj={currentDateObj}
              currentDateStr={currentDateStr}
              bookings={dayBookings}
              bookingsLoading={bookingsLoading}
              dogs={dogs}
              isOpen={isOpen}
              activeSlots={activeSlots}
              overrides={currentSettings.overrides || {}}
              viewMode={viewMode}
              setViewMode={setViewMode}
              onNavigateDay={(delta) => {
                const target = new Date(currentDateObj);
                target.setDate(target.getDate() + delta);
                handleDatePick(target);
              }}
              onOpenCalendar={() => setShowDatePicker(true)}
              onOpenNewBooking={openNewBooking}
              onMoveBooking={
                handleUpdate
                  ? (booking, targetSlot) =>
                      handleUpdate(
                        { ...booking, slot: targetSlot },
                        currentDateStr,
                        currentDateStr,
                      )
                  : undefined
              }
              onOverride={handleOverride}
              onOpenWaitlist={() => setShowWaitlist(true)}
              onCloseDay={() => setConfirmDayToggle("close")}
              onOpenDay={() => setConfirmDayToggle("open")}
              onOpenDaySettings={() => setShowDaySettings(true)}
              onOpenOverview={() => setShowOverview(true)}
              searchQuery={searchQuery}
            />
          }
          right={
            <>
              {/* Tablet (md-xl): compact tabbed utility panel.
                  Desktop (xl+): full stacked workflow sidebar. */}
              <div className="xl:hidden">
                <UtilityTabs
                  waitlistCount={waitlist.length}
                  todoCount={openTodoCount}
                  messageCount={waUnread}
                  onOpenWaitlist={() => setShowWaitlist(true)}
                  onOpenTodos={() => setShowTodos(true)}
                  onCreateBookingFromWhatsApp={handleCreateBookingFromWhatsApp}
                />
              </div>
              <div className="hidden xl:block">
                <RightWorkflowSidebar
                  waitlistCount={waitlist.length}
                  todoCount={openTodoCount}
                  onOpenWaitlist={() => setShowWaitlist(true)}
                  onOpenTodos={() => setShowTodos(true)}
                  onCreateBookingFromWhatsApp={handleCreateBookingFromWhatsApp}
                />
              </div>
            </>
          }
        />
      </PullToRefresh>

      <OverviewDrawer
        open={showOverview}
        onClose={() => setShowOverview(false)}
        dates={dates}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        currentDateObj={currentDateObj}
        bookingsByDate={bookingsByDate}
        dayOpenState={dayOpenState}
        daySettings={daySettings}
        onSelectDate={handleDatePick}
        onOpenDaySettings={() => setShowDaySettings(true)}
      />

      {/* Day settings drawer */}
      <DaySettingsDrawer
        open={showDaySettings}
        onClose={() => setShowDaySettings(false)}
        currentDateObj={currentDateObj}
        isOpen={isOpen}
        extraSlots={currentSettings.extraSlots || []}
        bookingCount={dayBookings.length}
        onAddSlot={() => {
          handleAddSlot();
        }}
        onRemoveSlot={() => {
          const lastSlot =
            (currentSettings.extraSlots || [])[(currentSettings.extraSlots || []).length - 1];
          if (!lastSlot) return;
          const [h, m] = lastSlot.split(":");
          const hour = parseInt(h, 10);
          const display = `${hour}:${m}`;
          setConfirmRemoveSlot(display);
        }}
        onToggleDayOpen={() => setConfirmDayToggle(isOpen ? "close" : "open")}
        onPrintDaySheet={handlePrintDaySheet}
      />

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

      {showWaitlist && (
        <Suspense fallback={<LoadingSpinner />}>
          <WaitlistModal
            currentDateObj={currentDateObj}
            humans={humans}
            dogs={dogs}
            dogsByHumanId={dogsByHumanId}
            ensureDogsForHumans={ensureDogsForHumans}
            onOpenHuman={onOpenHuman}
            waitlist={waitlist}
            error={waitlistError}
            joinWaitlist={joinWaitlist}
            leaveWaitlist={leaveWaitlist}
            onClose={() => setShowWaitlist(false)}
          />
        </Suspense>
      )}

      {showTodos && (
        <Suspense fallback={<LoadingSpinner />}>
          <TodoModal onClose={() => setShowTodos(false)} />
        </Suspense>
      )}

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
            <div className="text-base font-extrabold text-brand-purple mb-1">
              Rebook {rebookData.dogName}
            </div>
            <div className="text-[13px] text-slate-500 mb-3">
              Pre-filled from previous appointment. Choose a date and slot, then confirm.
            </div>

            <button
              type="button"
              onClick={() => setShowRebookDatePicker(true)}
              className="w-full mb-2.5 py-2.5 px-3 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-brand-purple text-[13px] font-semibold cursor-pointer font-[inherit] flex justify-between items-center"
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
                    dogId: rebookData._dogId,
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
                        ? "border-brand-yellow bg-brand-yellow text-brand-purple"
                        : "border-slate-200 bg-white"
                    } ${
                      allowed
                        ? "cursor-pointer opacity-100"
                        : "cursor-not-allowed opacity-50"
                    } ${
                      !isActive && allowed ? "text-brand-purple" : ""
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
                      dogId: rebookData._dogId,
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
          onConfirm={() => {
            handleRemoveSlot();
            setConfirmRemoveSlot(null);
          }}
          onCancel={() => setConfirmRemoveSlot(null)}
        />
      )}

      {confirmDayToggle && (
        <ConfirmDialog
          title={confirmDayToggle === "close" ? "Close this day?" : "Open this day?"}
          message={
            confirmDayToggle === "close"
              ? dayBookings.length > 0
                ? `This will mark the day as closed. ${dayBookings.length} booking${dayBookings.length === 1 ? "" : "s"} will need rearranging — to-do items will be created for each one.`
                : "This will mark the day as closed. No bookings to rearrange."
              : "This will open the day for appointments."
          }
          confirmLabel={confirmDayToggle === "close" ? "Yes, close it" : "Yes, open it"}
          variant={confirmDayToggle === "close" ? "danger" : "primary"}
          onConfirm={() => handleConfirmDayToggle(confirmDayToggle)}
          onCancel={() => setConfirmDayToggle(null)}
        />
      )}
    </div>
  );
}
