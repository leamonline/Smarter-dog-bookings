import { useRef, useEffect } from "react";
import { DayTab } from "../layout/DayTab.jsx";

export function WeekOverviewCard({
  dates,
  selectedDay,
  onSelectDay,
  bookingsByDate,
  dayOpenState,
  loading = false,
}) {
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [selectedDay]);

  return (
    <section
      aria-label="Week overview"
      className="bg-white rounded-2xl border border-gray-100 shadow-card-resting p-4"
    >
      <h2 className="text-label text-ink-muted mb-3">
        Week overview
      </h2>
      <div
        role="tablist"
        aria-label="Day navigation"
        className="grid grid-cols-7 gap-1"
      >
        {(dates || []).map((d, i) => {
          const isOpen = dayOpenState?.[d.dateStr] ?? true;
          // Pass `null` while the week's bookings are still loading so
          // each tab can suppress the count line instead of asserting
          // "0 dogs" — which looks identical to a confirmed empty day.
          const dogCount = loading
            ? null
            : (bookingsByDate?.[d.dateStr] || []).length;
          const isActive = selectedDay === i;
          return (
            <div
              key={d.dateStr}
              ref={isActive ? activeRef : null}
              className="flex justify-center"
            >
              <DayTab
                id={`week-overview-${d.dateStr}`}
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
    </section>
  );
}
