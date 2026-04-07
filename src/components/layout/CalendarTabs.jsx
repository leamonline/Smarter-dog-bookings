import { DayTab } from "./DayTab.jsx";
import { MonthTab } from "./MonthTab.jsx";

export function CalendarTabs({
  dates,
  selectedDay,
  onSelectDay,
  bookingsByDate,
  dayOpenState,
  currentDateObj,
  calendarMode,
  onSelectMonth,
}) {
  return (
    <div style={{
      display: "flex",
      gap: 6,
      padding: "0 4px",
      overflow: "hidden",
    }}>
      {dates.map((d, i) => {
        const isOpen = dayOpenState[d.dateStr] ?? true;
        const dogCount = (bookingsByDate[d.dateStr] || []).length;
        const isActive = calendarMode !== "month" && selectedDay === i;

        return (
          <DayTab
            key={d.dateStr}
            dateObj={d.dateObj}
            dogCount={dogCount}
            isOpen={isOpen}
            isActive={isActive}
            onClick={() => onSelectDay(i)}
          />
        );
      })}

      <MonthTab
        currentDateObj={currentDateObj}
        bookingsByDate={bookingsByDate}
        isActive={calendarMode === "month"}
        onClick={onSelectMonth}
      />
    </div>
  );
}
