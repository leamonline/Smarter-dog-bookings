import { toDateStr } from "../../supabase/transforms";
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
  onNavigateDay,
  onOpenCalendar,
  onOpenOverview,
  onOpenNewBooking,
  onMoveBooking,
  onOverride,
  onOpenWaitlist,
  onCloseDay,
  onOpenDay,
  onOpenDaySettings,
  searchQuery,
}) {
  const hasBookings = (bookings || []).length > 0;
  // Only surface the inline error when this day's grid would otherwise
  // look empty. If bookings did load for the day, suppress the inline
  // banner — the global page-level banner is already covering the
  // upstream issue and we don't want to double up.
  const showError = isOpen && !hasBookings && !bookingsLoading && bookingsError;
  const showEmpty = isOpen && !hasBookings && !bookingsLoading && !bookingsError;
  const todayStr = toDateStr(new Date());
  const currentStr = toDateStr(currentDateObj);
  const isToday = todayStr === currentStr;

  const jumpToToday = () => {
    const diffDays = Math.round(
      (new Date(todayStr) - new Date(currentStr)) / (1000 * 60 * 60 * 24),
    );
    if (diffDays !== 0) onNavigateDay(diffDays);
  };

  return (
    <section
      className="flex flex-col gap-3 min-w-0 xl:flex-1 xl:min-h-0 xl:h-full"
      aria-label="Booking schedule"
    >
      <DayHeader
        currentDateObj={currentDateObj}
        onNavigateDay={onNavigateDay}
        onJumpToToday={!isToday ? jumpToToday : undefined}
        onOpenCalendar={onOpenOverview || onOpenCalendar}
      />

      {/* Controls row renders on closed days too — staff still need the
          date pill, Day settings (to reopen), calendar, Today and refresh
          without leaving the day. */}
      <BookingGridControls
        bookingCount={(bookings || []).length}
        isOpen={isOpen}
        onOpenDaySettings={onOpenDaySettings}
        onOpenOverview={onOpenOverview || onOpenCalendar}
        onJumpToToday={!isToday ? jumpToToday : undefined}
        onRefresh={onRetry}
        dateLabel={currentDateObj.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
        })}
      />

      {isOpen ? (
        <>
          {showError && (
            <ErrorBanner
              title="Couldn't load today's bookings"
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
          <div className="bg-white rounded-2xl border border-gray-100 shadow-card-resting overflow-hidden xl:flex-1 xl:min-h-0 xl:flex xl:flex-col">
            <div className="xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
              <SlotGrid
                bookings={bookings}
                loading={bookingsLoading && bookings.length === 0}
                activeSlots={activeSlots}
                onOpenNewBooking={onOpenNewBooking}
                onMoveBooking={onMoveBooking}
                currentDateStr={currentDateStr}
                overrides={overrides}
                onOverride={onOverride}
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
