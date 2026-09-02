import { useState, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { buildSlotGrid } from "../../engine/slotGrid";
import { excludeCancelled } from "../../engine/occupancy";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { PullToRefresh } from "../shared/PullToRefresh.jsx";
import { CalendarTabs } from "./CalendarTabs.jsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { useTodos } from "../../supabase/hooks/useTodos";
import { useWaitlist } from "../../supabase/hooks/useWaitlist";
import { useTomorrowReminders } from "../../supabase/hooks/useTomorrowReminders";
import { useDeliveryFailures } from "../../supabase/hooks/useDeliveryFailures";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useSalon } from "../../contexts/SalonContext";
import { FloatingDecor } from "../decor/index.jsx";
import { BOOKING_STATUS } from "../../constants/index";

import { DashboardShell } from "../dashboard/DashboardShell.jsx";
import { LeftSidebar } from "../dashboard/LeftSidebar.jsx";
import { BookingMainPanel } from "../dashboard/BookingMainPanel.jsx";
import { RightWorkflowSidebar } from "../dashboard/RightWorkflowSidebar.jsx";
import { DaySettingsDrawer } from "../dashboard/DaySettingsDrawer.jsx";
import { OverviewDrawer } from "../dashboard/OverviewDrawer.jsx";
import { MiniCalendarCard } from "../dashboard/MiniCalendarCard.jsx";
import { CapacityCard } from "../dashboard/CapacityCard.jsx";
import { DeliveryFailuresCard } from "../dashboard/DeliveryFailuresCard.jsx";

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
const RemindersModal = lazy(() =>
  import("../modals/RemindersModal.jsx").then((module) => ({
    default: module.RemindersModal,
  })),
);
const BroadcastMessageModal = lazy(() =>
  import("../modals/day-closure/BroadcastMessageModal.jsx").then((module) => ({
    default: module.BroadcastMessageModal,
  })),
);

export function WeekCalendarView({
  selectedDay,
  setSelectedDay,
  dates,
  currentSettings,
  handleOverride,
  toggleImmediateSlot,
  handleAddSlot,
  handleRemoveSlot,
  toggleDayOpen,
  showDatePicker,
  setShowDatePicker,
  handleDatePick,
  setShowNewBooking,
  draftPick,
  onOpenClosureVisit,
  onRefresh,
}) {
  // Shared salon data + core actions come from SalonContext (Debt 11): the
  // shell provides them once instead of threading them through 30 props.
  const {
    dogs,
    humans,
    bookingsByDate,
    bookingsLoading,
    bookingsError,
    daySettings,
    dayOpenState,
    dogsByHumanId,
    ensureDogsForHumans,
    currentDateStr,
    currentDateObj,
    onUpdate: handleUpdate,
    onOpenHuman,
  } = useSalon();
  const [searchQuery] = useState("");
  const [confirmRemoveSlot, setConfirmRemoveSlot] = useState(null);
  const [confirmDayToggle, setConfirmDayToggle] = useState(null);
  const [dayTogglePending, setDayTogglePending] = useState(false);
  const dayTogglePendingRef = useRef(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [showTodos, setShowTodos] = useState(false);
  const [showDaySettings, setShowDaySettings] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  // Mobile week strip can expand into a full month grid (reuses the desktop
  // MiniCalendarCard). Picking a day collapses it back to the week view.
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);

  // Listen for the AppToolbar's "Overview" trigger — keeps the
  // toolbar decoupled from dashboard state.
  useEffect(() => {
    const handler = () => setShowOverview(true);
    window.addEventListener("smarterdog:open-overview", handler);
    return () => window.removeEventListener("smarterdog:open-overview", handler);
  }, []);

  const toast = useToast();
  const { todos } = useTodos();
  const openTodoCount = todos.filter((t) => !t.done).length;
  const {
    waitlist,
    loading: waitlistLoading,
    error: waitlistError,
    joinWaitlist,
    leaveWaitlist,
  } = useWaitlist(currentDateObj);
  const reminders = useTomorrowReminders();
  const pendingReminderCount = reminders.totalCount - reminders.sentCount;
  // Delivery failures (failed confirmations/reminders) only surfaced in the
  // desktop RightWorkflowSidebar; surface them on mobile/tablet too via a
  // banner above the utility tabs so a broken number isn't missed on a phone.
  // Singleton hook — shares one fetch/subscription with the desktop sidebar.
  const failures = useDeliveryFailures();

  const isOpen = currentSettings.isOpen;
  // Cancelled rows are soft-deletes that free their seat. Strip them here so
  // the grid and booking count treat the day as non-cancelled occupancy (what
  // the capacity engine expects).
  const dayBookings = excludeCancelled(bookingsByDate[currentDateStr] || []);
  // The database creates closure work only for non-terminal visits. Keep the
  // confirmation copy aligned: a completed appointment happened and does not
  // need rearranging.
  const bookingsNeedingRearrangement = dayBookings.filter(
    (booking) => booking.status !== BOOKING_STATUS.COMPLETED,
  );

  // Clicking a delivery-failure row jumps the calendar to that booking's day
  // (noon-anchored to dodge TZ rollover) so staff can open it and resend.
  const handleSelectFailure = (failure) => {
    if (failure?.bookingDate) handleDatePick(new Date(`${failure.bookingDate}T12:00:00`));
  };

  const navigateDay = (delta) => {
    const target = new Date(currentDateObj);
    target.setDate(target.getDate() + delta);
    handleDatePick(target);
  };

  const activeSlots = useMemo(() => {
    return buildSlotGrid(currentSettings.extraSlots || []);
  }, [currentSettings.extraSlots]);

  const openNewBooking = (dateStr, slot, options = {}) =>
    setShowNewBooking({
      dateStr: dateStr || currentDateStr,
      slot: slot || "",
      capacityOverride: options.capacityOverride === true,
    });

  const handlePrintDaySheet = () => {
    if (typeof window !== "undefined") window.print();
  };

  const handleConfirmDayToggle = async (mode) => {
    if (dayTogglePendingRef.current) return;
    dayTogglePendingRef.current = true;
    setDayTogglePending(true);
    try {
      // The online path closes day_settings and creates linked, one-per-visit
      // tasks in a single RPC. Offline/sample mode returns no result and keeps
      // its existing local-only toggle.
      // Send the confirmed target state, not merely "toggle". A realtime
      // update from another device while this dialog is open must not turn a
      // stale "Close" confirmation into an accidental reopen.
      const result = await toggleDayOpen(mode === "open");
      if (result?.ok === false) {
        toast.show(
          result.error ||
            (mode === "close"
              ? "Couldn't close that day — give it another go"
              : "Couldn't open that day — give it another go"),
          "error",
        );
        return;
      }
      setConfirmDayToggle(null);
    } catch (error) {
      toast.show(
        error?.message ||
          (mode === "close"
            ? "Couldn't close that day — give it another go"
            : "Couldn't open that day — give it another go"),
        "error",
      );
    } finally {
      dayTogglePendingRef.current = false;
      setDayTogglePending(false);
    }
  };

  return (
    <div className="relative">
      <FloatingDecor />

      {/* Compact week pills on tablet/mobile — desktop uses the
          left-sidebar WeekOverviewCard. The week strip runs full width; the
          day's prev/next arrows flank the month/week toggle on the row below. */}
      <div className="lg:hidden mb-3">
        {monthExpanded ? (
          /* Expanded month grid in its own card. Tapping a day collapses back
             to the week; a slim footer button does the same explicitly. */
          <div className="bg-white rounded-2xl border border-gray-100 shadow-card-resting overflow-hidden">
            <MiniCalendarCard
              bare
              currentDateObj={currentDateObj}
              onSelectDate={(d) => {
                handleDatePick(d);
                setMonthExpanded(false);
              }}
            />
            <button
              type="button"
              onClick={() => setMonthExpanded(false)}
              className="w-full flex items-center justify-center gap-1.5 py-2 border-t border-slate-100 border-x-0 border-b-0 bg-transparent cursor-pointer text-[11px] font-bold uppercase tracking-tight text-brand-purple/70 hover:text-brand-purple hover:bg-slate-50 transition-colors font-[inherit]"
            >
              <ChevronLeft size={14} strokeWidth={2.5} aria-hidden="true" />
              Back to week
            </button>
          </div>
        ) : (
          /* Week strip on a single row: prev/next-day arrows flank the pills on
             phones, and a calendar icon opens the month. "Today" = tap today's
             pill. This drops the separate Today/Week/Month switcher row, so the
             schedule sits ~a control-row higher on a phone. */
          <div className="bg-white rounded-2xl border border-gray-100 shadow-card-resting flex items-center gap-0.5 px-1">
            <button
              type="button"
              onClick={() => navigateDay(-1)}
              aria-label="Previous day"
              className="sm:hidden w-8 h-10 rounded-lg flex items-center justify-center border-none cursor-pointer bg-transparent text-brand-purple/60 hover:text-brand-purple hover:bg-brand-purple/5 transition-colors shrink-0"
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <div className="flex-1 min-w-0">
              <CalendarTabs
                bare
                dates={dates}
                selectedDay={selectedDay}
                onSelectDay={(i) => setSelectedDay(i)}
                bookingsByDate={bookingsByDate}
                dayOpenState={dayOpenState}
                calendarMode="day"
              />
            </div>
            <button
              type="button"
              onClick={() => navigateDay(1)}
              aria-label="Next day"
              className="sm:hidden w-8 h-10 rounded-lg flex items-center justify-center border-none cursor-pointer bg-transparent text-brand-purple/60 hover:text-brand-purple hover:bg-brand-purple/5 transition-colors shrink-0"
            >
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => setMonthExpanded(true)}
              aria-label="Month view"
              aria-pressed={false}
              className="w-9 h-10 rounded-lg flex items-center justify-center border-none cursor-pointer bg-transparent text-brand-purple/60 hover:text-brand-purple hover:bg-brand-purple/5 transition-colors shrink-0"
            >
              <CalendarDays size={18} strokeWidth={2.25} />
            </button>
          </div>
        )}
      </div>

      {/* Delivery failures must never be missed — surface them above the
          schedule on mobile/tablet/iPad-landscape whenever there are any. The rest of the
          workflow (reminders / waitlist / tasks) now lives as badges on the
          day's controls bar. Desktop (xl+) keeps the full RightWorkflowSidebar. */}
      {failures?.count > 0 && (
        <div className="xl:hidden mb-3">
          <DeliveryFailuresCard data={failures} onSelectFailure={handleSelectFailure} />
        </div>
      )}

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
              immediateSlots={currentSettings.immediateSlots || []}
              draftPick={draftPick}
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
              onToggleImmediate={toggleImmediateSlot}
              onOpenWaitlist={() => setShowWaitlist(true)}
              reminderCount={pendingReminderCount}
              waitlistCount={waitlist.length}
              todoCount={openTodoCount}
              onOpenReminders={() => setShowReminders(true)}
              onOpenTodos={() => setShowTodos(true)}
              onMessageDay={() => setShowBroadcast(true)}
              onCloseDay={() => setConfirmDayToggle("close")}
              onOpenDay={() => setConfirmDayToggle("open")}
              onOpenDaySettings={() => setShowDaySettings(true)}
              onOpenOverview={() => setShowOverview(true)}
              searchQuery={searchQuery}
            />
          }
          right={
            // Desktop (xl+) only: the full stacked workflow sidebar. Below
            // xl the workflow signals live as badges on the day's controls
            // bar (reminders / waitlist / tasks), so this column is empty.
            <div className="hidden xl:block">
              <RightWorkflowSidebar
                onOpenWaitlist={() => setShowWaitlist(true)}
                onOpenTodos={() => setShowTodos(true)}
                onOpenReminders={() => setShowReminders(true)}
                onSelectFailure={handleSelectFailure}
              />
            </div>
          }
        />
      </PullToRefresh>

      {/* Capacity overview at the foot of the page on mobile/tablet —
          desktop carries it in the left sidebar. */}
      <div className="xl:hidden mt-3">
        <CapacityCard
          currentDateObj={currentDateObj}
          dates={dates}
          bookingsByDate={bookingsByDate}
          dayOpenState={dayOpenState}
          daySettings={daySettings}
          onSelectDate={handleDatePick}
        />
      </div>

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
            loading={waitlistLoading}
            error={waitlistError}
            joinWaitlist={joinWaitlist}
            leaveWaitlist={leaveWaitlist}
            onClose={() => setShowWaitlist(false)}
          />
        </Suspense>
      )}

      {showTodos && (
        <Suspense fallback={<LoadingSpinner />}>
          <TodoModal
            onClose={() => setShowTodos(false)}
            onOpenClosureVisit={onOpenClosureVisit}
          />
        </Suspense>
      )}

      {showReminders && (
        <Suspense fallback={<LoadingSpinner />}>
          <RemindersModal onClose={() => setShowReminders(false)} />
        </Suspense>
      )}

      {showBroadcast && (
        <Suspense fallback={<LoadingSpinner />}>
          <BroadcastMessageModal
            defaultDate={currentDateStr}
            onClose={() => setShowBroadcast(false)}
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
              ? bookingsNeedingRearrangement.length > 0
                ? "This will mark the day as closed. Linked to-do items will be created for the visits that need rearranging."
                : "This will mark the day as closed. No bookings to rearrange."
              : "This will open the day for appointments."
          }
          confirmLabel={
            dayTogglePending
              ? confirmDayToggle === "close"
                ? "Closing…"
                : "Opening…"
              : confirmDayToggle === "close"
                ? "Yes, close it"
                : "Yes, open it"
          }
          pending={dayTogglePending}
          variant={confirmDayToggle === "close" ? "danger" : "primary"}
          onConfirm={() => handleConfirmDayToggle(confirmDayToggle)}
          onCancel={() => setConfirmDayToggle(null)}
        />
      )}
    </div>
  );
}
