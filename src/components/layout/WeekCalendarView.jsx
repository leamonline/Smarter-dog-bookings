import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SALON_SLOTS } from "../../constants/index.ts";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { PullToRefresh } from "../shared/PullToRefresh.jsx";
import { CalendarTabs } from "./CalendarTabs.jsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { useTodos } from "../../supabase/hooks/useTodos.js";
import { useWaitlist } from "../../supabase/hooks/useWaitlist.js";
import { useWhatsAppUnread } from "../../supabase/hooks/useWhatsAppUnread.js";
import { useTomorrowReminders } from "../../supabase/hooks/useTomorrowReminders.js";
import { useDeliveryFailures } from "../../supabase/hooks/useDeliveryFailures.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { FloatingDecor } from "../decor/index.jsx";

import { DashboardShell } from "../dashboard/DashboardShell.jsx";
import { LeftSidebar } from "../dashboard/LeftSidebar.jsx";
import { BookingMainPanel } from "../dashboard/BookingMainPanel.jsx";
import { RightWorkflowSidebar } from "../dashboard/RightWorkflowSidebar.jsx";
import { DaySettingsDrawer } from "../dashboard/DaySettingsDrawer.jsx";
import { OverviewDrawer } from "../dashboard/OverviewDrawer.jsx";
import { WorkflowStatusStrip } from "../dashboard/WorkflowStatusStrip.jsx";
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
  handleUpdate,
  handleOverride,
  handleAddSlot,
  handleRemoveSlot,
  toggleDayOpen,
  showDatePicker,
  setShowDatePicker,
  handleDatePick,
  setShowNewBooking,
  onOpenHuman,
  onRefresh,
}) {
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
  // Delivery failures (failed confirmations/reminders) only surfaced in the
  // desktop RightWorkflowSidebar; surface them on mobile/tablet too via a
  // banner above the utility tabs so a broken number isn't missed on a phone.
  // Singleton hook — shares one fetch/subscription with the desktop sidebar.
  const failures = useDeliveryFailures();

  const isOpen = currentSettings.isOpen;
  const dayBookings = bookingsByDate[currentDateStr] || [];

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

  return (
    <div className="relative">
      <FloatingDecor />

      {/* Compact week pills on tablet/mobile — desktop uses the
          left-sidebar WeekOverviewCard. On phones (< sm) the DayHeader
          bar is hidden, so prev/next chevrons and the calendar button
          flank the pills here instead — one row of date chrome, not two. */}
      <div className="xl:hidden mb-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigateDay(-1)}
          aria-label="Previous day"
          className="sm:hidden tap-target w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer bg-white shadow-card-resting text-brand-purple/60 hover:text-brand-purple transition-colors shrink-0"
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
        <div className="flex-1 min-w-0">
          <CalendarTabs
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
          className="sm:hidden tap-target w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer bg-white shadow-card-resting text-brand-purple/60 hover:text-brand-purple transition-colors shrink-0"
        >
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      </div>

      {/* Workflow panels (< xl): a compact, collapsible strip ABOVE the
          schedule so urgent items surface at a glance instead of being
          buried below the day's slot list. Desktop (xl+) keeps the full
          RightWorkflowSidebar in the right rail. */}
      <div className="xl:hidden mb-3">
        <WorkflowStatusStrip
          failures={failures}
          onSelectFailure={handleSelectFailure}
          messageCount={waUnread}
          reminderCount={pendingReminderCount}
          waitlistCount={waitlist.length}
          todoCount={openTodoCount}
          reminderData={reminders}
          onOpenWaitlist={() => setShowWaitlist(true)}
          onOpenTodos={() => setShowTodos(true)}
          onCreateBookingFromWhatsApp={handleCreateBookingFromWhatsApp}
          waitlistLoading={waitlistLoading}
          todoLoading={todoLoading}
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
            // Desktop (xl+) only: the full stacked workflow sidebar. Below
            // xl the panels live in the WorkflowStatusStrip above the
            // schedule, so the right column is empty there.
            <div className="hidden xl:block">
              <RightWorkflowSidebar
                onOpenWaitlist={() => setShowWaitlist(true)}
                onOpenTodos={() => setShowTodos(true)}
                onSelectFailure={handleSelectFailure}
              />
            </div>
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
          <TodoModal onClose={() => setShowTodos(false)} />
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
