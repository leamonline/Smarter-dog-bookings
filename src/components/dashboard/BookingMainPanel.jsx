import { toDateStr } from "../../supabase/transforms.js";
import { DayHeader } from "./DayHeader.jsx";
import { EmptyDayPanel } from "./EmptyDayPanel.jsx";
import { BookingGridControls } from "./BookingGridControls.jsx";
import { SlotGrid } from "../booking/SlotGrid.jsx";
import { BookingList } from "../booking/BookingList.jsx";
import { ClosedDayView } from "../layout/ClosedDayView.jsx";

export function BookingMainPanel({
  currentDateObj,
  currentDateStr,
  bookings,
  bookingsLoading,
  dogs,
  isOpen,
  activeSlots,
  overrides,
  viewMode,
  setViewMode,
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
  const showEmpty = isOpen && !hasBookings && !bookingsLoading;
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

      {isOpen ? (
        <>
          {showEmpty && (
            <EmptyDayPanel
              currentDateObj={currentDateObj}
              onAddBooking={() => onOpenNewBooking(currentDateStr, "")}
              onOpenWaitlist={onOpenWaitlist}
              onCloseDay={onCloseDay}
            />
          )}

          <BookingGridControls
            bookingCount={(bookings || []).length}
            viewMode={viewMode}
            setViewMode={setViewMode}
            onOpenDaySettings={onOpenDaySettings}
          />

          {/* Booking grid card. On xl, it claims the remaining
              vertical space in the middle column and scrolls
              internally so the bottom edge lines up with the
              Revenue card on the left. */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden xl:flex-1 xl:min-h-0 xl:flex xl:flex-col">
            <div className="xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
              {viewMode === "grid" ? (
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
              ) : (
                <BookingList bookings={bookings} searchQuery={searchQuery} />
              )}
            </div>
          </div>
        </>
      ) : (
        <ClosedDayView onOpen={onOpenDay} />
      )}
    </section>
  );
}
