import { DayHeader } from "./DayHeader.jsx";
import { EmptyDayPanel } from "./EmptyDayPanel.jsx";
import { BookingGridControls } from "./BookingGridControls.jsx";
import { SlotGrid } from "../booking/SlotGrid.jsx";
import { ClosedDayView } from "../layout/ClosedDayView.jsx";
import { ErrorBanner } from "../ui/ErrorBanner.jsx";

export function BookingMainPanel({
  currentDateObj,
  currentDateStr,
  bookings,
  bookingsLoading,
  bookingsError,
  onRetry,
  isOpen,
  activeSlots,
  overrides,
  immediateSlots,
  onNavigateDay,
  onOpenCalendar,
  onOpenOverview,
  onOpenNewBooking,
  onMoveBooking,
  onOverride,
  onToggleImmediate,
  onOpenWaitlist,
  onCloseDay,
  onOpenDay,
  onOpenDaySettings,
  reminderCount = 0,
  waitlistCount = 0,
  todoCount = 0,
  onOpenReminders,
  onOpenTodos,
  onMessageDay,
  searchQuery,
}) {
  const hasBookings = (bookings || []).length > 0;
  // Only surface the inline error when this day's grid would otherwise
  // look empty. If bookings did load for the day, suppress the inline
  // banner — the global page-level banner is already covering the
  // upstream issue and we don't want to double up.
  const showError = isOpen && !hasBookings && !bookingsLoading && bookingsError;
  const showEmpty = isOpen && !hasBookings && !bookingsLoading && !bookingsError;

  return (
    <section
      className="flex flex-col gap-3 min-w-0 lg:flex-1 lg:min-h-0 lg:h-full"
      aria-label="Booking schedule"
    >
      <DayHeader
        currentDateObj={currentDateObj}
        onNavigateDay={onNavigateDay}
        onOpenCalendar={onOpenOverview || onOpenCalendar}
      />

      {/* Controls row renders on closed days too — staff still need the
          status pill and Day settings (to reopen) without leaving the day. */}
      <BookingGridControls
        bookingCount={(bookings || []).length}
        isOpen={isOpen}
        onOpenDaySettings={onOpenDaySettings}
        reminderCount={reminderCount}
        waitlistCount={waitlistCount}
        todoCount={todoCount}
        onOpenReminders={onOpenReminders}
        onOpenWaitlist={onOpenWaitlist}
        onOpenTodos={onOpenTodos}
        onMessageDay={onMessageDay}
      />

      {isOpen ? (
        <>
          {showError && (
            <ErrorBanner
              title="Couldn't load the day's bookings"
              message={typeof bookingsError === "string" ? bookingsError : "Check your connection and try again."}
              retry={onRetry}
              retryLabel="Refresh"
            />
          )}

          {showEmpty && (
            <EmptyDayPanel
              currentDateObj={currentDateObj}
              onAddBooking={() => onOpenNewBooking(currentDateStr, "")}
              onOpenWaitlist={onOpenWaitlist}
              onCloseDay={onCloseDay}
            />
          )}

          {/* Booking grid card. On xl, it claims the remaining
              vertical space in the middle column and scrolls
              internally so the bottom edge lines up with the
              Revenue card on the left. */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-card-resting overflow-hidden lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
            <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
              <SlotGrid
                bookings={bookings}
                loading={bookingsLoading && bookings.length === 0}
                activeSlots={activeSlots}
                onOpenNewBooking={onOpenNewBooking}
                onMoveBooking={onMoveBooking}
                currentDateStr={currentDateStr}
                overrides={overrides}
                onOverride={onOverride}
                immediateSlots={immediateSlots}
                onToggleImmediate={onToggleImmediate}
                searchQuery={searchQuery}
              />
            </div>
          </div>
        </>
      ) : (
        <ClosedDayView onOpen={onOpenDay} />
      )}
    </section>
  );
}
