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
    <aside className="flex flex-col gap-4" aria-label="Calendar and capacity overview">
      <MiniCalendarCard
        currentDateObj={currentDateObj}
        onSelectDate={onSelectDate}
      />
      <CapacityCard
        currentDateObj={currentDateObj}
        dates={dates}
        bookingsByDate={bookingsByDate}
        dayOpenState={dayOpenState}
        daySettings={daySettings}
        onSelectDate={onSelectDate}
      />
      <WeeklyRevenueCard
        dates={dates}
        bookingsByDate={bookingsByDate}
        dogs={dogs}
        currentDateObj={currentDateObj}
        loading={bookingsLoading}
      />
    </aside>
  );
}
