import { useRef, useEffect } from "react";
import { DayTab } from "./DayTab.jsx";
import { isDateOpen } from "../../engine/utils.js";

export function CalendarTabs({
  dates,
  selectedDay,
  onSelectDay,
  bookingsByDate,
  dayOpenState,
  calendarMode,
}) {
  const tablistRef = useRef(null);
  // Set when a key press moves selection so the effect below knows to also
  // focus the newly active tab (roving tabindex pattern). Reset after use.
  const keyboardNav = useRef(false);

  useEffect(() => {
    const activeBtn = tablistRef.current?.querySelector(
      '[role="tab"][aria-selected="true"]',
    );
    activeBtn?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
    if (keyboardNav.current) {
      activeBtn?.focus();
      keyboardNav.current = false;
    }
  }, [selectedDay]);

  const handleKeyDown = (e) => {
    if (calendarMode === "month") return;
    let next;
    if (e.key === "ArrowRight") next = Math.min(selectedDay + 1, dates.length - 1);
    else if (e.key === "ArrowLeft") next = Math.max(selectedDay - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = dates.length - 1;
    else return;
    e.preventDefault();
    if (next !== selectedDay) {
      keyboardNav.current = true;
      onSelectDay(next);
    }
  };

  return (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label="Day navigation"
      onKeyDown={handleKeyDown}
      className="grid grid-cols-7 items-center px-2 py-2 bg-white rounded-2xl border border-gray-100 shadow-card-resting overflow-x-auto snap-x snap-proximity scrollbar-none scroll-px-2"
    >
      {dates.map((d, i) => {
        const isOpen = isDateOpen(d.dateStr, dayOpenState);
        const dogCount = (bookingsByDate[d.dateStr] || []).length;
        const isActive = calendarMode !== "month" && selectedDay === i;

        return (
          <div
            key={d.dateStr}
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
