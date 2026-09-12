import { MiniCalendarCard } from "./MiniCalendarCard.jsx";
import { CapacityCard } from "./CapacityCard.jsx";
import { WeeklyRevenueCard } from "./WeeklyRevenueCard.jsx";

export function LeftSidebar({
  dates,
  selectedDay: _selectedDay,
  onSelectDay: _onSelectDay,
  currentDateObj,
  bookingsByDate,
  dayOpenState,
  daySettings,
  dogs,
  onSelectDate,
  bookingsLoading = false,
}) {
  return (
    // The capacity card is the one thing here that every width needs, so it
    // is the only child that is always rendered. Below `lg` the whole rail
    // column is re-ordered beneath the schedule and these two siblings drop
    // out, which leaves exactly one CapacityCard in the document at any
    // width. It used to be rendered twice — once here and once as an
    // `xl:hidden` footer — so between 1024 and 1279, where the rail was
    // already visible and the footer had not yet hidden, the same card
    // appeared on screen twice.
    <aside className="flex flex-col gap-4" aria-label="Calendar and capacity overview">
      <div className="hidden lg:block">
        <MiniCalendarCard
          currentDateObj={currentDateObj}
          onSelectDate={onSelectDate}
        />
      </div>
      <CapacityCard
        currentDateObj={currentDateObj}
        dates={dates}
        bookingsByDate={bookingsByDate}
        dayOpenState={dayOpenState}
        daySettings={daySettings}
        onSelectDate={onSelectDate}
      />
      <div className="hidden lg:block">
        <WeeklyRevenueCard
          dates={dates}
          bookingsByDate={bookingsByDate}
          dogs={dogs}
          currentDateObj={currentDateObj}
          loading={bookingsLoading}
        />
      </div>
    </aside>
  );
}
