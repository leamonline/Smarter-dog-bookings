// src/components/layout/MonthTab.jsx
import { useMemo } from "react";
import { toDateStr } from "../../supabase/transforms.js";
import { useMonthBookings } from "../../supabase/hooks/useMonthBookings.js";

export function MonthTab({ currentDateObj, isActive, onClick }) {
  const monthLabel = currentDateObj.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const today = toDateStr(new Date());

  // Month-scoped booking data
  const { monthBookingsByDate: bookingsByDate } = useMonthBookings(
    currentDateObj.getFullYear(),
    currentDateObj.getMonth(),
  );

  // Build calendar grid cells
  const cells = useMemo(() => {
    const year = currentDateObj.getFullYear();
    const month = currentDateObj.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Mon=0 ... Sun=6 alignment
    const startPad = (firstDay.getDay() + 6) % 7;
    const daysInMonth = lastDay.getDate();

    const result = [];

    // Leading empty cells
    for (let i = 0; i < startPad; i++) {
      result.push(null);
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = toDateStr(new Date(year, month, d));
      result.push(dateStr);
    }

    return result;
  }, [currentDateObj]);

  return (
    <div
      className={[
        "flex-[1.1] min-w-[64px] md:min-w-[80px] rounded-t-[10px] bg-white text-center border-[1.5px] border-b-0 select-none pb-1.5 cursor-pointer transition-all snap-center shrink-0",
        isActive
          ? "border-brand-cyan opacity-100 -translate-y-[3px] z-[2] shadow-[0_-4px_14px_rgba(0,184,224,0.12)]"
          : "opacity-70 hover:opacity-90 hover:-translate-y-0.5 z-[1] shadow-[0_-2px_8px_rgba(0,0,0,0.04)] border-slate-200",
      ].join(" ")}
      onClick={onClick}
    >
      {/* Blue strip */}
      <div className="bg-brand-cyan-dark py-[3px] px-1 text-[8px] font-extrabold text-white uppercase tracking-[0.8px] rounded-t-lg whitespace-nowrap overflow-hidden text-ellipsis">
        {monthLabel}
      </div>

      {/* Mini calendar grid */}
      <div className="grid grid-cols-7 gap-0 p-[3px_4px] mt-0.5">
        {cells.map((dateStr, i) => {
          if (!dateStr) {
            return <div key={`empty-${i}`} className="w-[5px] h-[5px] mx-auto my-[1px]" />;
          }

          const isToday = dateStr === today;
          const hasBookings = !!(bookingsByDate[dateStr]?.length);

          let dotColour;
          if (isToday) {
            dotColour = "#E7546C";
          } else if (hasBookings) {
            dotColour = "#00B8E0";
          } else {
            dotColour = "#E5E7EB";
          }

          return (
            <div
              key={dateStr}
              className="w-[5px] h-[5px] rounded-sm mx-auto my-[1px]"
              style={{ background: dotColour }}
            />
          );
        })}
      </div>
    </div>
  );
}
