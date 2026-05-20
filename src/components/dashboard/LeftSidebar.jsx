import { WeekOverviewCard } from "./WeekOverviewCard.jsx";
import { MiniCalendarCard } from "./MiniCalendarCard.jsx";
import { CapacityCard } from "./CapacityCard.jsx";
import { WeeklyRevenueCard } from "./WeeklyRevenueCard.jsx";

export function LeftSidebar({
  dates,
  selectedDay,
  onSelectDay,
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
      {/* Week pills only on desktop — tablet/mobile uses CalendarTabs
          at the top of the page to avoid duplicate weight. */}
      <div className="hidden xl:block">
        <WeekOverviewCard
          dates={dates}
          selectedDay={selectedDay}
          onSelectDay={onSelectDay}
          bookingsByDate={bookingsByDate}
          dayOpenState={dayOpenState}
          loading={bookingsLoading}
        />
      </div>
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
