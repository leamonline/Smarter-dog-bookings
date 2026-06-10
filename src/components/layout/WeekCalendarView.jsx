import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { CalendarDays } from "lucide-react";
import { SALON_SLOTS } from "../../constants/index.ts";
import { canBookSlot, isCapacityRejection } from "../../engine/capacity";
import { toDateStr } from "../../supabase/transforms";
import { getDefaultOpenForDate } from "../../engine/utils.ts";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { PullToRefresh } from "../shared/PullToRefresh.jsx";
import { AddBookingForm } from "../booking/AddBookingForm.jsx";
import { CalendarTabs } from "./CalendarTabs.jsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { useTodos } from "../../supabase/hooks/useTodos.js";
import { useWaitlist } from "../../supabase/hooks/useWaitlist.js";
import { useWhatsAppUnread } from "../../supabase/hooks/useWhatsAppUnread.js";
import { useTomorrowReminders } from "../../supabase/hooks/useTomorrowReminders.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { FloatingDecor } from "../decor/index.jsx";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";

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
  bookingsError,
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

  const toast = useToast();
  const { todos, addTodos, loading: todoLoading } = useTodos();
  const openTodoCount = todos.filter((t) => !t.done).length;
  const {
    waitlist,
    loading: waitlistLoading,
    error: waitlistError,
    joinWaitlist,
    leaveWaitlist,
  } = useWaitlist(currentDateObj);
  const { unread: waUnread } = useWhatsAppUnread();
  const reminders = useTomorrowReminders();
  const pendingReminderCount = reminders.totalCount - reminders.sentCount;

  const isOpen = currentSettings.isOpen;
  const dayBookings = bookingsByDate[currentDateStr] || [];

  const activeSlots = useMemo(() => {
    return [...SALON_SLOTS, ...(currentSettings.extraSlots || [])];
  }, [currentSettings.extraSlots]);

  const openNewBooking = (dateStr, slot, options = {}) =>
    setShowNewBooking({
      dateStr: dateStr || currentDateStr,
      slot: slot || "",
      capacityOverride: options.capacityOverride === true,
    });

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

  const handleConfirmDayToggle = async (mode) => {
    if (mode === "close" && dayBookings.length > 0) {
      const dateLabel = currentDateObj.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      const items = dayBookings.map((b) => {
        const dogName = (b.dogName || "").trim();
        const owner = (b.ownerName || b.owner || "").trim();
        let label;
        if (dogName && owner) label = `${dogName} (${owner})`;
        else if (dogName) label = dogName;
        else if (owner) label = `${owner}'s dog`;
        else label = "Booking";
        return `Rearrange: ${label} — was ${dateLabel} ${b.slot}`;
      });
      // Toast on failure so staff aren't left thinking the rearrange
      // reminders went onto the to-do list when they actually didn't.
      const result = await addTodos(items);
      if (result?.ok === false) {
        toast.show(result.error || "Couldn't add rearrange notes to the to-do list.", "error");
      }
    }
    toggleDayOpen();
    setConfirmDayToggle(null);
  };

  // --- Rebook derived state ---
  const rebookDateStr = rebookData?.dateStr || "";
  const rebookSettings = useMemo(
    () =>
      rebookData
        ? daySettings[rebookDateStr] || {
            isOpen:
              dayOpenState[rebookDateStr] ?? getDefaultOpenForDate(rebookData.date),
            overrides: {},
            extraSlots: [],
          }
        : null,
    [rebookData, daySettings, rebookDateStr, dayOpenState],
  );

  const rebookSlots = useMemo(
    () =>
      rebookData
        ? [...SALON_SLOTS, ...(rebookSettings?.extraSlots || [])]
        : [],
    [rebookData, rebookSettings],
  );
  const rebookBookings = useMemo(
    () => (rebookData ? bookingsByDate[rebookDateStr] || [] : []),
    [rebookData, bookingsByDate, rebookDateStr],
  );
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
          staffOverride: true,
        }).allowed,
    );
  }, [rebookData, rebookSlots, rebookBookings, rebookSettings]);

  // Same shape as rebookAvailableSlots, but for slots that are over
  // capacity yet staff-overridable. The slot button renders these in
  // amber so the user knows they're overriding when they pick one.
  // AddBookingForm's own override popup catches it on submit.
  const rebookOverrideSlots = useMemo(() => {
    if (!rebookData) return new Set();
    const set = new Set();
    for (const slot of rebookSlots) {
      const result = canBookSlot(rebookBookings, slot, rebookData.size, rebookSlots, {
        overrides: rebookSettings?.overrides?.[slot] || {},
        dogId: rebookData._dogId,
        staffOverride: true,
      });
      if (!result.allowed && isCapacityRejection(result.reason)) {
        set.add(slot);
      }
    }
    return set;
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
              bookingsLoading={bookingsLoading}
            />
          }
          main={
            <BookingMainPanel
              currentDateObj={currentDateObj}
              currentDateStr={currentDateStr}
              bookings={dayBookings}
              bookingsLoading={bookingsLoading}
              bookingsError={bookingsError}
              onRetry={onRefresh}
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
                  reminderCount={pendingReminderCount}
                  reminderData={reminders}
                  onOpenWaitlist={() => setShowWaitlist(true)}
                  onOpenTodos={() => setShowTodos(true)}
                  onCreateBookingFromWhatsApp={handleCreateBookingFromWhatsApp}
                  waitlistLoading={waitlistLoading}
                  todoLoading={todoLoading}
                />
              </div>
              <div className="hidden xl:block">
                <RightWorkflowSidebar
                  onOpenWaitlist={() => setShowWaitlist(true)}
                  onOpenTodos={() => setShowTodos(true)}
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
        <AccessibleModal
          onClose={() => {
            setRebookData(null);
            setShowRebookDatePicker(false);
          }}
          titleId="rebook-dialog-title"
          className="bg-white rounded-2xl w-[min(420px,95vw)] max-h-[92vh] overflow-y-auto py-5 px-6 shadow-modal"
        >
            <h2 id="rebook-dialog-title" className="text-base font-extrabold text-brand-purple mb-1">
              Rebook {rebookData.dogName}
            </h2>
            <div className="text-[13px] text-slate-500 mb-3">
              Pre-filled from previous appointment. Choose a date and slot, then confirm.
            </div>

            <button
              type="button"
              onClick={() => setShowRebookDatePicker(true)}
              className="w-full mb-2.5 py-2.5 px-3 rounded-control border-[1.5px] border-slate-200 bg-white text-brand-purple text-[13px] font-semibold cursor-pointer font-[inherit] flex justify-between items-center"
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
              <CalendarDays size={16} strokeWidth={2} aria-hidden="true" className="text-brand-purple/60" />
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
                    staffOverride: true,
                  },
                ).allowed;
                const isOverride = !allowed && rebookOverrideSlots.has(slot);
                const isClickable = allowed || isOverride;
                const isActive = rebookData.slot === slot;

                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={!isClickable}
                    onClick={() =>
                      setRebookData((prev) => ({ ...prev, slot }))
                    }
                    title={
                      isOverride
                        ? "Over capacity. Pick to override on submit."
                        : undefined
                    }
                    aria-label={
                      isOverride ? `${slot} — over capacity, click to override` : slot
                    }
                    className={`py-2 rounded-lg border-[1.5px] text-[13px] font-semibold font-[inherit] transition-all ${
                      isActive
                        ? "border-brand-yellow bg-brand-yellow text-brand-purple"
                        : isOverride
                          ? "border-amber-400 bg-amber-50 text-amber-900"
                          : "border-slate-200 bg-white"
                    } ${
                      isClickable
                        ? "cursor-pointer opacity-100"
                        : "cursor-not-allowed opacity-50"
                    } ${
                      !isActive && allowed ? "text-brand-purple" : ""
                    } ${
                      !isActive && !isClickable ? "text-slate-500" : ""
                    }`}
                  >
                    {slot}
                    {isOverride && !isActive && (
                      <div className="text-[9px] font-bold mt-0.5 leading-none">over</div>
                    )}
                  </button>
                );
              })}
            </div>

            {rebookAvailableSlots.length === 0 && rebookOverrideSlots.size === 0 && (
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
        </AccessibleModal>
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
                      staffOverride: true,
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
