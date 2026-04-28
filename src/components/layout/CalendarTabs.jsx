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
      className="flex items-center justify-start xl:justify-around gap-1 xl:gap-0 px-2 py-1.5 bg-white xl:bg-transparent xl:border-0 xl:py-0 xl:px-0 border-b border-slate-200 overflow-x-auto xl:overflow-visible snap-x snap-proximity scrollbar-none scroll-px-2"
    >
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
