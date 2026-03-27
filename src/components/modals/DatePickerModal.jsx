import { useState } from "react";
import { BRAND, ALL_DAYS } from "../../constants/index.js";
import { toDateStr } from "../../supabase/transforms.js";

function getDefaultOpenForDate(date) {
  const dayOfWeek = date.getDay(); // 0 = Sun
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return ALL_DAYS[dayIndex]?.defaultOpen ?? false;
}

export function DatePickerModal({
  currentDate,
  onSelectDate,
  onClose,
  dayOpenState,
}) {
  const [viewYear, setViewYear] = useState(currentDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Mon=0
  const monthName = new Date(viewYear, viewMonth).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const isToday = (d) => {
    const t = new Date();
    return (
      d === t.getDate() &&
      viewMonth === t.getMonth() &&
      viewYear === t.getFullYear()
    );
  };

  const isSelected = (d) => {
    return (
      d === currentDate.getDate() &&
      viewMonth === currentDate.getMonth() &&
      viewYear === currentDate.getFullYear()
    );
  };

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: BRAND.white,
          borderRadius: 16,
          width: 320,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={prevMonth}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              borderRadius: 6,
              width: 32,
              height: 32,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 16 16"
              fill="none"
              stroke={BRAND.white}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 3l-5 5 5 5" />
            </svg>
          </button>

          <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.white }}>
            {monthName}
          </div>

          <button
            onClick={nextMonth}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              borderRadius: 6,
              width: 32,
              height: 32,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 16 16"
              fill="none"
              stroke={BRAND.white}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            padding: "10px 12px 4px",
          }}
        >
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div
              key={d}
              style={{
                textAlign: "center",
                fontSize: 11,
                fontWeight: 700,
                color: BRAND.textLight,
                padding: "4px 0",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            padding: "0 12px 14px",
            gap: 2,
          }}
        >
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} />;

            const cellDate = new Date(viewYear, viewMonth, d);
            const dateStr = toDateStr(cellDate);
            const isOpen =
              dayOpenState && dayOpenState[dateStr] !== undefined
                ? dayOpenState[dateStr]
                : getDefaultOpenForDate(cellDate);
            const disabled = !isOpen;

            return (
              <button
                key={d}
                onClick={() => {
                  if (!disabled) onSelectDate(new Date(viewYear, viewMonth, d));
                }}
                disabled={disabled}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: isSelected(d) ? 800 : 600,
                  cursor: disabled ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  background: isSelected(d)
                    ? BRAND.blue
                    : isToday(d)
                      ? BRAND.blueLight
                      : "transparent",
                  color: disabled
                    ? BRAND.greyLight
                    : isSelected(d)
                      ? BRAND.white
                      : isToday(d)
                        ? BRAND.blue
                        : BRAND.text,
                  transition: "all 0.1s",
                  opacity: disabled ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected(d) && !disabled) {
                    e.currentTarget.style.background = BRAND.offWhite;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected(d) && !disabled) {
                    e.currentTarget.style.background = isToday(d)
                      ? BRAND.blueLight
                      : "transparent";
                  }
                }}
              >
                {d}
              </button>
            );
          })}
        </div>

        <div style={{ padding: "0 12px 14px", textAlign: "center" }}>
          <button
            onClick={() => {
              const today = new Date();
              const todayStr = toDateStr(today);
              const isOpen =
                dayOpenState && dayOpenState[todayStr] !== undefined
                  ? dayOpenState[todayStr]
                  : getDefaultOpenForDate(today);

              if (isOpen) onSelectDate(today);
            }}
            style={{
              background: "none",
              border: `1.5px solid ${BRAND.blue}`,
              borderRadius: 8,
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 600,
              color: BRAND.blue,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Today
          </button>
        </div>
      </div>
    </div>
  );
}
