import { useRef, useEffect } from "react";
import { DayTab } from "./DayTab.jsx";
import { MonthTab } from "./MonthTab.jsx";
import { WaitlistNote } from "../booking/WaitlistNote.jsx";

export function CalendarTabs({
  dates,
  selectedDay,
  onSelectDay,
  bookingsByDate,
  dayOpenState,
  currentDateObj,
  calendarMode,
  onSelectMonth,
  humans,
  dogs,
  onOpenHuman,
}) {
  const activeTabRef = useRef(null);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedDay, calendarMode]);

  return (
    <div className="flex gap-1.5 px-1 -mb-[2px] relative z-[3] overflow-x-auto md:overflow-x-visible snap-x snap-mandatory scrollbar-none">
      {dates.map((d, i) => {
        const isOpen = dayOpenState[d.dateStr] ?? true;
        const dogCount = (bookingsByDate[d.dateStr] || []).length;
        const isActive = calendarMode !== "month" && selectedDay === i;

        return (
          <div
            key={d.dateStr}
            ref={isActive ? activeTabRef : null}
            className="snap-center shrink-0"
          >
            <DayTab
              dateObj={d.dateObj}
              dogCount={dogCount}
              isOpen={isOpen}
              isActive={isActive}
              onClick={() => onSelectDay(i)}
            />
          </div>
        );
      })}

      <div
        ref={calendarMode === "month" ? activeTabRef : null}
        className="snap-center shrink-0"
      >
        <MonthTab
          currentDateObj={currentDateObj}
          bookingsByDate={bookingsByDate}
          isActive={calendarMode === "month"}
          onClick={onSelectMonth}
        />
      </div>

      <WaitlistNote
        currentDateObj={currentDateObj}
        humans={humans}
        dogs={dogs}
        onOpenHuman={onOpenHuman}
      />
    </div>
  );
}
