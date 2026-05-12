import { useRef, useEffect } from "react";
import { DayTab } from "./DayTab.jsx";

export function CalendarTabs({
  dates,
  selectedDay,
  onSelectDay,
  bookingsByDate,
  dayOpenState,
  calendarMode,
}) {
  const activeTabRef = useRef(null);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedDay]);

  return (
    <div
      role="tablist"
      aria-label="Day navigation"
      className="grid grid-cols-7 items-center px-2 py-2 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-x-auto snap-x snap-proximity scrollbar-none scroll-px-2"
    >
      {dates.map((d, i) => {
        const isOpen = dayOpenState[d.dateStr] ?? true;
        const dogCount = (bookingsByDate[d.dateStr] || []).length;
        const isActive = calendarMode !== "month" && selectedDay === i;

        return (
          <div
            key={d.dateStr}
            ref={isActive ? activeTabRef : null}
            className="snap-center flex justify-center"
          >
            <DayTab
              id={`day-tab-${d.dateStr}`}
              dateObj={d.dateObj}
              dogCount={dogCount}
              isOpen={isOpen}
              isActive={isActive}
              onClick={() => onSelectDay(i)}
            />
          </div>
        );
      })}
    </div>
  );
}
